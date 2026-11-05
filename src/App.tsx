import React, { useState, useCallback, useRef, useEffect } from 'react'
import './hud.css'

import InfraMap, { type ZoneInfo } from './components/InfraMap'
import type { MarkerState } from './components/ZoneMarker'
import SideLadder from './components/SideLadder'
import InfoButton from './components/InfoButton'
import ProteinViewer from './components/ProteinViewer'
import type { Protein, ModelId, BackendId, LaneStatus, PredictResponse } from './types'
import { BACKENDS } from './backends'
import { submitRun, pollStatus, pollEvents, listEventNames, pollTpuStatus, wakeStateServer, getManifest, type TpuStatus, type SlurmEvent } from './api'
import { theme, accentAlpha, useConfig } from './config'
import SetupWizard from './components/SetupWizard'

const PROTEINS: Protein[] = [
  { id: 'brca1', name: 'BRCA1 BRCT', sequence: 'NAMEESVSREKPELTASTERVNKRMS...', uniprotId: 'P38398', description: 'Breast cancer tumor suppressor — DNA repair', residueCount: 260 },
  { id: 'p53', name: 'p53 DBD', sequence: 'SSSVPSQKTYQGSYGFRLGFLHSG...', uniprotId: 'P04637', description: 'Tumor suppressor — guardian of the genome', residueCount: 139 },
  { id: 'ace2', name: 'ACE2 PD', sequence: 'QSTIEEQAKTFLDKFNHEAEDLF...', uniprotId: 'Q9BYF1', description: 'SARS-CoV-2 receptor — COVID-19 entry point', residueCount: 597 },
  { id: 'hemoglobin', name: 'Hemoglobin α', sequence: 'MVLSPADKTNVKAAWGKVGAHAG...', uniprotId: 'P69905', description: 'Oxygen transport — sickle cell disease target', residueCount: 142 },
  { id: 'insulin', name: 'Insulin receptor', sequence: 'LRELGQGSFGMVYEGNARDIIK...', uniprotId: 'P06213', description: 'Diabetes — receptor tyrosine kinase', residueCount: 144 },
  { id: 'cftr', name: 'CFTR NBD1', sequence: 'NLTTTEVVMENVTAFWEEGFGEL...', uniprotId: 'P13569', description: 'Cystic fibrosis transmembrane regulator', residueCount: 251 },
]

const urlParams = new URLSearchParams(window.location.search)
// ?follow=1 follows runs started outside this tab. Off by default: the map opens on the home campus, as every
// demo does, and the presenter's Enter on the login node submits the run.
const FOLLOW = urlParams.get('follow') === '1'
// A link with ?run=<the run's submitted_at>, opened after the run has started, attaches the map to it at once
// instead of waiting on home for the next run.
const RUN_LINK = urlParams.get('run')

// UX phases: zoomed on the home building (config.home.buildingName) → terminal → submit → zoom out → catalog → catalog2 → results
type Phase = 'home' | 'dispatching' | 'running' | 'catalog' | 'catalog2' | 'catalog3' | 'catalog4' | 'md1' | 'md2' | 'md3' | 'pd1' | 'pd2' | 'img' | 'tpu1' | 'tpu2' | 'tpu3' | 'models1' | 'models2' | 'models3' | 'pse' | 'done'

// Enter / ArrowRight advance along SLIDE_ORDER and ArrowLeft walks it back, so the two directions can't
// drift apart. The order is the run of show's slides after home: the burst, the three workload shapes,
// TPUs, and the science on models1, where the deck ends.
const SLIDE_ORDER: Phase[] = [
  'running', 'catalog', 'pd1', 'pd2', 'img', 'catalog2', 'catalog4', 'md1', 'md2', 'md3',
  'tpu1', 'tpu2', 'tpu3', 'models1',
]

function initLaneStatus(backendId: BackendId): LaneStatus {
  const b = BACKENDS.find(b => b.id === backendId)!
  return { backendId, state: 'idle', startedAt: null, completedAt: null, elapsedMs: 0, costAccumulated: 0, result: null, error: null, talkTrackSlide: b.talkTrackSlide, talkTrackLabel: b.talkTrackLabel }
}

// Slurm node names that aren't the name of the TPU behind them. slurmd on nih-v5e-c1a (a v5e-4 in
// us-central1-a) registers as nihprotein-tpuv6eeast5a-0, and run_backend.sh reports SLURMD_NODENAME,
// so the console link, the map marker and the terminal show the TPU's own name.
const TPU_FOR_SLURM_NODE: Record<string, string> = { 'nihprotein-tpuv6eeast5a-0': 'nih-v5e-c1a' }
const nodeLabel = (vm: string) => TPU_FOR_SLURM_NODE[vm] ?? vm
const showNodeNames = (msg: string) =>
  Object.entries(TPU_FOR_SLURM_NODE).reduce((m, [slurm, tpu]) => m.split(slurm).join(tpu), msg)

