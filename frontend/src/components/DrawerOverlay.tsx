/**
 * DrawerOverlay — Full-column slide-over for secondary views
 * ===========================================================
 * Overlays the entire right action-queue column (100% of its parent).
 * The network map (left 70%) stays fully visible at all times.
 * Views: Timeline, What-If, Forecast, Audit Log.
 */

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export type DrawerView = 'timeline' | 'whatif' | 'predictions' | 'audit' | null

interface Props {
  view: DrawerView
  onClose: () => void
  children: React.ReactNode
  title: string
  subtitle?: string
}

const DRAWER_ICONS: Record<NonNullable<DrawerView>, React.ReactNode> = {
  timeline: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 15, height: 15 }}>
      <path d="M3 12h18M3 6l9-3 9 3M3 18l9 3 9-3" />
    </svg>
  ),
  whatif: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 15, height: 15 }}>
      <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  predictions: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 15, height: 15 }}>
      <path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  ),
  audit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 15, height: 15 }}>
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
}

export function DrawerOverlay({ view, onClose, children, title, subtitle }: Props) {
  useEffect(() => {
    if (!view) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [view, onClose])

  return (
    <AnimatePresence>
      {view && (
        <motion.div
          key={view}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            /* Fill the entire parent (ncc-action-queue) column */
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            background: 'var(--bg-panel)',
            borderLeft: '2px solid var(--ir-blue)',
            boxShadow: '-4px 0 20px rgba(15,38,83,0.12)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* ── Drawer Header ── */}
          <div style={{
            background: 'var(--bg-table-head)',
            color: 'var(--text-on-blue)',
            padding: '0 14px',
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            borderBottom: '1px solid rgba(255,255,255,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ opacity: 0.75 }}>
                {view && DRAWER_ICONS[view]}
              </span>
              <div>
                <div style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.05em',
                }}>
                  {title}
                </div>
                {subtitle && (
                  <div style={{
                    fontSize: '0.68rem',
                    color: 'var(--text-on-blue-dim)',
                    fontFamily: 'var(--font-mono)',
                    marginTop: 1,
                  }}>
                    {subtitle}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              title="Close (ESC)"
              style={{
                background: 'rgba(255,255,255,0.09)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.7)',
                borderRadius: 4,
                width: 30,
                height: 30,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                fontWeight: 700,
                flexShrink: 0,
                transition: 'background 100ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
            >
              ✕
            </button>
          </div>

          {/* ── Content area ── */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '14px',
            background: 'var(--bg-panel)',
          }}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
