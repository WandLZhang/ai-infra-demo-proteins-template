import React from 'react'
import { theme, useConfig } from '../config'
import { fillPlaceholders } from '../content'
import { renderMarkdown } from '../markdown'

type Variant = 'popover' | 'hero'

interface InfoButtonProps {
  // Markdown from talk_track.md with its {placeholders}, as scripts/sync-talk-track.mjs writes it into App.tsx.
  title: string
  sections: { body: string }[]
  open: boolean
  onToggle: () => void
  variant?: Variant
}

// Hero = popover with different position + size only. Pure opacity fade —
// no scale, no slide. The hero sits left of the results column (--results-w), so the structure
// stays in view while it's open.
const POPOVER_STYLE: React.CSSProperties = {
  position: 'fixed', top: 60, right: 16, zIndex: 30, width: 'clamp(280px, 34vw, 480px)',
  maxHeight: 'calc(100vh - 96px)',
  background: 'rgba(255,255,255,0.75)',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
  borderRadius: 4,
  overflow: 'hidden',
}

const HERO_STYLE: React.CSSProperties = {
  position: 'fixed', top: 70, left: '1vw', zIndex: 30, width: 'calc(100vw - var(--results-w) - 3vw)',
  maxHeight: 'calc(100vh - 140px)',
  background: 'rgba(255,255,255,0.75)',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
  borderRadius: 4,
  overflow: 'hidden',
}

export default function InfoButton({ title, sections, open, onToggle, variant = 'popover' }: InfoButtonProps) {
  const { config } = useConfig()
  const isHero = variant === 'hero'
  const baseStyle = isHero ? HERO_STYLE : POPOVER_STYLE

  return (
    <>
      <button
        onClick={onToggle}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#222', padding: 8 }}
      >
        <span className="material-icons" style={{ fontSize: 28 }}>info_outline</span>
      </button>

      <div style={{
        ...baseStyle,
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' as const : 'none' as const,
        transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <div style={{ maxHeight: isHero ? 'calc(100vh - 140px)' : 'calc(100vh - 96px)', overflowY: 'auto', padding: '20px 24px' }}>
          {/* key includes body identity so cross-dissolve fires even when title is shared
              across slides (e.g. all three models* slides share the same hero title). */}
          <div className="info-content-wrap" key={title + (sections[0]?.body.slice(0, 40) ?? '')}>
            <div style={{
              fontSize: 18, color: '#222', marginBottom: 14,
              fontFamily: "freight-text-pro, serif",
              textTransform: 'uppercase' as const, letterSpacing: '0.12em', fontWeight: 400,
              borderBottom: `2px solid ${theme.accent}`, paddingBottom: 10,
            }}>
              {fillPlaceholders(title, config)}
            </div>
            {sections.map((s, i) => (
              <div key={i} style={{ marginBottom: 18 }}>
                <div
                  className="info-body"
                  style={{
                    fontSize: 13, lineHeight: 1.55, color: '#2f2f2f',
                    fontFamily: "'Google Sans', sans-serif",
                    whiteSpace: 'pre-wrap' as const,
                  }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(fillPlaceholders(s.body, config)) }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