// The terminal has to read in a split-view window, so each event gets one short line built from its own fields,
// and the steps between allocation and the result get none. An event this doesn't know prints its message.
function secsLabel(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 20_000 ? 1 : 0)} s`
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}
function terminalLine(ev: SlurmEvent & Record<string, any>): string | null {
  const b: string = ev.backend || ''
  const ms = ev.elapsed_ms, cost = ev.cost
  if (ev.type === 'loading' || ev.type === 'inferring') return null
  if (ev.type === 'sched_allocate' && ev.partition && ev.region) return `sched: ${ev.partition} node in ${ev.region}`
  if (ev.type === 'allocate' && ev.zone) return `${b} → ${ev.zone}`
  if (ev.type === 'done' && typeof ms === 'number' && typeof cost === 'number') return `${b} done · ${secsLabel(ms)} · $${cost.toFixed(4)}`
  return ev.msg
}


export default function App() {
  const { config } = useConfig()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [lanes, setLanes] = useState<Record<BackendId, LaneStatus>>(
    Object.fromEntries(BACKENDS.map(b => [b.id, initLaneStatus(b.id)])) as Record<BackendId, LaneStatus>
  )
  const [phase, setPhase] = useState<Phase>('home')
  const [currentProtein, setCurrentProtein] = useState<Protein>(PROTEINS[0])
  const [proteinMenuOpen, setProteinMenuOpen] = useState(false)
  const [selectedZone, setSelectedZone] = useState<ZoneInfo | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [dispatchLines, setDispatchLines] = useState<string[]>([])
  // Shown on the home terminal. The dispatch lines only render off home, so a failed submit
  // written there was invisible and the presenter saw nothing happen.
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const lineQueue = useRef<import('./api').SlurmEvent[]>([])
  const dripRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [zoneStates, setZoneStates] = useState<Record<string, MarkerState>>({})
  const [vmStates, setVmStates] = useState<Record<string, { name: string, zone: string, state: string, href: string, partition?: string }>>({})
  const [tpuStatus, setTpuStatus] = useState<TpuStatus | null>(null)

  const isMd = phase === 'md1' || phase === 'md2' || phase === 'md3'
  const isPd1 = phase === 'pd1'  // pd1 stays zoomed on us-central1 with Hyperdisk hub
  const isTpu = phase === 'tpu1' || phase === 'tpu2' || phase === 'tpu3'
  // The protein panel shows on the science slides and on the models3 ecosystem close.
  const isModels = phase === 'models1' || phase === 'models2' || phase === 'models3'
  const sideLadderHighlight: BackendId[] =
    phase === 'tpu2' ? ['af2-tpu', 'esmfold-tpu', 'boltz2-tpu'] :
    phase === 'tpu3' ? ['esmfold-tpu', 'esmfold-gpu'] :
    []
  // The ladder's TPU-vs-GPU cost ratio waits for the TPU slides, where the talk makes that comparison (summit 20e5eb5).
  const showCostRatio = SLIDE_ORDER.indexOf(phase) >= SLIDE_ORDER.indexOf('tpu1')
  const mapCenter = phase === 'home'
    ? config.home.cameraLatLng  // camera offset S+E of the home marker so the spinner sits above the terminal
    : isMd || isPd1
      ? { lat: 41.2588, lng: -95.8519 }    // us-central1 (Council Bluffs, IA)
      : isTpu
        ? { lat: 39.9623, lng: -83.0007 }  // us-east5 (Columbus, OH) — TPU east
        : { lat: 39.5, lng: -98.35 }
  const mapZoom = phase === 'home' ? (config.home.zoom ?? 12) : isMd || isPd1 || isTpu ? 6 : 5
  const mdLayer: 'storage' | 'compute' | 'topology' | null =
    phase === 'md1' ? 'storage' :
    phase === 'md2' ? 'compute' :
    phase === 'md3' ? 'topology' : null
  const showHyperdiskHub = phase === 'pd1'
  const showPartitionChips = phase === 'pd2'
  const showSliceViz = phase === 'img'

  // GCS names of event objects already queued for this run, or belonging to an earlier run.
  const seenEvents = useRef<Set<string>>(new Set())
  // Bumped by every startPolling. A poll that began under an older run drops its results.
  const pollGen = useRef(0)
  // True once this tab has seen a lane in a live state during the current run. The first poll lands
  // before predict.sh clears the previous run's blobs, which all read done or failed, so stopping on
  // all_complete alone ended polling about 2 s into every run and froze the terminal and ladder.
  const sawRunActive = useRef(false)
  // One poll at a time. A poll fetches every event object and takes longer than the 2 s interval, so
  // overlapping polls stacked up and could both ingest the same new events, printing lines twice.
  const pollBusy = useRef(false)
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalDone = useRef(false)
  // True while this tab's own submit is in flight, so the follower doesn't take the same run twice.
  const submitting = useRef(false)

  function consoleUrl(ev: { vm?: string | null, zone?: string, partition?: string, project?: string }): string {
    if (!ev.vm || !ev.zone || !ev.project) return ''
    if (ev.partition === 'tpu' || ev.partition === 'spot-tpu')
      return `https://console.cloud.google.com/compute/tpus/details/${ev.zone}/${nodeLabel(ev.vm)}?project=${ev.project}`
    return `https://console.cloud.google.com/compute/instancesDetail/zones/${ev.zone}/instances/${ev.vm}?project=${ev.project}`
  }

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (dripRef.current) clearTimeout(dripRef.current)
    lineQueue.current = []
    terminalDone.current = false
    sawRunActive.current = false
    pollBusy.current = false
    const drainNext = () => {
      if (lineQueue.current.length === 0) {
        dripRef.current = setTimeout(drainNext, 500) as any
        return
      }
      const ev = lineQueue.current.shift()! as any

      // ── Terminal: one short line per event, or none ──
      if (!terminalDone.current && ev.type !== 'node_up') {
        if (ev.type === 'complete') {
          terminalDone.current = true
        } else {
          const line = terminalLine(ev)
          if (line) setDispatchLines(prev => [...prev, showNodeNames(line)])
        }
      }

      // ── Side ladder: update lane state from structured fields ──
      const bid = ev.backend as BackendId | undefined
      if (bid && BACKENDS.some(b => b.id === bid)) {
        switch (ev.type) {
          case 'dispatch':
            setLanes(prev => ({ ...prev, [bid]: { ...prev[bid], state: 'queued' } }))
            break
          case 'sched_allocate':
          case 'allocate':
            setLanes(prev => ({ ...prev, [bid]: { ...prev[bid], state: 'allocating' } }))
            break
          case 'loading':
            setLanes(prev => ({ ...prev, [bid]: { ...prev[bid], state: 'loading' } }))
            break
          case 'inferring':
            setLanes(prev => ({ ...prev, [bid]: { ...prev[bid], state: 'inferring' } }))
            break
          case 'done':
            setLanes(prev => ({
              ...prev,
              [bid]: {
                ...prev[bid],
                state: 'done',
                elapsedMs: ev.elapsed_ms || prev[bid].elapsedMs,
                costAccumulated: ev.cost || prev[bid].costAccumulated,
                completedAt: new Date(ev.ts).getTime(),
              },
            }))
            break
          case 'failed':
            setLanes(prev => ({ ...prev, [bid]: { ...prev[bid], state: 'failed', error: ev.error || 'unknown' } }))
            break
          case 'requeue':
            setLanes(prev => ({ ...prev, [bid]: { ...prev[bid], state: 'queued' } }))
            break
        }
      }

      // ── Map markers: update zone state + VM entries from structured fields ──
      const region = ev.region as string | undefined
      if (region) {
        switch (ev.type) {
          case 'sched_allocate':
            if (ev.vm) {
              setZoneStates(prev => ({ ...prev, [region]: prev[region] === 'active' || prev[region] === 'done' ? prev[region] : 'provisioning' }))
              setVmStates(prev => {
                const existing = prev[ev.vm!]
                if (existing && (existing.state === 'active' || existing.state === 'done')) return prev
                return { ...prev, [ev.vm!]: { name: nodeLabel(ev.vm!), zone: region, state: 'provisioning', href: existing?.href || consoleUrl(ev), partition: ev.partition || existing?.partition } }
              })
            }
            break
          case 'allocate':
            if (ev.vm) {
              setZoneStates(prev => ({ ...prev, [region]: 'active' }))
              setVmStates(prev => ({ ...prev, [ev.vm!]: { name: nodeLabel(ev.vm!), zone: region, state: 'active', href: consoleUrl(ev), partition: ev.partition || prev[ev.vm!]?.partition } }))
            }
            break
          case 'done':
            if (ev.vm) {
              setVmStates(prev => prev[ev.vm!] ? { ...prev, [ev.vm!]: { ...prev[ev.vm!], state: 'done' } } : prev)
            }
            break
          case 'failed':
            if (ev.vm) {
              setVmStates(prev => prev[ev.vm!] ? { ...prev, [ev.vm!]: { ...prev[ev.vm!], state: 'failed' } } : prev)
              setZoneStates(prev => ({ ...prev, [region]: prev[region] === 'active' || prev[region] === 'done' ? prev[region] : 'failed' }))
            }
            break
          case 'spot_fail':
            setZoneStates(prev => ({ ...prev, [region]: prev[region] === 'active' || prev[region] === 'done' ? prev[region] : 'failed' }))
            setVmStates(prev => {
              const updated = { ...prev }
              let found = false
              for (const [key, vm] of Object.entries(updated)) {
                if (vm.zone === region && vm.state === 'provisioning') {
                  updated[key] = { ...vm, state: 'failed' }
                  found = true
                }
              }
              if (!found && ev.nodeset) {
                updated[`spot-${ev.nodeset}`] = { name: ev.nodeset!, zone: region, state: 'failed', href: '' }
              }
              return updated
            })
            break
        }
      }

      // Peek at next item's timestamp to calculate delay (cap at 3s for replay)
      let delay = 600
      if (lineQueue.current.length > 0) {
        const next = lineQueue.current[0] as any
        if (ev.ts && next.ts) {
          const gap = new Date(next.ts).getTime() - new Date(ev.ts).getTime()
          delay = Math.min(3000, Math.max(100, gap))
        }
      }
      dripRef.current = setTimeout(drainNext, delay) as any
    }
    dripRef.current = setTimeout(drainNext, 500) as any
    const gen = ++pollGen.current
    pollRef.current = setInterval(async () => {
      if (pollBusy.current) return
      pollBusy.current = true
      try {
        const [status, events] = await Promise.all([
          pollStatus(),
          pollEvents(seenEvents.current),
        ])
        // A newer run started while this poll was in flight: its refs aren't ours to touch.
        if (gen !== pollGen.current) return

        // Queue each event object once, keyed by its GCS name. A running count broke two ways: a
        // transient fetch failure shortened the list and replayed the whole log, and a late write
        // that sorted into the middle was skipped. Names already seen at submit are the previous
        // run's, so the first poll, which lands before predict.sh wipes the log, replays none.
        const fresh = events.filter(e => e._name && !seenEvents.current.has(e._name))
        for (const e of fresh) seenEvents.current.add(e._name!)
        const visible = fresh.filter(e => e.type !== 'node_up' && e.type !== 'slurmctld')
        if (visible.length > 0) lineQueue.current.push(...visible)

        if (Object.values(status.lanes).some(b => b.state !== 'done' && b.state !== 'failed' && b.state !== 'idle')) {
          sawRunActive.current = true
        }

        // Update the side ladder directly from the GCS lane blobs (authoritative, not drip-delayed),
        // but only once this run is live. Until predict.sh resets them, the blobs still hold the
        // previous run's finished lanes and costs.
        if (sawRunActive.current) {
          for (const [bid, blob] of Object.entries(status.lanes)) {
            const backendId = bid as BackendId
            if (!BACKENDS.some(b => b.id === backendId)) continue
            const s = blob.state as LaneStatus['state']
            if (s === 'done' || s === 'failed') {
              setLanes(prev => {
                if (prev[backendId]?.state === s) return prev
                return { ...prev, [backendId]: { ...prev[backendId], state: s, elapsedMs: blob.elapsed_ms || 0, costAccumulated: blob.cost_accumulated || 0, completedAt: blob.completed_at ? new Date(blob.completed_at).getTime() : null } }
              })
            }
          }
        }

        if (status.all_complete && sawRunActive.current) {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
        }
      } catch (err) {
        console.error('Poll error:', err)
      } finally {
        if (gen === pollGen.current) pollBusy.current = false
      }
    }, 2000)
  }, [])

  useEffect(() => {
    // A blocked fetch rejects. Catch it so the badge stays on its last value instead of
    // throwing an unhandled rejection every 10 s into the console the presenter debugs from.
    const refreshTpu = () => pollTpuStatus()
      .then(s => { if (s) setTpuStatus(s) })
      .catch(err => console.warn('TPU status poll failed:', err))
    const tpuPoll = setInterval(refreshTpu, 10000)
    refreshTpu()
    return () => {
      clearInterval(tpuPoll)
      if (pollRef.current) clearInterval(pollRef.current)
      if (dripRef.current) clearTimeout(dripRef.current)
    }
  }, [])

  // While the home slide waits for Enter, keep the state server warm: a call on load, then one every
  // 5 minutes, inside Cloud Run's 15-minute idle window. Failures only warn; the submit still works.
  useEffect(() => {
    if (phase !== 'home') return
    const wake = () => wakeStateServer().catch(err => console.warn('State server wake failed:', err))
    wake()
    const wakeTimer = setInterval(wake, 5 * 60 * 1000)
    return () => clearInterval(wakeTimer)
  }, [phase])

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [dispatchLines])

  // A run started elsewhere: fast-science's launch on the Cloud Workstation POSTs the same /api/submit that
  // Enter does. The page leaves home for running as if Enter had been pressed. `stale` holds the event names
  // listed before the new manifest appeared, which are the last run's.
  const followRun = useCallback((stale: string[], proteinId?: string) => {
    seenEvents.current = new Set(stale)
    const p = PROTEINS.find(x => x.id === proteinId)
    if (p) setCurrentProtein(p)
    setSubmitError(null)
    setDispatchLines([])
    setLanes(Object.fromEntries(BACKENDS.map(b => [b.id, initLaneStatus(b.id)])) as Record<BackendId, LaneStatus>)
    setZoneStates({})
    setVmStates({})
    setPhase('running')
    startPolling()
  }, [startPolling])

  // On home, watch job/manifest.json every 2 s. predict.sh writes a new submitted_at at the start of every run.
  useEffect(() => {
    if (phase !== 'home' || !FOLLOW) return
    let baseline: string | null | undefined
    let names: string[] = []
    let busy = false
    let stopped = false
    const tick = async () => {
      if (busy || stopped || submitting.current) return
      busy = true
      try {
        const [list, m] = await Promise.all([listEventNames().catch(() => null), getManifest()])
        if (stopped || submitting.current) return
        const at = m?.submitted_at ?? null
        if (baseline === undefined) baseline = at
        else if (at && at !== baseline) {
          stopped = true
          followRun(names, m?.protein_id)
          return
        }
        if (list) names = list
      } catch (err) {
        console.warn('Follow poll failed:', err)
      } finally {
        busy = false
      }
    }
    tick()
    const id = setInterval(tick, 2000)
    return () => { stopped = true; clearInterval(id) }
  }, [phase, followRun])

  // Opened from fast-science's link: attach to the run in flight. Event objects are named
  // job/log/<epoch ns>-<who>.json, so the ones from before this run's submitted_at are the last run's.
  useEffect(() => {
    if (!RUN_LINK) return
    Promise.all([listEventNames().catch(() => [] as string[]), getManifest()]).then(([names, m]) => {
      const at = m?.submitted_at
      if (!at || at < RUN_LINK) return  // the run isn't written yet; the follower takes it when it is
      const cutoff = BigInt(Date.parse(at)) * 1_000_000n
      const stale = names.filter(n => {
        const seq = n.slice(n.lastIndexOf('/') + 1).split('-')[0]
        return seq.length > 0 && [...seq].every(c => c >= '0' && c <= '9') && BigInt(seq) < cutoff
      })
      followRun(stale, m?.protein_id)
    }).catch(err => console.warn('Run link attach failed:', err))
  }, [followRun])

  const handleSubmit = useCallback(async () => {
    setSubmitError(null)
    submitting.current = true
    try {
      // Every event object already in the log belongs to an earlier run. Mark them seen before
      // submitting. Keyed on object names rather than timestamps, so a presenter laptop with a
      // skewed clock can't drop the new run's events.
      const stale = await listEventNames().catch(() => [] as string[])
      const result = await submitRun(currentProtein.id)
      // Attaching to a run already in flight: replay its events instead of hiding them.
      seenEvents.current = new Set(result.already_running ? [] : stale)
      // already_running = the server saw an in-flight run and didn't write a
      // new trigger. Skip the local-state reset and just attach to the
      // existing run via polling. Without this skip, a second-presser's tab
      // wipes its own lanes and looks like it submitted, then "waits".
      if (!result.already_running) {
        setDispatchLines([])
        setLanes(Object.fromEntries(BACKENDS.map(b => [b.id, initLaneStatus(b.id)])) as Record<BackendId, LaneStatus>)
        setZoneStates({})
        setVmStates({})
      }
      setPhase('running')
      startPolling()
    } catch (err) {
      console.error('Submit failed:', err)
      setSubmitError(`sbatch: error: submit failed (${err instanceof Error ? err.message : String(err)})`)
      setPhase('home')
    } finally {
      submitting.current = false
    }
  }, [currentProtein, startPolling])

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (wizardOpen) return
      if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (phase === 'home') {
          // Once this tab holds a run, in flight or finished, go back to it. Only a tab that never
          // attached to a run submits, and the server attaches that submit to a run already in flight.
          const hasRun = Object.values(lanes).some(l => l.state !== 'idle')
          if (hasRun) setPhase('running')
          else handleSubmit()
        }
        else {
          // Advance along SLIDE_ORDER; 'dispatching' sits at the same spot as 'running'.
          const i = SLIDE_ORDER.indexOf(phase === 'dispatching' ? 'running' : phase)
          if (i >= 0 && i < SLIDE_ORDER.length - 1) setPhase(SLIDE_ORDER[i + 1])
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const i = SLIDE_ORDER.indexOf(phase === 'dispatching' ? 'running' : phase)
        if (phase === 'done') setPhase(SLIDE_ORDER[SLIDE_ORDER.length - 1])
        else if (i === 0) setPhase('home')
        else if (i > 0) setPhase(SLIDE_ORDER[i - 1])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, handleSubmit, lanes, wizardOpen])

  const isRunning = phase === 'dispatching' || phase === 'running'

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#171717', overflow: 'hidden', position: 'relative' }}>
      {/* Fullscreen map — zoom driven by phase */}
      <InfraMap lanes={lanes} zoneStates={zoneStates} vmStates={vmStates} onZoneClick={setSelectedZone} center={mapCenter} zoom={mapZoom} homePosition={config.home.markerLatLng} highlightUS={phase === 'catalog2' || phase === 'catalog3' || phase === 'catalog4'} showSpokes={phase === 'catalog2' || phase === 'catalog3' || phase === 'catalog4'} showHalos={phase === 'catalog3' || phase === 'catalog4'} mdLayer={mdLayer} showHyperdiskHub={showHyperdiskHub} showPartitionChips={showPartitionChips} showSliceViz={showSliceViz} showMemberSites={phase === 'home'} />

      {/* Top-right: TPU status badge */}
      <div style={{
        // On the models slides the protein column fills the right --results-w, so the badge moves left of it.
        position: 'fixed', bottom: 15, right: isModels ? 'calc(var(--results-w) + 15px)' : 15, zIndex: 25,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(20,20,30,0.7)', backdropFilter: 'blur(8px)',
        border: `1px solid ${tpuStatus?.status === 'ready' ? 'rgba(110,180,63,0.3)' : 'rgba(248,152,29,0.3)'}`,
        borderRadius: 4, padding: '5px 10px',
        fontFamily: "freight-sans-pro, sans-serif", fontSize: 11, color: '#aaa',
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: tpuStatus?.status === 'ready' ? '#6EB43F' : tpuStatus?.status === 'loading' ? '#F8981D' : '#EF4035',
          boxShadow: tpuStatus?.status === 'ready' ? '0 0 6px #6EB43F' : 'none',
        }} />
        <span style={{ color: tpuStatus?.status === 'ready' ? '#6EB43F' : tpuStatus?.status === 'loading' ? '#F8981D' : '#EF4035' }}>
          TPU XLA {tpuStatus?.status === 'ready' ? 'Ready' : tpuStatus?.status === 'loading' ? 'Loading' : 'Offline'}
        </span>
      </div>

      {/* Top-left: Hamburger menu */}
      <div style={{ position: 'fixed', top: 15, left: 15, zIndex: 25 }}>
        <button
          onClick={() => setProteinMenuOpen(!proteinMenuOpen)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#222', padding: 8 }}
        >
          <span className="material-icons" style={{ fontSize: 28 }}>menu</span>
        </button>
      </div>

      {/* Floating menu panel */}
      {proteinMenuOpen && (
        <div onClick={() => setProteinMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 28, background: 'rgba(0,0,0,0.3)' }} />
      )}
      <div style={{
        position: 'fixed', top: 60, left: 15, zIndex: 30, width: 300,
        background: 'rgba(20,20,30,0.75)', backdropFilter: 'blur(16px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        transform: proteinMenuOpen ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-10px)',
        opacity: proteinMenuOpen ? 1 : 0,
        pointerEvents: proteinMenuOpen ? 'auto' as const : 'none' as const,
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        transformOrigin: 'top left', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontFamily: "freight-sans-pro, sans-serif", fontSize: 13, fontWeight: 600, color: theme.accent, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
            Protein Structure Prediction
          </div>
          <div style={{ fontFamily: "freight-sans-pro, sans-serif", fontSize: 10, color: '#708090', marginTop: 3 }}>{config.institution.menuSubtitle}</div>
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {PROTEINS.map(p => (
            <button key={p.id} onClick={() => { setCurrentProtein(p); setProteinMenuOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 20px', border: 'none', cursor: 'pointer',
                background: currentProtein.id === p.id ? accentAlpha(0.08) : 'transparent',
                color: currentProtein.id === p.id ? theme.accent : '#999',
                fontFamily: "freight-sans-pro, sans-serif", fontSize: 12,
                borderLeft: currentProtein.id === p.id ? `2px solid ${theme.accent}` : '2px solid transparent',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={e => { if (currentProtein.id !== p.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { if (currentProtein.id !== p.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div style={{ fontWeight: 500 }}>{p.name}</div>
              <div style={{ fontSize: 9, color: '#708090', marginTop: 2 }}>{p.residueCount} aa · {p.uniprotId}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Terminal — top edge anchored, auto-scrolls to bottom as new lines append */}
      <div ref={terminalRef} className="terminal-box" style={{
        position: 'fixed',
        // Home: original small centered box (42vh top + 25vh tall → 33vh bottom).
        // Non-home: spans from below hamburger to just above location-paper (~12vw + buffer).
        top:    phase === 'home' ? '42vh' : '75px',
        // Off home the box grows with its lines up to the location paper, so an empty black block doesn't cover
        // the map in a split-view window.
        bottom: phase === 'home' ? '33vh' : 'auto',
        maxHeight: phase === 'home' ? undefined : 'calc(100vh - 75px - 12vw - 12px)',
        // The models slides are about the results, and the open panel sits where the terminal would show through.
        opacity: isModels ? 0 : 1,
        pointerEvents: isModels ? 'none' : 'auto',
        // Tighter when anchored so more map is visible. Width animates in Phase 2.
        // At least 200px, so lines wrap less in a split-view window.
        width:  phase === 'home' ? '30vw' : 'clamp(200px, 22vw, 380px)',
        // Always anchored at left: 1vw. Centered on home via transform alone (no jiggle).
        // translateX(34vw) puts left edge at 35vw = (100-30)/2, centering the 30vw home box.
        left: '1vw',
        transform: phase === 'home' ? 'translateX(34vw)' : 'translateX(0)',
        // Two-phase: slide horizontally first (0-0.35s), THEN resize (0.35-0.70s) vertically + horizontally.
        transition:
          'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),' +
          ' top 0.35s cubic-bezier(0.4, 0, 0.2, 1) 0.35s,' +
          ' bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1) 0.35s,' +
          ' width 0.35s cubic-bezier(0.4, 0, 0.2, 1) 0.35s,' +
          ' opacity 0.3s ease',
        zIndex: 20,
      }}>
        <div style={{ color: '#708090', fontSize: '1vmin' }}>Last login: {new Date().toLocaleString()} on tty1</div>
        <div style={{ color: '#d3d3d3' }}>{`researcher@${config.home.loginNode}:~$ `}<span style={{ color: 'var(--accent-term)' }}>sbatch predict.sh \</span></div>
        <div style={{ color: 'var(--accent-term)' }}>  --model=all --target=both --protein={currentProtein.id} \</div>
        <div style={{ color: 'var(--accent-term)' }}>  --requeue --partition=tpu,gpu</div>
        {phase === 'home' && submitError && (
          <div className="terminal-line" style={{ marginTop: 6, color: '#EF4035' }}>{submitError}</div>
        )}
        {phase === 'home' && (
          <div style={{ marginTop: 6, color: '#708090', fontSize: '1.1vmin' }}>
            {submitError ? 'Press Enter to retry' : FOLLOW ? 'Waiting for a run from the workstation · Enter submits from here' : 'Press Enter to submit'}
          </div>
        )}
        {phase !== 'home' && dispatchLines.length > 0 && (
          <>
            {dispatchLines.map((line, i) => (
              <div key={i} className="terminal-line" style={{ color: '#F8981D', marginTop: i === 0 ? 6 : 0 }}>{line}</div>
            ))}
          </>
        )}
        {phase === 'done' && lineQueue.current.length === 0 && <div className="terminal-line" style={{ color: '#d3d3d3' }}>{`researcher@${config.home.loginNode}:~$ ▌`}</div>}
      </div>

      {/* Side ladder — always visible, fills with values as backends complete */}
      <SideLadder lanes={lanes} onSelect={() => {}} highlightBackends={sideLadderHighlight} showCostRatio={showCostRatio} />
      <ProteinViewer visible={isModels} />

      {/* Location paper — key only changes on home↔cloud transitions, so the protein "comes in"
          on slide 1 → slide 2 and stays put through subsequent slide navigation */}
      <div className="location-paper" key={phase === 'home' ? 'loc-home' : 'loc-cloud'}>
        <div className="location-paper-region">
          {phase === 'home' ? config.institution.fullName.toUpperCase() : (selectedZone?.label || `${config.institution.shortName.toUpperCase()} — MULTI-REGION BURST`)}
        </div>
        <div className="location-paper-name">
          {phase === 'home' ? config.home.buildingName : currentProtein.name.toUpperCase()}
        </div>
        <div className="location-paper-coords" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {phase === 'home'
            ? <span>{`Lat: ${config.home.markerLatLng.lat}, Lng: ${config.home.markerLatLng.lng}`}</span>
            // During the run: what the protein does, in plain words, under its name.
            : <span className="location-paper-desc">{currentProtein.description.replace(' — ', ' · ')}</span>}
          <SetupWizard visible={phase === 'home'} onOpenChange={setWizardOpen} />
        </div>
      </div>

      {/* Info button — top right, same style as hamburger menu */}
      <div style={{ position: 'fixed', top: 15, right: 15, zIndex: 25 }}>
      <InfoButton
        variant={isModels ? 'hero' : 'popover'}
        open={infoOpen}
        onToggle={() => setInfoOpen(!infoOpen)}
        title={
          phase === 'home' ? 'Research Computing at {institution}' :
          phase === 'dispatching' ? 'Multi-Region Burst' :
          phase === 'running' ? 'Multi-Region Burst' :
          phase === 'catalog' ? '{institution}\'s Workloads, Three Shapes' :
          phase === 'pd1' ? 'Independent GPU Jobs' :
          phase === 'pd2' ? 'Consumption Models' :
          phase === 'img' ? 'Independent GPU Jobs: Fractional & Serverless' :
          phase === 'catalog2' ? 'Data-Anchored Burst: Storage' :
          phase === 'catalog4' ? 'Data-Anchored Burst: vs AWS & Azure' :
          phase === 'md1' ? 'Tightly-Coupled Simulation' :
          phase === 'md2' ? 'H4D + Cloud RDMA (Falcon)' :
          phase === 'md3' ? 'Long Jobs Route Around Failures' :
          phase === 'tpu1' ? 'TPUs' :
          phase === 'tpu2' ? 'Why TPU Economics Are Structural' :
          phase === 'tpu3' ? 'One PyTorch File, Both Chips' :
          phase === 'models1' ? 'AI Models Only Google Has' :
          'Results'
        }
        sections={
          phase === 'home' ? [
            { body: '{intro}\n\nGoogle designs its own silicon, network transport, and datacenter hardware — attributes that make cloud bursting with Google [worth a closer look](https://www.gartner.com/doc/reprints?id=1-2NMT0142&ct=260630&st=sb). [Gartner estimates](https://www.gartner.com/doc/reprints?id=1-2NMT0142&ct=260630&st=sb) Google holds about a quarter of the world\'s cumulative AI compute capacity.\n\nOn screen is a {institution} [login node]({controllerConsoleHref}) with the command `sbatch predict.sh --model=all --target=both --protein=brca1 --requeue --partition=tpu,gpu`. When we press Enter, six inference jobs fan out from that login node to whichever Google Cloud regions have capacity.' },
          ] :
          phase === 'dispatching' || phase === 'running' ? [
            { body: '[Managed Microsoft AD](https://cloud.google.com/managed-microsoft-ad/docs/overview) can bridge on-prem [UID/GID](https://docs.cloud.google.com/filestore/docs/configure-nfsv4-managed-ad) into the cloud nodes so researchers log in with the same identity they use today.\n\n\nThis environment shows an operating model of **one Slurm, one identity, one `/data/`**. {institution} researchers keep typing `sbatch` on `{loginNode}`, the cloud partitions sit behind the same scheduler, and Slurm\'s `--requeue` retries a preempted job in the next zone with capacity.\n\nBy the way, these data centers carry Google Cloud\'s [FedRAMP High authorization](https://cloud.google.com/security/compliance/fedramp), so there\'s no separate GovCloud, and HIPAA work runs under Google\'s [BAA](https://cloud.google.com/security/compliance/hipaa).' },
          ] :
          phase === 'catalog' ? [
            { body: '{institution}\'s research computing fits three workload shapes, from quickest cloud win to deepest HPC:\n\n- **Independent GPU Jobs**{catalog:pd}\n- **Data-Anchored Burst**{catalog:db}\n- **Tightly-Coupled Simulation**{catalog:md}' },
          ] :
          phase === 'pd1' ? [
            { body: 'Single-node, single-accelerator jobs that fan out embarrassingly parallel. The live demo runs this shape: AlphaFold, ESMFold, and Boltz-2 each on a single GPU or TPU.\n\n{examples:pd1}\n\nTo scale inference, an admin can preload model weights onto [Hyperdisk ML](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/persistent-volumes/hyperdisk-ml) once. **One volume serves 2,500 instances at 1.2 TiB/s aggregate**, and loads weights up to 11.9× faster than a model registry.\n\nOne layer up at the host, [BoltVMs](https://cloud.google.com/kubernetes-engine/docs/concepts/fast-starting-nodes) are pre-initialized GPU nodes that keep the boot, driver, and container runtime warm — **GPU cold-start drops from 15 minutes to 2**.\n\nAnd at the workload layer, [Pod Snapshots](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/pod-snapshots) restore full pod state in seconds — **89% faster startup for a 70B-parameter model**. Compare with EKS or AKS where pod restart loads model weights from scratch.\n\nOne [GKE](https://cloud.google.com/blog/products/containers-kubernetes/whats-new-in-gke-at-next26) control plane manages **256,000 nodes**. AWS [announced EKS at 100,000 nodes](https://aws.amazon.com/about-aws/whats-new/2025/07/amazon-eks-100000-worker-nodes-per-cluster/) in July 2025.' },
          ] :
          phase === 'pd2' ? [
            { body: 'Three ways to pay:\n\n- **Spot**: the live run tries Spot nodes first. Slurm moves jobs from low-resource zones to a standard partition.\n- [**DWS Flex Start**](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/dws): **guaranteed GPU or TPU capacity for up to 7 days per request**, with no reservation contract or minimum commitment. AWS Capacity Blocks require fixed-duration commitment and rigid sizing. AWS also [raised H200 prices 15%](https://www.theregister.com/off-prem/2026/01/05/aws-raises-gpu-prices-15-on-a-saturday/2652706) recently.\n- [**Calendar Mode**](https://docs.cloud.google.com/compute/docs/instances/future-reservations-calendar-mode-overview): pick a start date and lock in guaranteed capacity for **up to 90 days**, for runs planned against grant milestones.\n\n{examples:pd2}' },
          ] :
          phase === 'img' ? [
            { body: 'Not every model needs a full GPU node. [Fractional GPUs](https://docs.cloud.google.com/compute/docs/accelerator-optimized-machines#g4-series) carve up an NVIDIA RTX PRO 6000 Blackwell into **1/8, 1/4, or 1/2 slices via vGPU**. A whole one holds 96 GB.\n\nFor live inference, [serverless Cloud Run with GPUs](https://cloud.google.com/run/docs/configuring/services/gpu) can serve GPUs as a managed endpoint. **RTX PRO 6000 Blackwell (96 GB), 5-second cold start, scale-to-zero, per-second billing**. AWS Lambda has no GPU support. AWS App Runner has no GPU support. [Azure Container Apps Serverless GPU](https://learn.microsoft.com/en-us/azure/container-apps/gpu-serverless-overview) caps at A100 80 GB.\n\n{examples:img}' },
          ] :
          phase === 'catalog2' ? [
            { body: 'Input datasets are large — hundreds of GB per session — but static per experiment, making this workload shape ideal for cloud bursting too. The prework incrementally syncs the cluster\'s shared filesystem, using [Storage Transfer Service](https://cloud.google.com/storage-transfer/docs/overview).\n\nCompute nodes in every burst region mount the same `/data/` paths from one multi-region bucket via [Cloud Storage FUSE](https://cloud.google.com/storage/docs/cloud-storage-fuse/overview) — one shared namespace everywhere, read anywhere and write results back.\n\n{examples:catalog2}' },
          ] :
          phase === 'catalog4' ? [
            { body: '[Rapid Cache](https://docs.cloud.google.com/storage/docs/rapid/rapid-cache) puts an SSD-backed zonal cache in each burst region in front of the multi-region bucket at **2.5 TB/s, [sub-millisecond latency](https://discuss.google.dev/t/how-to-build-an-elastic-scalable-llm-inference-platform-on-gke-using-fluid-compute/388108)**. Mountpoint for Amazon S3\'s shared cache holds only [objects up to 1 MB](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mountpoint-usage.html).\n\n**AWS S3** and **Azure Blob** have no multi-region buckets. S3 stitches one bucket per region together with replication that [lags by minutes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-troubleshoot.html). Azure\'s [paired-region copy](https://learn.microsoft.com/en-us/azure/storage/common/storage-redundancy) takes no writes until a failover. A Google [multi-region bucket](https://docs.cloud.google.com/storage/docs/locations) is one bucket, and a read after a write [is never stale](https://docs.cloud.google.com/storage/docs/consistency).' },
          ] :
          phase === 'md1' ? [
            { body: 'Tightly-coupled MPI simulation — molecular dynamics, CFD, and finite-element multiphysics. Multi-node, latency-sensitive, anchored in one region.\n\n{examples:md1}\n\nTwo storage options serve this shape: [Managed Lustre](https://docs.cloud.google.com/managed-lustre/docs/overview) with full POSIX, sub-millisecond latency at **10 TB/s** (AWS FSx for Lustre caps around 2 TB/s), or [Rapid Bucket](https://docs.cloud.google.com/storage/docs/rapid/rapid-bucket), with **15 TB/s, 20 million QPS** suited to streaming checkpoints.\n\nHierarchical namespaces in buckets allow elegant folder renames — a finished job commits with an atomic, metadata-only rename: `gcloud storage mv {bucket}/namd/run042.staging {bucket}/namd/run042` updates the path without copying or deleting the underlying files, where AWS can only rename one object at a time, not whole directories.' },
          ] :
          phase === 'md2' ? [
            { body: '[H4D](https://cloud.google.com/blog/products/compute/new-h4d-vms-optimized-for-hpc) is the HPC-optimized VM, purpose-built for tightly-coupled MPI:\n\n- **192 physical cores**, SMT off, no overcommit, one VM per host ([H4D](https://docs.cloud.google.com/compute/docs/compute-optimized-machines#h4d_series)); `h4d-standard-192` has 720 GB and `h4d-highmem-192` has 1,488 GB\n- 5th-gen AMD EPYC Turin (EPYC 9B45): 2.7 GHz base, 3.5 GHz effective, 4.1 GHz max boost ([CPU platforms](https://docs.cloud.google.com/compute/docs/cpu-platforms))\n- **200 Gb/s [Cloud RDMA](https://docs.cloud.google.com/compute/docs/instances/create-vm-with-rdma)** over Google\'s [Falcon](https://cloud.google.com/blog/topics/systems/introducing-falcon-a-reliable-low-latency-hardware-transport) transport, with Intel MPI and Open MPI ([MPI guide](https://docs.cloud.google.com/cluster-toolkit/docs/setup/configure-mpi-application))\n\nNo HPC VM on [AWS](https://docs.aws.amazon.com/ec2/latest/instancetypes/hpc.html) or [Azure](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/high-performance-compute/hx-series) pairs AMD\'s newest EPYC with more than 1 TB of memory.\n\nPublished results from the [H4D GA announcement](https://cloud.google.com/blog/products/compute/h4d-vms-now-ga): OpenFOAM Motorbike_100M **5.2× over C2D at 16 VMs with 122% efficiency** and Ansys Fluent F1_RaceCar_140M **4.1× at 32 VMs**. RDMA alone is worth **3.4× over TCP** on OpenFOAM at 4 VMs and **2.8×** on GROMACS at 32 VMs.' },
          ] :
          phase === 'md3' ? [
            { body: 'Tightly-coupled simulation highlights these unique Google features:\n\n- [**Cluster Director**](https://docs.cloud.google.com/cluster-director/docs/orchestration) — topology-aware Slurm that places the ranks of one job on the same rack.\n- [**Node Health Prediction**](https://docs.cloud.google.com/ai-hypercomputer/docs/workloads/enable-node-health-prediction) flags GPU nodes likely to degrade within the next five hours, so new work skips them. [AWS HyperPod](https://docs.aws.amazon.com/sagemaker/latest/dg/sagemaker-hyperpod-resiliency-slurm.html) replaces a node only after its health checks fail.\n- **Optical circuit switches** [rewire a TPU pod around a dead chip in seconds](https://newsletter.semianalysis.com/p/tpu-inferencex-full-steam).\n- [**Goodput**](https://cloud.google.com/blog/products/ai-machine-learning/goodput-metric-as-measure-of-ml-productivity) — paid compute hours that were actually productive. Google [publishes this as a service-level indicator](https://docs.cloud.google.com/ai-hypercomputer/docs/monitor), and Cluster Director optimizes for it.' },
          ] :
          phase === 'tpu1' ? [
            { body: '[90% of generative AI unicorns](https://cloud.google.com/blog/topics/google-cloud-next/welcome-to-google-cloud-next24) run on Google Cloud AI infrastructure. Google builds that stack end to end, from its own hardware up to its models, and offers frontier silicon on both paths, TPU and NVIDIA. [Gartner](https://www.gartner.com/doc/reprints?id=1-2NMT0142&ct=260630&st=sb) positions Google\'s TPUs as reducing *"the dependency on the clogged supply chain of NVIDIA."* Five organizations that run AI on TPU:\n\n- [Anthropic](https://www.anthropic.com/news/expanding-our-use-of-google-cloud-tpus-and-services) — **up to 1 million TPU chips for Claude**. In April 2026 it [added multiple gigawatts](https://www.anthropic.com/news/google-broadcom-partnership-compute) of next-generation TPUs starting in 2027.\n- [OpenAI](https://www.networkworld.com/article/4015386/openai-tests-google-tpus-amid-rising-inference-cost-concerns.html) — began testing Google\'s TPUs in 2025, and [plans to buy them](https://www.techtarget.com/news/openais-reported-google-tpu-deal-tests-ai-chip-economics/873139/), The Information reported in October 2026. Inference consumes over 50% of OpenAI\'s compute budget, and TPUs, specifically older ones, offer **significantly lower cost-per-inference** than NVIDIA GPUs, Forrester\'s Charlie Dai told Network World.\n- [Apple](https://arxiv.org/abs/2407.21075) — trained Apple Foundation Models on **8,192 TPUv4 chips with 52% sustained MFU**.\n- [Meta](https://siliconangle.com/2026/02/26/google-meta-reportedly-strike-new-multibillion-dollar-ai-chip-deal/) — **multi-billion-dollar TPU lease in February 2026** to train and run its next-generation models.\n- [Recursion Pharmaceuticals](https://cloud.google.com/customers/recursion) — drug discovery on TPU at scale.\n\nFor the protein models in this demo, TPUs are a second silicon path beside GPUs.' },
          ] :
          phase === 'tpu2' ? [
            { body: 'TPU TCO per hour can be **up to 30% lower than NVIDIA GB200 and 41% lower than GB300**, per [SemiAnalysis](https://newsletter.semianalysis.com/p/tpuv7-google-takes-a-swing-at-the).\n\nSemiAnalysis\'s [AgentX](https://newsletter.semianalysis.com/p/tpu-strikes-the-king) benchmark measures agentic inference per dollar:\n\n- **GLM-5.2 at FP8:** TPUv7 is the cheapest FP8 option, with **1.2× to 2.7× the tokens per dollar** of B200, B300, and MI355X from 60 to 300 tok/s/user.\n- **Qwen3.5 397B:** TPUv7 at FP8 is **1.67× better perf per dollar** than even FP4 GB300 NVL72.\n- **Kimi K3 with MXFP4 weights:** TPUv7 delivers **1.15× to 2.5× the tokens per dollar** of GB200, B200, B300, and MI355X.\n\nOn single-turn [InferenceX](https://newsletter.semianalysis.com/p/tpu-inferencex-full-steam) runs, TPUv7 Ironwood delivered **up to 50% better performance per dollar** than B200 and B300, FP8 against FP8 on Qwen3.5 397B.\n\nAt Spot pricing, [Escalante](https://cloud.google.com/blog/topics/customers/escalante-uses-jax-on-tpus-for-ai-driven-protein-design) got **3.65× the performance per dollar** from Cloud TPU v6e over an H100 for its large-scale protein design jobs.\n\nThe lanes in this demo price each fold at one accelerator\'s on-demand rate.\n\nPower matters too. A TPU v7 rack draws **70 kW versus 120 kW for an NVIDIA GB200 NVL72 rack** — 42% less power per rack.' },
          ] :
          phase === 'tpu3' ? [
            { body: 'Researchers are familiar with PyTorch. [TorchTPU](https://developers.googleblog.com/torchtpu-running-pytorch-natively-on-tpus-at-google-scale/) runs it natively on TPU, with ordinary PyTorch tensors and no wrappers. In Google\'s testing, **69% of 4,300+ Hugging Face models ran with zero code changes**. It\'s been [public](https://github.com/google-pytorch/torch_tpu) since October 19: `pip install torch-tpu`.\n\n{examples:tpu3}\n\n```python\ndef device_for(name):\n    if name == "tpu":           # NEW\n        import torch_tpu        # NEW\n    return torch.device(name)   # "tpu" or "cuda"\n```' },
          ] :
          phase === 'models1' ? [
            { body: 'ESMFold predicted the structure on the right on a Cloud TPU during this talk. In the [Nature Index 2026 corporate research rankings](https://www.nature.com/nature-index/research-leaders/2026/institution/corporate/all/global), **Alphabet ranks #5 globally and first among cloud providers**. **Microsoft ranks #26. Amazon ranks #55.**\n\n**Science model catalog:**\n\n- [**AlphaFold**](https://deepmind.google/science/alphafold/) — Nobel Prize in Chemistry 2024 (John Jumper). [Used by 3 million researchers across 190+ countries as of Q1 2026](https://deepmind.google/blog/alphafold-five-years-of-impact/).\n- [**AlphaGenome**](https://deepmind.google/science/alphagenome/) — predicts 5,930 human genome tracks across diverse cell types and 11 output modalities. Cracks the 98% of non-coding DNA that no prior model could meaningfully interpret.\n- [**AI Co-Scientist**](https://research.google/blog/accelerating-scientific-breakthroughs-with-an-ai-co-scientist/) — proposed the same antimicrobial-resistance hypothesis Prof. José Penadés\' Imperial College lab had reached through a decade of bench work — in hours, not years, which Stanford\'s Gary Peltz, who used it to identify the cancer drug Vorinostat as a liver-fibrosis candidate, [called *"consulting the oracle of Delphi"*](https://www.technologyreview.com/2026/05/22/1137813/google-i-o-showed-how-the-path-for-ai-science-is-shifting/) ([*Cell*, Sep 2025](https://www.cell.com/cell/fulltext/S0092-8674(25)00973-0); [*Advanced Science*, Sep 2025](https://advanced.onlinelibrary.wiley.com/doi/10.1002/advs.202508751)).\n- [**ERA (Empirical Research Assistance)**](https://blog.google/innovation-and-ai/technology/research/gemini-for-science-io-2026/) — beat the CDC\'s own COVID-19 hospitalization forecasting ensemble in head-to-head benchmarks ([*Nature*, May 2026](https://www.nature.com/articles/s41586-026-10658-6)).\n- [**AlphaEvolve**](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/) — agentic research engine that generates and scores thousands of algorithm variations in parallel. Manufacturing companies are using it in production to accelerate supply-chain decisions across global networks.\n- [**WeatherNext**](https://deepmind.google/science/weathernext/) — highlighted in I/O keynote as providing advance landfall warning for Hurricane Melissa to Jamaica that likely saved lives.\n- [**MedGemma**](https://developers.google.com/health-ai-developer-foundations/medgemma/model-card) (3D CT and MRI from version 1.5) and [**MedSigLIP**](https://developers.google.com/health-ai-developer-foundations/medsiglip/model-card) — open medical models for imaging work.\n- [**DeepVariant**](https://github.com/google/deepvariant), [**TxGemma-9B**](https://developers.google.com/health-ai-developer-foundations/txgemma/model-card), [**AlphaEarth Foundations**](https://deepmind.google/blog/alphaearth-foundations-helps-map-our-planet-in-unprecedented-detail/), and many more — variant calling, therapeutic LLM, environmental sensing.' },
          ] :
          [
            { body: 'Inference complete — results content TBD.' },
          ]
        }
      />
      </div>

    </div>
  )
}
