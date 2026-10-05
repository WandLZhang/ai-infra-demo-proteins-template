import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useConfig } from '../config'

interface Props {
  visible: boolean
  onOpenChange: (open: boolean) => void
}

const TOOLTIP_DISMISSED_KEY = 'setup-wizard-tooltip-dismissed'

export default function SetupWizard({ visible, onOpenChange }: Props) {
  const { config, setConfig, resetConfig } = useConfig()
  const [open, setOpen] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onOpenChange(open)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!visible) return
    const dismissed = localStorage.getItem(TOOLTIP_DISMISSED_KEY)
    if (!dismissed) {
      const timer = setTimeout(() => setShowTooltip(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [visible])

  const dismissTooltip = () => {
    setShowTooltip(false)
    localStorage.setItem(TOOLTIP_DISMISSED_KEY, 'true')
  }

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => {
    if (!open || !searchInputRef.current || !window.google?.maps?.places) return
    const autocomplete = new google.maps.places.Autocomplete(searchInputRef.current, {
      fields: ['geometry', 'name', 'formatted_address'],
    })
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      if (!place?.geometry?.location) return
      const lat = place.geometry.location.lat()
      const lng = place.geometry.location.lng()
      const name = place.name || ''
      update({
        home: {
          ...config.home,
          markerLatLng: { lat, lng },
          cameraLatLng: { lat: lat - 0.025, lng: lng + 0.096 },
          buildingName: name.toUpperCase() || config.home.buildingName,
        },
      })
    })
  }, [open])

  const update = useCallback((partial: Partial<typeof config>) => {
    setConfig({ ...config, ...partial })
  }, [config, setConfig])

  const updateInstitution = useCallback((field: string, value: string) => {
    const inst = { ...config.institution, [field]: value }
    if (field === 'shortName') {
      inst.pageTitle = `${value} HPC with Google`
      inst.menuSubtitle = `${value} Research Computing · TPU vs GPU`
    }
    setConfig({ ...config, institution: inst })
  }, [config, setConfig])

  const updateHome = useCallback((field: string, value: string | number) => {
    setConfig({ ...config, home: { ...config.home, [field]: value } })
  }, [config, setConfig])

  const stopPropagation = useCallback((e: React.KeyboardEvent | React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  if (!visible) return null

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', border: '1px solid #dadce0', borderRadius: 3,
    fontSize: 12, fontFamily: 'var(--font-display)', background: '#fff', color: '#3c4043',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10, fontWeight: 600, color: '#5f6368',
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3, marginTop: 10,
    fontFamily: 'var(--font-display)',
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); dismissTooltip() }}
        title="Configure institution"
        style={{
          background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 3,
          cursor: 'pointer', padding: '1px 6px',
          fontSize: 12, lineHeight: '1.4', color: '#5f6368', transition: 'all 0.15s',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.1)'; e.currentTarget.style.color = '#3c4043' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = '#5f6368' }}
      >
        ⚙
      </button>

      {showTooltip && !open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          background: '#3c4043', color: '#fff', padding: '8px 12px', borderRadius: 6,
          fontSize: 11, fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)', animation: 'fadeInUp 0.3s ease',
        }}>
          <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%) rotate(45deg)',
            width: 10, height: 10, background: '#3c4043' }} />
          <span>Click to change the origin location</span>
          <button onClick={e => { e.stopPropagation(); dismissTooltip() }} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
            marginLeft: 8, fontSize: 12, padding: 0, lineHeight: 1,
          }}>✕</button>
        </div>
      )}

      {open && (
        <div
          ref={panelRef}
          onKeyDown={stopPropagation}
          onKeyUp={stopPropagation}
          onClick={stopPropagation}
          style={{
            position: 'fixed', bottom: 90, left: 30,
            width: 320, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
            background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)',
            borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            padding: '16px 18px', zIndex: 50,
            border: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#3c4043', fontFamily: 'var(--font-display)', marginBottom: 4 }}>
            Configure Institution
          </div>
          <div style={{ fontSize: 10, color: '#80868b', marginBottom: 8, fontFamily: 'var(--font-display)' }}>
            Changes apply live to the demo.
          </div>

          <label style={labelStyle}>Institution name</label>
          <input style={inputStyle} value={config.institution.shortName}
            onKeyDown={stopPropagation}
            onChange={e => updateInstitution('shortName', e.target.value)}
            placeholder="Cornell" />

          <label style={labelStyle}>Full name</label>
          <input style={inputStyle} value={config.institution.fullName}
            onKeyDown={stopPropagation}
            onChange={e => updateInstitution('fullName', e.target.value)}
            placeholder="Cornell University" />

          <label style={labelStyle}>Building (search)</label>
          <input ref={searchInputRef} style={inputStyle}
            onKeyDown={stopPropagation}
            placeholder="Search for a building or address..." />

          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <div style={{ flex: 1 }}>
              <label style={{ ...labelStyle, marginTop: 6 }}>Lat</label>
              <input style={inputStyle} type="number" step="0.0001" value={config.home.markerLatLng.lat}
                onKeyDown={stopPropagation}
                onChange={e => {
                  const lat = parseFloat(e.target.value) || 0
                  update({ home: { ...config.home, markerLatLng: { ...config.home.markerLatLng, lat }, cameraLatLng: { ...config.home.cameraLatLng, lat: lat - 0.025 } } })
                }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ ...labelStyle, marginTop: 6 }}>Lng</label>
              <input style={inputStyle} type="number" step="0.0001" value={config.home.markerLatLng.lng}
                onKeyDown={stopPropagation}
                onChange={e => {
                  const lng = parseFloat(e.target.value) || 0
                  update({ home: { ...config.home, markerLatLng: { ...config.home.markerLatLng, lng }, cameraLatLng: { ...config.home.cameraLatLng, lng: lng + 0.096 } } })
                }} />
            </div>
          </div>

          <label style={labelStyle}>Building name (display)</label>
          <input style={inputStyle} value={config.home.buildingName}
            onKeyDown={stopPropagation}
            onChange={e => updateHome('buildingName', e.target.value.toUpperCase())}
            placeholder="RHODES HALL" />

          <label style={labelStyle}>Login node hostname</label>
          <input style={inputStyle} value={config.home.loginNode}
            onKeyDown={stopPropagation}
            onChange={e => updateHome('loginNode', e.target.value)}
            placeholder="cbsulogin" />

          <label style={labelStyle}>Marker subtitle</label>
          <input style={inputStyle} value={config.home.markerSubtitle}
            onKeyDown={stopPropagation}
            onChange={e => updateHome('markerSubtitle', e.target.value)}
            placeholder="cbsulogin · BioHPC" />

          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button onClick={() => setOpen(false)} style={{
              flex: 1, padding: '7px 12px', fontSize: 11, fontWeight: 600,
              background: '#3c4043', color: '#fff', border: 'none', borderRadius: 3,
              cursor: 'pointer', fontFamily: 'var(--font-display)',
              letterSpacing: '0.04em',
            }}>
              Done
            </button>
            <button onClick={() => { resetConfig(); setOpen(false) }} style={{
              padding: '7px 12px', fontSize: 11,
              background: 'transparent', color: '#80868b', border: '1px solid #dadce0', borderRadius: 3,
              cursor: 'pointer', fontFamily: 'var(--font-display)',
            }}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
