import React, { useEffect, useRef, useState } from 'react'
import { theme } from '../config'

// Public-read bucket — all fetches anonymous.
// Points at esmfold-tpu, the FASTEST lane (~25s), not af2-tpu. af2-tpu is last in the
// serialized TPU chain and lands ~175s after the first lane finishes, so pointing here
// meant the viewer showed the PREVIOUS run's structure for the whole demo.
const PDB_URL = 'https://storage.googleapis.com/wz-nih-demo-shared/job/esmfold-tpu.pdb'
const PDB_METADATA_URL = 'https://storage.googleapis.com/storage/v1/b/wz-nih-demo-shared/o/job%2Fesmfold-tpu.pdb'

// 30 seconds — picks up new ESMFold-TPU runs without user action, low load on GCS API.
const POLL_INTERVAL_MS = 30_000

// Render the GCS object's `updated` ISO-8601 timestamp in US Eastern as
// "INFERRED 2026-06-01 14:32:18 EDT". The zone abbreviation comes from Intl, so it reads
// EDT from March to November and EST the rest of the year. A hardcoded "EST" was an hour
// off from the time it claimed for most of the year.
function formatEastern(isoTs: string): string {
  const d = new Date(isoTs)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(d)
  const lookup: Record<string, string> = {}
  for (const p of parts) lookup[p.type] = p.value
  return `INFERRED ${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second} ${lookup.timeZoneName}`
}

interface ProteinViewerProps {
  /**
   * When false, the component renders nothing. The instance itself stays mounted, so
   * everything scoped to one visit has to be reset in the effect cleanup.
   */
  visible: boolean
}

type Phase = 'init' | 'waiting' | 'ready' | 'error'

