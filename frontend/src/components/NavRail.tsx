/**
 * NavRail — Permanent Left Navigation Rail
 * =========================================
 * 56px fixed vertical navigation for the NCC command centre.
 * 7 operational views, icon + label, active state indicator.
 * Keyboard shortcut hints on hover.
 */

import { ViewId } from '../store/index'

interface NavItem {
  id: ViewId
  label: string
  shortcut?: string
  icon: React.ReactNode
  alertKey?: 'conflict' | 'recommendation'
}

interface Props {
  activeView: ViewId
  onNavigate: (view: ViewId) => void
  conflictCount?: number
  recCount?: number
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'network',
    label: 'Network',
    shortcut: '1',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18 }}>
        <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
  },
  {
    id: 'timeline',
    label: 'T-Space',
    shortcut: '2',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18 }}>
        <path d="M3 12h18M3 6l9-3 9 3M3 18l9 3 9-3" />
      </svg>
    ),
  },
  {
    id: 'conflicts',
    label: 'Conflicts',
    shortcut: '3',
    alertKey: 'conflict',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18 }}>
        <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
  },
  {
    id: 'whatif',
    label: 'Sim Lab',
    shortcut: '4',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18 }}>
        <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'predictions',
    label: 'Forecast',
    shortcut: '5',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18 }}>
        <path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    id: 'recommendations',
    label: 'AI Rec',
    shortcut: '6',
    alertKey: 'recommendation',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18 }}>
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    id: 'audit',
    label: 'Audit',
    shortcut: '7',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 18, height: 18 }}>
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
]

export function NavRail({ activeView, onNavigate, conflictCount = 0, recCount = 0 }: Props) {
  return (
    <nav className="ncc-nav-rail" aria-label="Main navigation">
      {/* Logo mark */}
      <div style={{
        width: 34, height: 34, borderRadius: 6,
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 8, flexShrink: 0,
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={1.5} style={{ width: 16, height: 16 }}>
          <path d="M2 12h20M2 8h20M6 4v16M12 4v16M18 4v16" strokeLinecap="round" />
        </svg>
      </div>

      <div className="nav-divider" />

      {NAV_ITEMS.map((item) => {
        const isActive = activeView === item.id
        const hasAlert = (item.alertKey === 'conflict' && conflictCount > 0) ||
                         (item.alertKey === 'recommendation' && recCount > 0)
        return (
          <button
            key={item.id}
            id={`nav-${item.id}`}
            className={`nav-item ${isActive ? 'active' : ''} ${hasAlert && !isActive ? 'alert' : ''}`}
            onClick={() => onNavigate(item.id)}
            title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}`}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.icon}
            <span className="nav-item-label">{item.label}</span>
            {hasAlert && (
              <span style={{
                position: 'absolute', top: 7, right: 7,
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--safety-red)',
                animation: 'blink-live 1.5s ease-in-out infinite',
              }} />
            )}
          </button>
        )
      })}

      <div style={{ flex: 1 }} />
      <div className="nav-divider" />

      {/* Theme toggle at bottom */}
    </nav>
  )
}
