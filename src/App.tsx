import React, { useState, useCallback, useRef, useEffect } from 'react'
import './hud.css'

import InfraMap, { type ZoneInfo } from './components/InfraMap'
import type { MarkerState } from './components/ZoneMarker'
import SideLadder from './components/SideLadder'
import InfoButton from './components/InfoButton'
import ProteinViewer from './components/ProteinViewer'
import type { Protein, ModelId, BackendId, LaneStatus, PredictResponse } from './types'
import { BACKENDS } from './backends'
import { submitRun, pollStatus, pollEvents, listEventNames, pollTpuStatus, wakeStateServer, type TpuStatus } from './api'
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

// UX phases: zoomed on the home building (config.home.buildingName) → terminal → submit → zoom out → catalog → catalog2 → results
type Phase = 'home' | 'dispatching' | 'running' | 'catalog' | 'catalog2' | 'catalog3' | 'catalog4' | 'md1' | 'md2' | 'md3' | 'pd1' | 'pd2' | 'img' | 'tpu1' | 'tpu2' | 'tpu3' | 'models1' | 'models2' | 'models3' | 'pse' | 'done'

function initLaneStatus(backendId: BackendId): LaneStatus {
  const b = BACKENDS.find(b => b.id === backendId)!
  return { backendId, state: 'idle', startedAt: null, completedAt: null, elapsedMs: 0, costAccumulated: 0, result: null, error: null, talkTrackSlide: b.talkTrackSlide, talkTrackLabel: b.talkTrackLabel }
}

// Slurm node names that aren't the name of the TPU behind them. slurmd on the TPU nih-v6e-e5b
// (us-east5-b) registers as nihprotein-tpuv6eeast5a-0, and run_backend.sh reports SLURMD_NODENAME,
// so the console link needs the TPU's own name.
const TPU_FOR_SLURM_NODE: Record<string, string> = { 'nihprotein-tpuv6eeast5a-0': 'nih-v6e-e5b' }