export default function ProteinViewer({ visible }: ProteinViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<any>(null)
  const lastUpdatedRef = useRef<string | null>(null)
  const [timestampLabel, setTimestampLabel] = useState<string>('')
  const [phase, setPhase] = useState<Phase>('init')

  // Initialize viewer once when visible flips true.
  useEffect(() => {
    if (!visible || !containerRef.current) return
    let cancelled = false
    let pollId: ReturnType<typeof setInterval> | null = null
    let retryId: ReturnType<typeof setTimeout> | null = null
    const controller = new AbortController()

    const fail = (why: string, err?: unknown) => {
      if (cancelled) return
      console.warn(`ProteinViewer: ${why}`, err ?? '')
      setPhase('error')
    }

    async function init() {
      // Dynamic import keeps 3dmol out of any code path that doesn't need it.
      const $3Dmol = await import('3dmol')
      if (cancelled || !containerRef.current) return

      viewerRef.current = $3Dmol.createViewer(containerRef.current, {
        // backgroundAlpha=0 enables WebGL alpha so the HUD shows through.
        // (The Color value still has to be a string per 3dmol's TypeScript
        // typings, even though the runtime accepts hex numbers.)
        backgroundColor: '#000000',
        backgroundAlpha: 0,
        antialias: true,
      })

      await refreshIfNew()
      pollId = setInterval(refreshIfNew, POLL_INTERVAL_MS)
    }

    // A failed chunk load or WebGL context creation used to reject with nobody listening:
    // no poll ever started and the panel read CONNECTING… for the rest of the talk.
    function start() {
      init().catch(err => {
        fail('viewer init failed, retrying in 30 s', err)
        if (!cancelled) retryId = setTimeout(start, POLL_INTERVAL_MS)
      })
    }

    async function refreshIfNew() {
      try {
        const metaResp = await fetch(PDB_METADATA_URL, { cache: 'no-store', signal: controller.signal })
        // 404 = esmfold-tpu.pdb doesn't exist in GCS yet. Could be: fresh setup
        // (no run has ever completed), or a run in flight that wiped the
        // file before the new ESMFold-TPU has produced output. Show a clear
        // placeholder instead of a black void.
        if (metaResp.status === 404) {
          if (!cancelled) setPhase('waiting')
          return
        }
        if (!metaResp.ok) return fail(`metadata fetch returned HTTP ${metaResp.status}`)
        const meta: { updated: string } = await metaResp.json()
        const updated = meta.updated
        if (lastUpdatedRef.current === updated) {
          // Already rendered this version: keep the current view.
          if (!cancelled) setPhase('ready')
          return
        }

        const pdbResp = await fetch(PDB_URL, { cache: 'no-store', signal: controller.signal })
        if (!pdbResp.ok) return fail(`PDB fetch returned HTTP ${pdbResp.status}`)
        const pdbText = await pdbResp.text()

        const v = viewerRef.current
        if (!v || cancelled) return
        v.clear()
        v.addModel(pdbText, 'pdb')
        // Rainbow by residue position: N-terminus blue through C-terminus red.
        //
        // This replaced pLDDT confidence colouring. pLDDT lives in the PDB B-factor field, but the
        // two models write it on different scales — AlphaFold 0-100, ESMFold 0-1 — and once the
        // viewer was repointed at the faster ESMFold lane every structure rendered a flat orange:
        // ESMFold's pLDDT on these demo sequences tops out near 55/100, which sits entirely in the
        // "very low confidence" bucket. Spectrum shows the fold's topology instead and is
        // multi-coloured for any model.
        //
        // NOTE: this no longer encodes confidence. Do not narrate it as AlphaFold pLDDT colouring.
        v.setStyle({}, { cartoon: { color: 'spectrum' } })
        v.zoomTo()
        v.spin('y', 0.5)
        v.render()

        lastUpdatedRef.current = updated
        setTimestampLabel(formatEastern(updated))
        setPhase('ready')
      } catch (err) {
        // AbortError is the cleanup cancelling an in-flight fetch; anything else is a real
        // network failure (a corporate proxy block lands here) and gets surfaced.
        if ((err as Error)?.name === 'AbortError') return
        fail('structure fetch failed, retrying in 30 s', err)
      }
    }

    start()

    return () => {
      cancelled = true
      controller.abort()
      if (pollId) clearInterval(pollId)
      if (retryId) clearTimeout(retryId)
      if (viewerRef.current) {
        try {
          viewerRef.current.spin(false)
          viewerRef.current.clear()
        } catch { /* viewer torn down */ }
        viewerRef.current = null
      }
      // The next visit builds a fresh, empty viewer. If this still held the last timestamp,
      // refreshIfNew would see "already rendered" and never add the model to it, which left a
      // blank panel on every return to the slide.
      lastUpdatedRef.current = null
      setTimestampLabel('')
      setPhase('init')
    }
  }, [visible])

  if (!visible) return null

  const headline =
    phase === 'init' ? 'CONNECTING…' :
    phase === 'waiting' ? 'AWAITING ESMFOLD-TPU' :
    'STRUCTURE UNREACHABLE'
  const detail =
    phase === 'init' ? 'fetching last inference from gs://wz-nih-demo-shared/job/esmfold-tpu.pdb' :
    phase === 'waiting' ? 'no structure in GCS yet — render will appear within 30 s of upload' :
    'could not fetch gs://wz-nih-demo-shared/job/esmfold-tpu.pdb (network or proxy) — retrying every 30 s'

  return (
    <div
      className="protein-viewer-wrap"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '20vw',
        height: '100vh',
        zIndex: 20,                      // above SideLadder (z-index ~10), below info box (z-index 30)
        background: 'transparent',
        backdropFilter: 'blur(10px)',           // frosted-glass — matches .location-paper
        WebkitBackdropFilter: 'blur(10px)',     // Safari
        display: 'flex',
        flexDirection: 'column',
        animation: 'softFadeIn 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        ref={containerRef}
        className="protein-viewer-canvas"
        style={{ flex: 1, position: 'relative' }}
      >
        {/* Timestamp lives INSIDE the canvas wrapper as absolute-positioned
            so it never reorders the wrapper's children — moving the canvas
            div's index in JSX causes React to remount it, which strands the
            3dmol viewer ref against a detached DOM node (HMR pain). */}
        <div
          className="protein-viewer-ts"
          style={{
            position: 'absolute',
            top: 10,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: 10,
            color: '#708090',
            letterSpacing: '0.12em',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          {timestampLabel || ' '}
        </div>
        {phase !== 'ready' && (
          <div
            className="protein-viewer-placeholder"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              fontFamily: "'Courier New', Courier, monospace",
              color: '#5a6878',
              letterSpacing: '0.15em',
              pointerEvents: 'none',
              padding: '0 20px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: phase === 'error' ? '#EF4035' : theme.accent,
                opacity: 0.65,
                letterSpacing: '0.2em',
                animation: 'softPulse 2.2s ease-in-out infinite',
              }}
            >
              {headline}
            </div>
            <div style={{ fontSize: 9, lineHeight: 1.5, maxWidth: 220 }}>
              {detail}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
