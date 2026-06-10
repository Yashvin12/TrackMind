/**
 * ConflictAlert — Stable Lifecycle-Aware Conflict Panel
 * ======================================================
 * - Never remounts conflict cards. Uses stable keys by conflict ID.
 * - Conflicts transition: DETECTED → ACTIVE → RESOLVED (visible 10s) → ARCHIVED
 * - Updates are driven by the store's liveConflicts array (debounced at 2Hz).
 * - Clicking a conflict card enters Focus Mode for the network map.
 * - Recent Events feed logs detected/resolved events.
 */

import { memo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { conflictTypeLabel } from '../types/conflict'
import { LiveConflict, ConflictLifecycle, HistoryEvent } from '../store/index'
import { useStore } from '../store/index'
import clsx from 'clsx'

interface Props {
  liveConflicts: LiveConflict[]
  conflictHistory: HistoryEvent[]
  expanded?: boolean
}

// ── Severity helpers ───────────────────────────────────────────────────────────
function severityLabel(s: number): 'low' | 'medium' | 'high' | 'critical' {
  if (s >= 0.9) return 'critical'
  if (s >= 0.65) return 'high'
  if (s >= 0.35) return 'medium'
  return 'low'
}

function severityColors(severity: number) {
  const label = severityLabel(severity)
  if (label === 'critical') return { bg: 'hsl(0 84% 60% / 0.12)', border: 'hsl(0 84% 60% / 0.4)',  text: 'hsl(0 84% 65%)',       badge: 'badge-critical' }
  if (label === 'high')     return { bg: 'hsl(22 100% 55% / 0.1)', border: 'hsl(22 100% 55% / 0.35)', text: '#f97316',               badge: 'badge-high' }
  if (label === 'medium')   return { bg: 'hsl(38 92% 60% / 0.1)',  border: 'hsl(38 92% 60% / 0.35)',  text: 'hsl(38 92% 60%)',       badge: 'badge-medium' }
  return { bg: 'hsl(198 100% 54% / 0.08)', border: 'hsl(198 100% 54% / 0.3)', text: '#22d3ee', badge: 'badge-low' }
}

// Lifecycle badge colors
function lifecycleBadge(lc: ConflictLifecycle): { label: string; color: string; bg: string } {
  if (lc === 'DETECTED')  return { label: 'DETECTED',  color: '#FFB547', bg: 'rgba(255,181,71,0.12)' }
  if (lc === 'ACTIVE')    return { label: 'ACTIVE',    color: '#FF5757', bg: 'rgba(255,87,87,0.12)' }
  if (lc === 'RESOLVING') return { label: 'RESOLVING', color: '#4E7CFF', bg: 'rgba(78,124,255,0.12)' }
  if (lc === 'RESOLVED')  return { label: 'RESOLVED',  color: '#20D97C', bg: 'rgba(32,217,124,0.12)' }
  return { label: 'ARCHIVED', color: '#6B7A9E', bg: 'rgba(107,122,158,0.08)' }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function historyIcon(type: HistoryEvent['type']): string {
  if (type === 'conflict_detected')    return '⚠'
  if (type === 'conflict_resolved')    return '✓'
  if (type === 'signal_delay')         return '🚦'
  if (type === 'train_held')           return '⏸'
  if (type === 'recommendation_applied') return '✔'
  return '·'
}

function historyColor(type: HistoryEvent['type']): string {
  if (type === 'conflict_detected')    return '#FF5757'
  if (type === 'conflict_resolved')    return '#20D97C'
  if (type === 'signal_delay')         return '#FFB547'
  if (type === 'train_held')           return '#8FA7D9'
  if (type === 'recommendation_applied') return '#4E7CFF'
  return '#6B7A9E'
}

// ── Single conflict card (memoized — never remounts by key) ───────────────────
const ConflictCard = memo(function ConflictCard({
  conflict,
  isSelected,
  onSelect,
  expanded,
}: {
  conflict: LiveConflict
  isSelected: boolean
  onSelect: (id: string) => void
  expanded?: boolean
}) {
  const colors  = severityColors(conflict.severity)
  const lcBadge = lifecycleBadge(conflict.lifecycle)
  const trainIds = conflict.affected_trains ?? conflict.trains_involved ?? []
  const isResolved = conflict.lifecycle === 'RESOLVED' || conflict.lifecycle === 'ARCHIVED'

  return (
    <motion.div
      initial={false}
      animate={{
        opacity: isResolved ? 0.55 : 1,
      }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{
        background:  isSelected ? `${colors.bg.replace(')', ', 0.2)').replace('hsl', 'hsla')}` : colors.bg,
        border: `1px solid ${isSelected ? 'var(--accent)' : colors.border}`,
        cursor: 'pointer',
        boxShadow: isSelected ? `0 0 0 1px var(--accent)` : undefined,
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease, opacity 0.25s ease',
      }}
      onClick={() => !isResolved && onSelect(isSelected ? '' : conflict.id)}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="mono text-xs font-semibold" style={{ color: 'hsl(var(--rail-text-2))' }}>
          {trainIds.slice(0, 3).join(' ↔ ')}
          {trainIds.length > 3 && ` +${trainIds.length - 3}`}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Lifecycle badge */}
          <span
            className="text-xs px-1.5 py-0.5 rounded font-semibold"
            style={{
              background: lcBadge.bg,
              color: lcBadge.color,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              letterSpacing: '0.06em',
            }}
          >
            {lcBadge.label}
          </span>
          {/* Severity badge */}
          <span className={clsx('badge', colors.badge)} style={{ flexShrink: 0 }}>
            {severityLabel(conflict.severity)}
          </span>
        </div>
      </div>

      {/* Type + block */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="font-medium" style={{ color: 'hsl(var(--rail-text))' }}>
          {conflictTypeLabel(conflict.conflict_type)}
        </span>
        <span style={{ color: 'hsl(var(--rail-text-3))' }}>·</span>
        <span className="mono" style={{ color: 'hsl(var(--rail-text-3))' }}>
          {conflict.block_section}
        </span>
      </div>

      {/* Time + severity bar */}
      {!isResolved && (
        <div className="flex items-center gap-3">
          <span
            className="mono text-xs font-bold"
            style={{ color: conflict.time_to_conflict_min <= 5 ? 'hsl(var(--rail-danger))' : colors.text }}
          >
            T−{conflict.time_to_conflict_min.toFixed(1)} min
          </span>
          {conflict.predicted_delay_min !== undefined && (
            <>
              <span style={{ color: 'hsl(var(--rail-text-3))' }}>·</span>
              <span className="text-xs" style={{ color: 'hsl(var(--rail-text-3))' }}>
                +{conflict.predicted_delay_min.toFixed(0)}min delay
              </span>
            </>
          )}
          <div className="flex-1 progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.min(conflict.severity * 100, 100)}%`, background: colors.text }}
            />
          </div>
          <span className="mono text-xs" style={{ color: colors.text }}>
            {(conflict.severity * 100).toFixed(0)}%
          </span>
        </div>
      )}

      {/* Resolved message */}
      {isResolved && (
        <div className="flex items-center gap-2 text-xs" style={{ color: '#20D97C' }}>
          <span>✓</span>
          <span>Conflict resolved — {conflict.resolution_action ?? 'cleared'}</span>
        </div>
      )}

      {/* Resolution options (expanded only, active conflicts) */}
      {expanded && !isResolved && conflict.resolution_options && conflict.resolution_options.length > 0 && (
        <div className="flex flex-col gap-1 mt-1 pl-2 border-l-2" style={{ borderColor: colors.border }}>
          <span className="label" style={{ fontSize: '0.65rem' }}>Suggested resolutions</span>
          {conflict.resolution_options.slice(0, 2).map((opt, i) => (
            <p key={i} className="text-xs" style={{ color: 'hsl(var(--rail-text-2))' }}>
              {i + 1}. {opt}
            </p>
          ))}
        </div>
      )}

      {/* Focus Mode hint when selected */}
      {isSelected && (
        <div
          className="text-xs flex items-center gap-1 mt-0.5"
          style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 10, height: 10 }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          Focus mode active — network map highlighting
        </div>
      )}
    </motion.div>
  )
})

// ── Main component ─────────────────────────────────────────────────────────────
export function ConflictAlert({ liveConflicts, conflictHistory, expanded = false }: Props) {
  const { selectedConflictId, setSelectedConflict, exitFocusMode } = useStore()

  // Sort: active conflicts first, then by severity desc, resolved last
  const sorted = [...liveConflicts].sort((a, b) => {
    const aResolved = a.lifecycle === 'RESOLVED' || a.lifecycle === 'ARCHIVED' ? 1 : 0
    const bResolved = b.lifecycle === 'RESOLVED' || b.lifecycle === 'ARCHIVED' ? 1 : 0
    if (aResolved !== bResolved) return aResolved - bResolved
    return b.severity - a.severity
  })

  const activeCount = liveConflicts.filter(
    (lc) => lc.lifecycle !== 'RESOLVED' && lc.lifecycle !== 'ARCHIVED'
  ).length

  const handleSelect = useCallback(
    (id: string) => {
      if (id === '' || id === selectedConflictId) {
        exitFocusMode()
      } else {
        setSelectedConflict(id)
      }
    },
    [selectedConflictId, setSelectedConflict, exitFocusMode]
  )

  return (
    <div className="card flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--rail-text))' }}>
            {expanded ? 'Conflict Center' : 'Active Conflicts'}
          </h2>
          {activeCount > 0 && (
            <span className="status-dot danger" style={{ width: '8px', height: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedConflictId && (
            <button
              onClick={exitFocusMode}
              className="text-xs px-2 py-0.5 rounded transition-all"
              style={{
                background: 'var(--warning)18',
                color: 'var(--warning)',
                border: '1px solid var(--warning)44',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Exit Focus
            </button>
          )}
          <span className={clsx('badge', activeCount > 0 ? 'badge-critical' : 'badge-success')}>
            {activeCount === 0 ? '✓ Clear' : `${activeCount} active`}
          </span>
        </div>
      </div>

      {/* Conflict cards */}
      <div
        className={clsx('flex flex-col gap-2 overflow-y-auto', expanded ? 'max-h-[480px]' : 'max-h-64')}
        style={{ scrollBehavior: 'smooth' }}
      >
        <AnimatePresence initial={false}>
          {sorted.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-8 flex flex-col items-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#20D97C" strokeWidth={1.5} style={{ width: 32, height: 32, opacity: 0.6 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" />
              </svg>
              <p className="text-sm" style={{ color: 'hsl(var(--rail-text-3))' }}>
                Network clear — no conflicts detected
              </p>
            </motion.div>
          )}

          {sorted.map((conflict) => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              isSelected={selectedConflictId === conflict.id}
              onSelect={handleSelect}
              expanded={expanded}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Recent Events feed */}
      {(expanded || conflictHistory.length > 0) && (
        <div
          className="flex flex-col gap-0"
          style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 }}
        >
          <div
            className="text-xs font-semibold mb-2"
            style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}
          >
            RECENT EVENTS
          </div>
          {conflictHistory.length === 0 ? (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>No events yet</div>
          ) : (
            <div
              className="flex flex-col gap-0 overflow-y-auto"
              style={{ maxHeight: expanded ? 200 : 120 }}
            >
              {conflictHistory.slice(0, expanded ? 20 : 6).map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-start gap-2 py-1.5"
                  style={{ borderBottom: '1px solid var(--border)', minHeight: 28 }}
                >
                  <span
                    className="flex-shrink-0 mt-0.5"
                    style={{ color: historyColor(evt.type), fontSize: 10 }}
                  >
                    {historyIcon(evt.type)}
                  </span>
                  <span
                    className="flex-shrink-0 tabular-nums"
                    style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}
                  >
                    {formatTime(evt.timestamp)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {evt.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