// Enter / ArrowRight advance along SLIDE_ORDER and ArrowLeft walks it back, so the two directions
// can't drift apart. The summit cut presents 10 slides after home; 'models1' is the last manual slide.
const SLIDE_ORDER: Phase[] = [
  'running', 'catalog', 'pd1', 'img', 'catalog2', 'catalog4', 'md1', 'tpu1', 'tpu3', 'models1',
]

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
  const isModels = phase === 'models1' || phase === 'models2' || phase === 'models3'
  const sideLadderHighlight: BackendId[] =
    phase === 'tpu2' ? ['af2-tpu', 'esmfold-tpu', 'boltz2-tpu'] :
    phase === 'tpu3' ? ['esmfold-tpu', 'esmfold-gpu'] :
    []
  const mapCenter = phase === 'home'
    ? config.home.cameraLatLng  // camera offset S+E of the home marker so the spinner sits above the terminal
    : isMd || isPd1
      ? { lat: 41.2588, lng: -95.8519 }    // us-central1 (Council Bluffs, IA)
      : isTpu
        ? { lat: 39.9623, lng: -83.0007 }  // us-east5 (Columbus, OH) — TPU east
        : { lat: 39.5, lng: -98.35 }
  const mapZoom = phase === 'home' ? 12 : isMd || isPd1 || isTpu ? 6 : 5
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

  function consoleUrl(ev: { vm?: string | null, zone?: string, partition?: string, project?: string }): string {
    if (!ev.vm || !ev.zone || !ev.project) return ''
    if (ev.partition === 'tpu' || ev.partition === 'spot-tpu')
      return `https://console.cloud.google.com/compute/tpus/details/${ev.zone}/${TPU_FOR_SLURM_NODE[ev.vm] ?? ev.vm}?project=${ev.project}`
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

      // ── Terminal: show msg for all visible event types ──
      if (!terminalDone.current && ev.type !== 'node_up') {
        if (ev.type === 'complete') {
          terminalDone.current = true
        } else {
          setDispatchLines(prev => [...prev, ev.msg])
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
                return { ...prev, [ev.vm!]: { name: ev.vm!, zone: region, state: 'provisioning', href: existing?.href || consoleUrl(ev), partition: ev.partition || existing?.partition } }
              })
            }
            break
          case 'allocate':
            if (ev.vm) {
              setZoneStates(prev => ({ ...prev, [region]: 'active' }))
              setVmStates(prev => ({ ...prev, [ev.vm!]: { name: ev.vm!, zone: region, state: 'active', href: consoleUrl(ev), partition: ev.partition || prev[ev.vm!]?.partition } }))
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

  const handleSubmit = useCallback(async () => {
    setSubmitError(null)
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
    }
  }, [currentProtein, startPolling])

  // Enter + Arrow keys walk SLIDE_ORDER: home → run → catalog → … → pse
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (wizardOpen) return
      if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (phase === 'home') {
          // If a run is already in flight (user navigated back here), just go forward without re-submitting
          const hasActiveRun = Object.values(lanes).some(l => l.state !== 'idle' && l.state !== 'done' && l.state !== 'failed')
          if (hasActiveRun) setPhase('running')
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
    <div style={{ width: '100vw', height: '100vh', background: '#202124', overflow: 'hidden', position: 'relative' }}>
      {/* Fullscreen map — zoom driven by phase */}
      <InfraMap lanes={lanes} zoneStates={zoneStates} vmStates={vmStates} onZoneClick={setSelectedZone} center={mapCenter} zoom={mapZoom} homePosition={config.home.markerLatLng} highlightUS={phase === 'catalog2' || phase === 'catalog3' || phase === 'catalog4'} showSpokes={phase === 'catalog2' || phase === 'catalog3' || phase === 'catalog4'} showHalos={phase === 'catalog3' || phase === 'catalog4'} mdLayer={mdLayer} showHyperdiskHub={showHyperdiskHub} showPartitionChips={showPartitionChips} showSliceViz={showSliceViz} />

      {/* Top-right: TPU status badge */}
      <div style={{
        position: 'fixed', bottom: 15, right: 15, zIndex: 25,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(255,255,255,0.97)', border: '1px solid #dadce0',
        boxShadow: '0 1px 2px rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
        borderRadius: 16, padding: '5px 12px',
        fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500, color: '#3c4043',
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: tpuStatus?.status === 'ready' ? '#34A853' : tpuStatus?.status === 'loading' ? '#FBBC04' : '#EA4335',
          boxShadow: tpuStatus?.status === 'ready' ? '0 0 6px #34A853' : 'none',
        }} />
        <span style={{ color: '#3c4043' }}>
          TPU XLA {tpuStatus?.status === 'ready' ? 'Ready' : tpuStatus?.status === 'loading' ? 'Loading' : 'Offline'}
        </span>
      </div>

      {/* Top-left: Hamburger menu */}
      <div style={{ position: 'fixed', top: 15, left: 15, zIndex: 25 }}>
        <button
          onClick={() => setProteinMenuOpen(!proteinMenuOpen)}
          onMouseDown={e => e.preventDefault()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#202124', padding: 8 }}
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
        background: 'rgba(255,255,255,0.98)',
        border: '1px solid #dadce0', borderRadius: 12,
        boxShadow: '0 1px 3px rgba(60,64,67,0.3), 0 4px 8px 3px rgba(60,64,67,0.15)',
        transform: proteinMenuOpen ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-10px)',
        opacity: proteinMenuOpen ? 1 : 0,
        pointerEvents: proteinMenuOpen ? 'auto' as const : 'none' as const,
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        transformOrigin: 'top left', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #e8eaed' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: theme.accent, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
            Protein Structure Prediction
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, color: '#5f6368', marginTop: 3 }}>{config.institution.menuSubtitle}</div>
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {PROTEINS.map(p => (
            <button key={p.id} onClick={() => { setCurrentProtein(p); setProteinMenuOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 20px', border: 'none', cursor: 'pointer',
                background: currentProtein.id === p.id ? accentAlpha(0.08) : 'transparent',
                color: currentProtein.id === p.id ? theme.accent : '#3c4043',
                fontFamily: 'var(--font-display)', fontSize: 12,
                borderLeft: currentProtein.id === p.id ? `2px solid ${theme.accent}` : '2px solid transparent',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={e => { if (currentProtein.id !== p.id) (e.currentTarget as HTMLElement).style.background = 'rgba(60,64,67,0.06)' }}
              onMouseLeave={e => { if (currentProtein.id !== p.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div style={{ fontWeight: 500 }}>{p.name}</div>
              <div style={{ fontSize: 9, color: '#5f6368', marginTop: 2 }}>{p.residueCount} aa · {p.uniprotId}</div>
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
        bottom: phase === 'home' ? '33vh' : 'calc(12vw + 12px)',
        // Tighter when anchored so more map is visible. Width animates in Phase 2.
        width:  phase === 'home' ? '30vw' : '22vw',
        // Always anchored at left: 1vw. Centered on home via transform alone (no jiggle).
        // translateX(34vw) puts left edge at 35vw = (100-30)/2, centering the 30vw home box.
        left: '1vw',
        transform: phase === 'home' ? 'translateX(34vw)' : 'translateX(0)',
        // Two-phase: slide horizontally first (0-0.35s), THEN resize (0.35-0.70s) vertically + horizontally.
        transition:
          'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),' +
          ' top 0.35s cubic-bezier(0.4, 0, 0.2, 1) 0.35s,' +
          ' bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1) 0.35s,' +
          ' width 0.35s cubic-bezier(0.4, 0, 0.2, 1) 0.35s',
        zIndex: 20,
      }}>
        <div style={{ color: '#9aa0a6', fontSize: '1vmin' }}>Last login: {new Date().toLocaleString()} on tty1</div>
        <div style={{ color: '#e8eaed' }}>{`researcher@${config.home.loginNode}:~$ `}<span style={{ color: 'var(--accent-term)' }}>sbatch predict.sh \</span></div>
        <div style={{ color: 'var(--accent-term)' }}>  --model=all --target=both --protein={currentProtein.id} \</div>
        <div style={{ color: 'var(--accent-term)' }}>  --requeue --partition=tpu,gpu</div>
        {phase === 'home' && submitError && (
          <div className="terminal-line" style={{ marginTop: 6, color: '#EA4335' }}>{submitError}</div>
        )}
        {phase === 'home' && (
          <div style={{ marginTop: 6, color: '#9aa0a6', fontSize: '1.1vmin' }}>{submitError ? 'Press Enter to retry' : 'Press Enter to submit'}</div>
        )}
        {phase !== 'home' && dispatchLines.length > 0 && (
          <>
            {dispatchLines.map((line, i) => (
              <div key={i} className="terminal-line" style={{ color: '#FDD663', marginTop: i === 0 ? 6 : 0 }}>{line}</div>
            ))}
          </>
        )}
        {phase === 'done' && lineQueue.current.length === 0 && <div className="terminal-line" style={{ color: '#e8eaed' }}>{`researcher@${config.home.loginNode}:~$ ▌`}</div>}
      </div>

      {/* Side ladder — always visible, fills with values as backends complete */}
      <SideLadder lanes={lanes} onSelect={() => {}} highlightBackends={sideLadderHighlight} />
      <ProteinViewer visible={isModels} />

      {/* Location paper — key only changes on home↔cloud transitions, so the protein "comes in"
          on slide 1 → slide 2 and stays put through subsequent slide navigation */}
      <div className="location-paper" key={phase === 'home' ? 'loc-home' : 'loc-cloud'}>
        <div className="location-paper-region">
          {phase === 'home' ? config.institution.fullName.toUpperCase() : (selectedZone?.label || `${config.institution.shortName.toUpperCase()} — MULTI-REGION BURST`)}
        </div>
        <div className="location-paper-name">
          {phase === 'home' ? config.home.buildingName : currentProtein.name}
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
          phase === 'home' ? 'AI Infrastructure Initiative' :
          phase === 'dispatching' ? 'Multi-Region Burst' :
          phase === 'running' ? 'Multi-Region Burst' :
          phase === 'catalog' ? 'Research Applications Catalog' :
          phase === 'catalog2' ? 'Data-Anchored Burst: Storage' :
          phase === 'catalog3' ? 'Data-Anchored Burst: Caching' :
          phase === 'catalog4' ? 'Data-Anchored Burst: vs AWS & Azure' :
          phase === 'md1' ? 'Tightly-Coupled Simulation' :
          phase === 'md2' ? 'H4D + Cloud RDMA (Falcon)' :
          phase === 'md3' ? 'Five MPI-Specific Google Features' :
          phase === 'pd1' ? 'Independent GPU Jobs' :
          phase === 'pd2' ? 'Consumption Models' :
          phase === 'img' ? 'Independent GPU Jobs: Fractional & Serverless' :
          phase === 'tpu1' ? 'TPUs' :
          phase === 'tpu2' ? 'Why TPU Economics Are Structural' :
          phase === 'tpu3' ? 'PyTorch on TPU: ESMFold in 5 Lines' :
          phase === 'models1' ? 'AI Models Only Google Has' :
          phase === 'models2' ? 'Google Science Bench' :
          phase === 'models3' ? 'Ecosystem Partnerships' :
          phase === 'pse' ? 'Public Sector Economics' :
          'Results'
        }
        sections={
          phase === 'home' ? [
            { body: 'Google designs its own silicon, network transport, and datacenter hardware — attributes that make bursting to Google <a href="https://www.gartner.com/doc/reprints?id=1-2NMT0142&ct=260630&st=sb" target="_blank">worth a closer look</a>.\n\nOn screen is an on-prem Slurm login node: press Enter and <code>sbatch predict.sh --model=all --target=both --protein=brca1 --requeue --partition=tpu,gpu</code> bursts six inference jobs across both TPU and GPU partitions to whichever cloud regions have capacity.' },
          ] :
          phase === 'dispatching' || phase === 'running' ? [
            { body: '<a href="https://cloud.google.com/managed-microsoft-ad/docs/overview" target="_blank">Managed AD</a> bridges researchers\' on-prem UID/GID into the cloud, so they log in with the same identity they use today. It\'s one Slurm, one identity, one <code>/data</code> — researchers submit <code>sbatch</code> exactly as they do on-prem, and Cloud Storage FUSE mounts the same paths.\n\nAnd capacity takes care of itself: if a zone can\'t grab a node, Slurm\'s <code>--requeue</code> waits and retries in the next region — you\'ll see the jobs move across west, central, and east regions on their own.' },
          ] :
          phase === 'catalog' ? [
            { body: 'Every research institution runs hundreds of software titles across its clusters. We sort them into three workload shapes, ordered from quickest cloud win to deepest HPC:\n\n<ul style="margin: 8px 0; padding-left: 18px; list-style-type: none;"><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><b>Independent GPU Jobs</b></li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><b>Data-Anchored Burst</b></li><li style="margin-bottom: 0; padding-left: 12px; border-left: 2px solid #dadce0;"><b>Tightly-Coupled Simulation</b></li></ul>' },
          ] :
          phase === 'catalog2' ? [
            { body: 'Input datasets are large — hundreds of GB per session — but static per experiment, which makes this an ideal burst profile.\n\nOnly Google has multi-region buckets: compute nodes in every burst region mount the same <code>/data/</code> paths via <a href="https://cloud.google.com/storage/docs/cloud-storage-fuse/overview" target="_blank">Cloud Storage FUSE</a> — one shared namespace everywhere, read anywhere and write results back.' },
          ] :
          phase === 'catalog3' ? [
            { body: '<a href="https://docs.cloud.google.com/storage/docs/rapid/rapid-cache" target="_blank">Rapid Cache</a> puts an SSD-backed zonal cache in each burst region in front of the multi-region bucket at <b>2.5 TB/s, sub-millisecond latency</b> — repeated reads are served locally, so you don\'t re-pay cross-region transfer on cache hits.\n\n<a href="https://docs.cloud.google.com/kubernetes-engine/docs/how-to/image-streaming" target="_blank">Image Streaming</a> has a workload starting in seconds even on 60GB containers.' },
          ] :
          phase === 'catalog4' ? [
            { body: '<b>AWS S3</b> and <b>Azure Blob</b> have no multi-region buckets — and no equivalent to <a href="https://docs.cloud.google.com/storage/docs/rapid/rapid-cache" target="_blank">Rapid Cache</a> or <a href="https://docs.cloud.google.com/storage/docs/rapid/rapid-bucket" target="_blank">Rapid Bucket</a> at any tier. Our storage is uniquely suited in the market for AI infrastructure workloads.' },
          ] :
          phase === 'md1' ? [
            { body: 'Tightly-coupled MPI simulation — molecular dynamics, CFD, and finite-element multiphysics. Multi-node, latency-sensitive, anchored in one region.\n\nThe hot scratch tier is <a href="https://docs.cloud.google.com/managed-lustre/docs/overview" target="_blank">Managed Lustre</a> with full POSIX at <b>10 TB/s</b> — 5 to 20× faster than AWS FSx for Lustre or Azure Managed Lustre. And Google keeps these runs alive:\n\n<ul style="margin: 8px 0; padding-left: 18px; list-style-type: none;"><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://docs.cloud.google.com/cluster-director/docs/orchestration" target="_blank"><b>Cluster Director</b></a> — topology-aware Slurm that colocates ranks on the same rack.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://docs.cloud.google.com/ai-hypercomputer/docs/workloads/enable-node-health-prediction" target="_blank"><b>Node Health Prediction</b></a> — drains a degrading node up to 5 hours before it fails.</li><li style="margin-bottom: 0; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://cloud.google.com/blog/products/networking/introducing-virgo-megascale-data-center-fabric" target="_blank"><b>Optical Circuit Switching</b></a> — reroutes around a dead chip mid-job, no restart.</li></ul>' },
          ] :
          phase === 'md2' ? [
            { body: '<a href="https://cloud.google.com/blog/products/compute/new-h4d-vms-optimized-for-hpc" target="_blank">H4D</a> is the HPC-optimized VM, purpose-built for tightly-coupled MPI. Hardware: <b>5th-gen AMD EPYC Turin, 192 vCPUs, up to 1.5 TB RAM, 200 Gbps</b> <a href="https://docs.cloud.google.com/compute/docs/instances/create-vm-with-rdma" target="_blank">Cloud RDMA</a> via <a href="https://cloud.google.com/blog/products/networking/understanding-cloud-rdma-scalable-high-performance-networking" target="_blank">Falcon</a> — higher RAM and newer CPU generation than competitors. Published benchmarks: <a href="https://cloud.google.com/blog/products/compute/new-h4d-vms-optimized-for-hpc" target="_blank">GROMACS Lignocellulose</a> at <b>2.8× over TCP</b> on 32 VMs with Falcon; Ansys Fluent <b>4.1× vs C2D</b>; OpenFOAM <b>5.2× vs C2D with 122% superlinear efficiency</b>.' },
          ] :
          phase === 'md3' ? [
            { body: 'Tightly-coupled simulation highlights these unique Google features:\n\n<ul style="margin: 8px 0; padding-left: 18px; list-style-type: none;"><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://docs.cloud.google.com/cluster-director/docs/orchestration" target="_blank"><b>Topology-aware Slurm via Cluster Director</b></a> — <a href="https://docs.cloud.google.com/ai-hypercomputer/docs/networking-overview" target="_blank">AWS and Azure do not expose the hierarchy to the scheduler — placement is random</a>, vs. Cluster Director can colocate on the same rack.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://docs.cloud.google.com/kubernetes-engine/docs/how-to/machine-learning/training/multi-tier-checkpointing" target="_blank">Multi-Tier Checkpointing</a> — writes to local RAM disk, replicates to peer nodes, async-uploads to Cloud Storage. When a long-running job restarts, it pulls from the nearest tier: local SSD first, peer node next, GCS last.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://docs.cloud.google.com/ai-hypercomputer/docs/workloads/enable-node-health-prediction" target="_blank">Node Health Prediction</a> — predicts which nodes will degrade in the next 5 hours based on metadata, heat, and packet integrity, and drains them before disruptive symptoms surface. AWS SageMaker notifies after the fact.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://cloud.google.com/blog/products/networking/introducing-virgo-megascale-data-center-fabric" target="_blank">Optical Circuit Switching (Palomar)</a> — when a chip fails mid-job, OCS physically reroutes the topology around the failed chip without restarting. Anthropic uses this to survive daily failures across 1 million chips.</li><li style="margin-bottom: 0; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://cloud.google.com/blog/products/ai-machine-learning/goodput-metric-as-measure-of-ml-productivity" target="_blank">Goodput</a> — paid compute hours that were actually productive. Google publishes this as a service-level indicator, and Cluster Director optimizes for it.</li></ul>' },
          ] :
          phase === 'pd1' ? [
            { body: 'Single-node, single-GPU jobs that fan out embarrassingly parallel — the live demo runs this shape: AlphaFold, ESMFold, and Boltz-2, each on a single GPU or TPU.\n\n<ul style="margin: 8px 0; padding-left: 18px; list-style-type: none;"><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://docs.cloud.google.com/kubernetes-engine/docs/how-to/persistent-volumes/hyperdisk-ml" target="_blank"><b>Hyperdisk ML</b></a> serves weights from one volume to <b>2,500 instances at 1.2 TiB/s</b>.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://cloud.google.com/kubernetes-engine/docs/concepts/fast-starting-nodes" target="_blank"><b>BoltVMs</b></a> cut H100 cold-start from <b>15 minutes to 2</b>.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://docs.cloud.google.com/kubernetes-engine/docs/how-to/image-streaming" target="_blank"><b>Image Streaming</b></a> starts a workload in seconds even on a 60 GB container.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://docs.cloud.google.com/kubernetes-engine/docs/how-to/checkpoint-restore" target="_blank"><b>Pod Snapshots</b></a> restore a 70B model <b>80% faster</b> than a cold AWS EKS/AKS pod.</li><li style="margin-bottom: 0; padding-left: 12px; border-left: 2px solid #dadce0;">A single <a href="https://cloud.google.com/blog/products/containers-kubernetes/whats-new-in-gke-at-next26" target="_blank"><b>GKE</b></a> control plane manages <b>a million chips</b> across 256,000 nodes.</li></ul>' },
          ] :
          phase === 'pd2' ? [
            { body: 'The background sbatch demo follows the Independent GPU Jobs pattern, dispatching across consumption models:\n\n<ul style="margin: 8px 0; padding-left: 18px; list-style-type: none;"><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://cloud.google.com/compute/docs/instances/committed-use-discounts-overview" target="_blank">3-Year CUD + Zonal Reservation</a> — Lowest cost tier — competitive with on-prem $/GPU-hr. Locks in pricing for the full term; the reservation guarantees the hardware is there.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://docs.cloud.google.com/kubernetes-engine/docs/concepts/dws" target="_blank">DWS Flex Start</a> — <b>guaranteed GPU or TPU capacity for up to 7 days per request</b>, with no reservation contract or minimum commitment. AWS Capacity Blocks require fixed-duration commitment and rigid sizing. AWS also <a href="https://www.datacenterknowledge.com/cloud/aws-raises-h200-prices" target="_blank">raised H200 prices 15%</a> recently.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://docs.cloud.google.com/compute/docs/instances/future-reservations-calendar-mode-overview" target="_blank">Calendar Mode</a> — pick a start date and lock in guaranteed capacity for <b>up to 90 days</b>. Useful for runs planned against grant milestones.</li></ul>\nGoogle\'s <a href="https://cloud.google.com/blog/products/containers-kubernetes/whats-new-in-gke-at-next26" target="_blank">GKE hypercluster</a> <b>manages 1 million chips across 256,000 nodes spanning multiple regions under a single control plane</b>. AWS announced EKS at 100,000 nodes in July 2025.\n\n<a href="https://docs.cloud.google.com/kubernetes-engine/docs/concepts/about-compute-classes" target="_blank">Custom Compute Classes</a> act as the routing policy engine across all three workload shapes — Independent GPU Jobs fan across TPU+GPU, Data-Anchored Burst stages from the shared multi-region bucket, and Tightly-Coupled Simulation heads to compute-optimized HPC VMs with RDMA — without the researcher choosing the backend.' },
          ] :
          phase === 'img' ? [
            { body: 'Not every model needs a full GPU node. <a href="https://docs.cloud.google.com/compute/docs/accelerator-optimized-machines#g4-series" target="_blank">Fractional GPUs</a> carve up an NVIDIA RTX PRO 6000 Blackwell into <b>1/8, 1/4, or 1/2 slices via vGPU</b>.\n\n<a href="https://cloud.google.com/run/docs/configuring/services/gpu" target="_blank">Serverless Cloud Run with GPUs</a> serves a fine-tuned model as a managed endpoint. <b>L4 (24 GB) or RTX PRO 6000 Blackwell (96 GB), 5-second cold start, scale-to-zero, per-second billing</b>. AWS Lambda has no GPU support. AWS App Runner has no GPU support. <a href="https://learn.microsoft.com/en-us/azure/container-apps/gpu-serverless-overview" target="_blank">Azure Container Apps Serverless GPU</a> caps at A100 80 GB.' },
          ] :
          phase === 'tpu1' ? [
            { body: 'About 90% of <a href="https://cloud.google.com/ai-infrastructure" target="_blank">gen-AI unicorns run on Google Cloud</a> — and organizations that run AI at scale use TPU:\n\n<ul style="margin: 8px 0; padding-left: 18px; list-style-type: none;"><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://www.anthropic.com/news/expanding-our-use-of-google-cloud-tpus-and-services" target="_blank"><b>Anthropic</b></a> — up to 1 million TPU chips for Claude.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://www.networkworld.com/article/4015386/openai-tests-google-tpus-amid-rising-inference-cost-concerns.html" target="_blank"><b>OpenAI</b></a> — production ChatGPT inference on TPU, ~20–40% cheaper than equivalent GPU inference.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://machinelearning.apple.com/research/introducing-apple-foundation-models" target="_blank"><b>Apple</b></a> — trained Apple Foundation Models on 8,192 TPUv4 chips at 52% MFU.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://siliconangle.com/2026/02/26/google-meta-reportedly-strike-new-multibillion-dollar-ai-chip-deal/" target="_blank"><b>Meta</b></a> — multi-billion-dollar TPU lease (Feb 2026) for Llama training.</li><li style="margin-bottom: 0; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://cloud.google.com/customers/recursion" target="_blank"><b>Recursion</b></a> — drug discovery on TPU at scale.</li></ul>\nThe economics are structural: TPU TCO is <b>30–41% below</b> NVIDIA GB200/GB300 (<a href="https://newsletter.semianalysis.com/p/tpuv7-google-takes-a-swing-at-the" target="_blank">SemiAnalysis</a>), at higher utilization (40% vs 30% MFU), on <b>42% less power</b> per rack.' },
          ] :
          phase === 'tpu2' ? [
            { body: 'TPU TCO per hour is <b>30% lower than NVIDIA GB200 and 41% lower than GB300</b>, per <a href="https://newsletter.semianalysis.com/p/tpuv7-google-takes-a-swing-at-the" target="_blank">SemiAnalysis</a>. Realized model FLOPS utilization is <b>40% on TPU versus 30% on GPU — 52% lower cost per effective petaFLOP</b> (Anthropic\'s <a href="https://www.anthropic.com/news/claude-opus-4-5" target="_blank">67% price cut on Claude Opus 4.5</a> is a direct consequence of running on TPU).\n\nPower matters too. A TPU v7 rack draws <b>70 kW versus 120 kW for an NVIDIA GB200 NVL72 rack</b> — 42% less power per rack. Institutions tracking sustainable computing increasingly treat per-petaFLOP power as a line item.' },
          ] :
          phase === 'tpu3' ? [
            { body: 'Researchers are familiar with PyTorch; historically TPU required JAX. <a href="https://developers.googleblog.com/torchtpu-running-pytorch-natively-on-tpus-at-google-scale/" target="_blank">TorchTPU</a> runs PyTorch natively on TPU, and runs 70% of Hugging Face models with zero code changes. In this demo, the diff between our <a href="https://github.com/WandLZhang/ai-infra-demo-proteins/blob/main/backends/esmfold-gpu/predict.py" target="_blank">GPU backend</a> and <a href="https://github.com/WandLZhang/ai-infra-demo-proteins/blob/main/backends/esmfold-tpu/predict.py" target="_blank">TPU backend</a> for ESMFold is just <b>five lines</b>:<pre style="background: #202124; border: 1px solid #3c4043; padding: 12px; margin: 10px 0; overflow-x: auto; font-size: 11px; line-height: 1.45; color: #e8eaed;"><code>import torch\n<span style="color: var(--accent-term);">import torch_xla                              # NEW</span>\n<span style="color: var(--accent-term);">torch_xla.experimental.eager_mode(True)       # NEW</span>\n<span style="color: var(--accent-term);">import torch_xla.core.xla_model as xm         # NEW</span>\n\n<span style="color: var(--accent-term);">device = xm.xla_device()                      # CHANGED (was "cuda")</span>\nmodel = EsmForProteinFolding.from_pretrained(_MODEL_ID).to(device)\nwith torch.no_grad():\n    output = model(**inputs)\n<span style="color: var(--accent-term);">xm.mark_step()                                # NEW</span></code></pre>' },
          ] :
          phase === 'models1' ? [
            { body: 'In the <a href="https://www.nature.com/nature-index/research-leaders/2026/institution/corporate/all/global" target="_blank">Nature Index 2026 corporate research rankings</a>, <b>Alphabet is #5 globally</b>, ahead of every other tech company. <b>Microsoft is #26. Amazon is #55.</b> Google publishes <b>300+ health publications a year, 15+ in JAMA, 50+ in Nature</b>.\n\n<b>Science model catalog:</b>\n\n<ul style="margin: 8px 0; padding-left: 18px; list-style-type: none;"><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://deepmind.google/technologies/alphafold/" target="_blank"><b>AlphaFold</b></a> — Nobel Prize in Chemistry 2024 (John Jumper). <a href="https://deepmind.google/blog/alphafold-five-years-of-impact/" target="_blank">Used by 3 million researchers across 190+ countries as of Q1 2026</a>, the most-cited tool in life-science AI history.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://deepmind.google/science/alphagenome/" target="_blank"><b>AlphaGenome</b></a> — predicts 5,930 human genome tracks across diverse cell types and 11 output modalities. Cracks the 98% of non-coding DNA that no prior model could meaningfully interpret.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://research.google/blog/accelerating-scientific-breakthroughs-with-an-ai-co-scientist/" target="_blank"><b>AI Co-Scientist</b></a> — proposed the same antimicrobial-resistance hypothesis Prof. José Penadés\' Imperial College lab had reached through a decade of bench work — in hours, not years, which Stanford\'s Gary Peltz, who used it to identify the cancer drug Vorinostat as a liver-fibrosis candidate, <a href="https://www.technologyreview.com/2026/05/22/1137813/google-i-o-showed-how-the-path-for-ai-science-is-shifting/" target="_blank">called <i>"consulting the oracle of Delphi"</i></a> (<a href="https://www.cell.com/cell/fulltext/S0092-8674(25)00973-0" target="_blank"><i>Cell</i>, Sep 2025</a>; <a href="https://advanced.onlinelibrary.wiley.com/doi/10.1002/advs.202508751" target="_blank"><i>Advanced Science</i>, Sep 2025</a>).</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://blog.google/innovation-and-ai/technology/research/gemini-for-science-io-2026/" target="_blank"><b>ERA (Empirical Research Assistance)</b></a> — beat the CDC\'s own COVID-19 hospitalization forecasting ensemble in head-to-head benchmarks (<a href="https://www.nature.com/articles/s41586-026-10658-6" target="_blank"><i>Nature</i>, May 2026</a>).</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://deepmind.google/technologies/alphaevolve/" target="_blank"><b>AlphaEvolve</b></a> — agentic research engine that generates and scores thousands of algorithm variations in parallel. Manufacturing companies are using it in production to accelerate supply-chain decisions across global networks.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://research.google/blog/fast-accurate-climate-modeling-with-neuralgcm/" target="_blank"><b>WeatherNext</b></a> — highlighted in I/O keynote as providing advance landfall warning for Hurricane Melissa to Jamaica that likely saved lives.</li><li style="margin-bottom: 0; padding-left: 12px; border-left: 2px solid #dadce0;"><a href="https://github.com/google/deepvariant" target="_blank"><b>DeepVariant</b></a>, <a href="https://cloud.google.com/vertex-ai/generative-ai/docs/model-garden/explore-models" target="_blank"><b>TxGemma-9B</b></a>, <a href="https://cloud.google.com/vertex-ai/generative-ai/docs/model-garden/explore-models" target="_blank"><b>MedSigLIP</b></a>, <a href="https://deepmind.google/technologies/alphaearth/" target="_blank"><b>AlphaEarth Foundations</b></a>, and many more — variant calling, therapeutic LLM, medical multimodal, environmental sensing.</li></ul>\n\nGoogle invented the substrate the whole industry runs on — the <a href="https://arxiv.org/abs/1706.03762" target="_blank">Transformer</a>, <a href="https://www.tensorflow.org/" target="_blank">TensorFlow</a>, <a href="https://kubernetes.io/" target="_blank">Kubernetes</a>, and <a href="https://jax.readthedocs.io/" target="_blank">JAX</a> — so you get both halves of the stack, the infrastructure and the science, from one place. And it\'s bought the way public research is funded: fixed-price <a href="https://cloud.google.com/edu/researchers" target="_blank">PSSA</a> with incentives through GPAR.' },
          ] :
          phase === 'models2' ? [
            { body: 'James Manyika and Pushmeet Kohli launched an agentic platform aimed at automating the most labor-intensive phases of research, called <a href="https://blog.google/innovation-and-ai/technology/research/gemini-for-science-io-2026/" target="_blank">Gemini for Science</a>. Register at <a href="https://labs.google/science" target="_blank">labs.google/science</a>.\n\n<ul style="margin: 8px 0; padding-left: 18px; list-style-type: none;"><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><b>Hypothesis Generation</b> (built on Co-Scientist) — multi-agent <i>"idea tournament"</i> where hypotheses are generated, debated, and verified with clickable citations.</li><li style="margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #dadce0;"><b>Computational Discovery</b> (built on AlphaEvolve + ERA) — parallel code-variant search for scientific simulation.</li><li style="margin-bottom: 0; padding-left: 12px; border-left: 2px solid #dadce0;"><b>Literature Insights</b> — agentic synthesis across the published corpus.</li></ul>\n<a href="https://github.com/google-deepmind/science-skills" target="_blank"><b>Science Skills</b></a> is a bundle that connects <a href="https://antigravity.google/" target="_blank"><b>Google Antigravity</b></a> agents to <b>30+ life-science databases</b>: UniProt, AlphaFold Database, AlphaGenome API, InterPro, and more. In Google\'s internal validation, a structural bioinformatics analysis on the <b>AK2 gene</b> that normally takes hours completed in <b>minutes</b>, surfacing new disease mechanism candidates. For your structural biologists, this collapses days of manual workflow into a single prompt.' },
          ] :
          phase === 'models3' ? [
            { body: 'Academic medical precedents for AI infrastructure: <a href="https://cloud.google.com/customers/chop" target="_blank">CHOP</a> (Trillium TPUs for 1.6M pediatric patients), <a href="https://www.cmu.edu/news/stories/archives/2025/March/google-partnership" target="_blank">CMU</a>, <a href="https://www.purdue.edu/newsroom/2026/Q1/purdue-and-google-public-sector-partner-to-scale-ai-integration-and-accelerate-education-and-research-across-the-institution/" target="_blank">Purdue</a> (256-chip TPU pod with Slurm), SUNY (64 campuses), <a href="https://www.odu.edu/article/old-dominion-university-and-google-launch-a-first-of-its-kind-ai-incubator-for-higher" target="_blank">ODU</a>.\n\nGoogle invented the technological substrate underneath all of this: the <a href="https://arxiv.org/abs/1706.03762" target="_blank">Transformer</a>, <a href="https://www.tensorflow.org/" target="_blank">TensorFlow</a>, <a href="https://kubernetes.io/" target="_blank">Kubernetes</a>, <a href="https://jax.readthedocs.io/" target="_blank">JAX</a>. The infrastructure we walked through today — Slurm-burst, TPU, Hyperdisk ML, Falcon, Multi-Tier Checkpointing — exists because the science layer above demands it. Your institution gets both halves of the stack from a single vendor with the deepest scientific publication record in the industry.' },
          ] :
          phase === 'pse' ? [
            { body: 'PSSA (Public Sector Subscription Agreement) provides fixed-price predictability for government and higher education. Unlike consumption-based billing, PSSA locks in pricing for a committed term with no usage surprises — a single fixed annual line item that maps to how institutional HPC is already funded, with no per-researcher metering.\n\n<a href="https://cloud.google.com/edu/researchers" target="_blank">GPAR (Google Public Sector Program for Accelerated Research)</a> is the research-side credit framing that complements PSSA. In production with SUNY, ODU, Purdue, and CMU.\n\nFor NIH-funded institutions, both sit under <a href="https://datascience.nih.gov/strides" target="_blank">STRIDES</a> — the NIH framework Google has been the <a href="https://www.hpcwire.com/2018/07/31/google-is-first-partner-in-nihs-strides-effort-to-speed-discovery-in-the-cloud/" target="_blank">first commercial cloud partner under since 2018</a>. Eight years of co-design with NIH on how cloud research procurement works for institutional budgets.' },
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
