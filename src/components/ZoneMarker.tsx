import React from 'react'
import { OverlayView } from '@react-google-maps/api'

export type MarkerState = 'idle' | 'provisioning' | 'failed' | 'active' | 'done'

export interface VMInfo {
  name: string
  href: string
  state: MarkerState
  /** Slurm partition the job landed in, from the lane's allocate event: spot-tpu, spot-gpu, tpu, gpu. */
  partition?: string
}

interface ZoneMarkerProps {
  position: google.maps.LatLngLiteral
  label: string
  subtitle?: string
  subtitleHref?: string
  state: MarkerState
  vms?: VMInfo[]
  onClick?: () => void
  showHalo?: boolean
  showPartitionChips?: boolean
}

// The chip comes from the Slurm partition the job landed in, carried on the lane's allocate event.
// VM names don't track provisioning: nihprotein-a100spotcentra-0 runs STANDARD in the gpu partition,
// and the Spot TPU nodes have no "spot" in their names. The name is only a fallback for markers
// built before an allocate event arrives.
function partitionOf(vm: VMInfo): 'SPOT' | 'STANDARD' {
  if (vm.partition) return vm.partition.startsWith('spot') ? 'SPOT' : 'STANDARD'
  return vm.name.toLowerCase().includes('spot') ? 'SPOT' : 'STANDARD'
}

const VM_STATE_COLORS: Record<MarkerState, string> = {
  idle: '#999',
  provisioning: '#F8981D',
  failed: '#f47065',
  active: 'var(--accent-soft)',
  done: 'var(--accent-soft)',
}

export default function ZoneMarker({ position, label, subtitle, subtitleHref, state, vms, onClick, showHalo, showPartitionChips }: ZoneMarkerProps) {
  const stateClass = state === 'done' ? 'marker-done' : state === 'active' ? 'marker-active' : state === 'provisioning' ? 'marker-provisioning' : state === 'failed' ? 'marker-failed' : ''

  return (
    <OverlayView position={position} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
      <div className={`zone-marker-wrap ${stateClass}`} onClick={onClick}>
        <div className="marker-spinner-box">
          {showHalo && <div className="marker-halo" />}
          <div className="rotatingBoxes1" />
          <div className="rotatingBoxes2" />
          <div className="rotatingBoxes3" />
        </div>
        <div className="marker-text-box">
          <b>{label}</b>
          {subtitle && !vms?.length && (
            subtitleHref
              ? <a href={subtitleHref} target="_blank" rel="noopener" style={{ display: 'block', fontSize: '0.75em', color: '#708090', textDecoration: 'none', marginTop: 1 }}>{subtitle}</a>
              : <span style={{ display: 'block', fontSize: '0.75em', color: '#708090', marginTop: 1 }}>{subtitle}</span>
          )}
          {vms && vms.length > 0 && vms.map(vm => {
            const part = partitionOf(vm)
            const chip = showPartitionChips ? (
              <span className={`partition-chip partition-chip-${part.toLowerCase()}`}>{part}</span>
            ) : null
            return vm.href ? (
              <a
                key={vm.name}
                href={vm.href}
                target="_blank"
                rel="noopener"
                style={{
                  display: 'block',
                  fontSize: '0.7em',
                  color: VM_STATE_COLORS[vm.state],
                  textDecoration: 'none',
                  marginTop: 1,
                }}
              >
                {chip}{vm.name}
              </a>
            ) : (
              <span
                key={vm.name}
                style={{
                  display: 'block',
                  fontSize: '0.7em',
                  color: VM_STATE_COLORS[vm.state],
                  marginTop: 1,
                }}
              >
                {chip}{vm.name}
              </span>
            )
          })}
        </div>
      </div>
    </OverlayView>
  )
}
