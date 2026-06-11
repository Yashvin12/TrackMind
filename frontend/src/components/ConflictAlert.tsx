/**
 * ConflictAlert — NCC Action Queue
 * ==================================
 * Dense, ranked operational queue for a section controller.
 * Left-edge severity bar, T-minus countdown, one-click ACCEPT.
 * Integrates AI recommendations and explainability panel inline.
 */

import { memo, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { conflictTypeLabel } from '../types/conflict'
import { LiveConflict, ConflictLifecycle, HistoryEvent, PredictionEntry } from '../store/index'
import { useStore } from '../store/index'
import { Recommendation } from '../types/recommendation'

interface Props {
  liveConflicts: LiveConflict[]
  conflictHistory: HistoryEvent[]
  recommendation?: Recommendation | null
  onAccept?: (recId: string, rank?: number) => void
  onOverride?: (recId: string, reason: string) => void
  predictions?: PredictionEntry[]
}

function severityTier(s: number): 'critical' | 'major' | 'minor' {
  if (s >= 0.75) return 'critical'
  if (s >= 0.40) return 'major'
  return 'minor'
}

const TIER_CONFIG = {
  critical: {
    barColor:    'var(--safety-red)',
    bgColor:     'var(--safety-red-light)',
    borderColor: 'var(--safety-red-border)',
    textColor:   'var(--safety-red)',
    label:       'CRITICAL',
  },
  major: {
    barColor:    'var(--safety-amber)',
    bgColor:     'var(--safety-amber-light)',
    borderColor: 'var(--safety-amber-border)',
    textColor:   'var(--safety-amber)',
    label:       'MAJOR',
  },
  minor: {
    barColor:    'var(--safety-blue)',
    bgColor:     'var(--safety-blue-light)',
    borderColor: 'var(--safety-blue-border)',
    textColor:   'var(--safety-blue)',
    label:       'MINOR',
  },
}

function lifecycleBadge(lc: ConflictLifecycle): { label: string; color: string } {
  if (lc === 'DETECTED')  return { label: 'NEW',      color: 'var(--safety-amber)' }
  if (lc === 'ACTIVE')    return { label: 'ACTIVE',   color: 'var(--safety-red)' }
  if (lc === 'RESOLVING') return { label: 'RESOLVING',color: 'var(--safety-blue)' }
  if (lc === 'RESOLVED')  return { label: 'RESOLVED', color: 'var(--safety-green)' }
  return { label: 'ARCHIVED', color: 'var(--text-faint)' }
}

function recommendedAction(conflictType: string, tier: 'critical' | 'major' | 'minor'): string {
  if (conflictType === 'block_occupancy')     return 'HOLD trailing train at advance starter signal'
  if (conflictType === 'opposing_movement')   return 'ISSUE red aspect — enter loop at next station'
  if (conflictType === 'platform_contention') return 'REDIRECT to alternate platform'
  if (conflictType === 'loop_capacity')       return 'EXTEND loop dwell, delay dispatch by 8min'
  if (conflictType === 'headway_violation')   return 'APPLY TSR 60 km/h on following train'
  if (conflictType === 'overtaking_conflict') return 'EXPEDITE slower train, loop at KLD'
  if (conflictType === 'signal_violation')    return 'EMERGENCY STOP — verify signal at station'
  if (tier === 'critical') return 'IMMEDIATE controller intervention required'
  if (tier === 'major')    return 'Adjust speed or priority class'
  return 'Monitor — no immediate action required'
}

function historyIcon(type: HistoryEvent['type']): { icon: string; color: string } {
  if (type === 'conflict_detected')      return { icon: '⚠', color: 'var(--safety-red)' }
  if (type === 'conflict_resolved')      return { icon: '✓', color: 'var(--safety-green)' }
  if (type === 'signal_delay')           return { icon: '◈', color: 'var(--safety-amber)' }
  if (type === 'train_held')             return { icon: '⏸', color: 'var(--safety-blue)' }
  if (type === 'recommendation_applied') return { icon: '✔', color: 'var(--safety-green)' }
  return { icon: '·', color: 'var(--text-faint)' }
}

function formatHHMM(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

// ── Single conflict row ───────────────────────────────────────────────────────
const ConflictRow = memo(function ConflictRow({
  conflict, isSelected, onSelect, recommendation, onAccept, onOverride,
}: {
  conflict: LiveConflict
  isSelected: boolean
  onSelect: (id: string) => void
  recommendation?: Recommendation | null
  onAccept?: (recId: string, rank?: number) => void
  onOverride?: (recId: string, reason: string) => void
  predictions?: PredictionEntry[]
}) {
  const [showOverride, setShowOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [acted, setActed] = useState<string | null>(null)

  const tier      = severityTier(conflict.severity)
  const cfg       = TIER_CONFIG[tier]
  const lcBadge   = lifecycleBadge(conflict.lifecycle)
  const trainIds  = conflict.affected_trains ?? conflict.trains_involved ?? []
  const isResolved = conflict.lifecycle === 'RESOLVED' || conflict.lifecycle === 'ARCHIVED'
  const isUrgent   = conflict.time_to_conflict_min <= 5 && !isResolved
  const action     = recommendedAction(conflict.conflict_type, tier)

  // Find recommendation for this conflict
  const rec = recommendation?.conflict_id === conflict.id ? recommendation : null

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: isResolved ? 0.5 : 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      style={{ overflow: 'hidden' }}
    >
      {/* Urgency bar on critical + urgent */}
      {isUrgent && (
        <div style={{ height: 2, background: cfg.barColor, animation: 'pulse-conflict 1s ease-in-out infinite' }} />
      )}

      {/* Main row */}
      <div
        onClick={() => !isResolved && onSelect(isSelected ? '' : conflict.id)}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderBottom: '1px solid var(--border)',
          background: isSelected ? cfg.bgColor : 'transparent',
          cursor: isResolved ? 'default' : 'pointer',
          transition: 'background 120ms ease',
          minHeight: 52,
        }}
      >
        {/* Severity bar */}
        <div style={{ width: 4, flexShrink: 0, background: cfg.barColor }} />

        {/* Content */}
        <div style={{ flex: 1, padding: '7px 10px', minWidth: 0 }}>
          {/* Row 1: Train IDs + lifecycle badge + tier */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.78rem',
              color: cfg.textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {trainIds.slice(0, 2).join(' ↔ ')}
              {trainIds.length > 2 && <span style={{ fontWeight: 400, opacity: 0.7 }}> +{trainIds.length - 2}</span>}
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700,
                color: lcBadge.color, whiteSpace: 'nowrap',
                background: lcBadge.color + '18',
                padding: '1px 5px', borderRadius: 2,
                border: `1px solid ${lcBadge.color}40`,
              }}>
                {lcBadge.label}
              </span>
              <span className={`badge badge-${tier === 'critical' ? 'danger' : tier === 'major' ? 'warning' : 'accent'}`}>
                {cfg.label}
              </span>
            </div>
          </div>

          {/* Row 2: Conflict type + block */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              {conflictTypeLabel(conflict.conflict_type)}
            </span>
            <span style={{ color: 'var(--border-strong)', fontSize: '0.65rem' }}>·</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              {conflict.block_section}
            </span>
          </div>

          {/* Row 3: T-minus + severity bar + action */}
          {!isResolved && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700,
                color: isUrgent ? cfg.textColor : 'var(--text-secondary)',
                flexShrink: 0,
                minWidth: 64,
              }}>
                T−{conflict.time_to_conflict_min.toFixed(1)}m
              </span>
              <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${Math.min(conflict.severity * 100, 100)}%`,
                  background: cfg.barColor, borderRadius: 2, transition: 'width 400ms ease',
                }} />
              </div>
            </div>
          )}

          {isResolved && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: 'var(--safety-green)' }}>
              <span>✓</span>
              <span>Resolved — {conflict.resolution_action ?? 'cleared'}</span>
            </div>
          )}
        </div>

        {/* Accept button — always visible on active conflicts */}
        {!isResolved && !acted && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', flexShrink: 0 }}>
            <button
              className="btn-accept btn"
              onClick={e => { e.stopPropagation(); setActed('ACCEPTED') }}
              style={{ fontSize: '0.65rem', padding: '4px 10px', fontFamily: 'var(--font-heading)', letterSpacing: '0.05em' }}
              title="Accept recommended action"
            >
              ✓ ACCEPT
            </button>
          </div>
        )}
        {acted && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--safety-green)', fontWeight: 700 }}>
              ✓ {acted}
            </span>
          </div>
        )}
      </div>

      {/* Expanded detail panel */}
      <AnimatePresence initial={false}>
        {isSelected && !isResolved && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden', borderBottom: `1px solid ${cfg.borderColor}` }}
          >
            <div style={{
              padding: '10px 12px 12px',
              background: cfg.bgColor,
              display: 'flex', flexDirection: 'column', gap: 10,
              borderLeft: `4px solid ${cfg.barColor}`,
            }}>
              {/* Recommended action */}
              <div style={{
                background: 'white', borderRadius: 3, padding: '8px 10px',
                border: `1px solid ${cfg.borderColor}`,
              }}>
                <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
                  color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
                  RECOMMENDED ACTION
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4 }}>
                  {action}
                </div>
                {conflict.predicted_delay_min !== undefined && (
                  <div style={{ marginTop: 5, fontSize: '0.67rem', color: 'var(--text-muted)' }}>
                    Estimated cascade impact:
                    <strong style={{ color: cfg.textColor, marginLeft: 4 }}>
                      +{conflict.predicted_delay_min.toFixed(0)} min
                    </strong>
                  </div>
                )}
              </div>

              {/* Recommendation options (if available) */}
              {rec && rec.options.slice(0, 2).map(opt => (
                <div key={opt.rank} style={{
                  background: opt.rank === 1 ? 'var(--ir-blue-pale)' : 'var(--bg-surface)',
                  border: `1px solid ${opt.rank === 1 ? 'var(--ir-blue-light)' : 'var(--border)'}`,
                  borderRadius: 3, padding: '7px 10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      {opt.rank === 1 && (
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
                          color: 'var(--ir-blue)', background: 'var(--ir-blue-light)', padding: '1px 5px', borderRadius: 2 }}>
                          ★ TOP
                        </span>
                      )}
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        Option {opt.rank} · {opt.confidence} confidence
                      </span>
                    </div>
                    {opt.actions.slice(0, 2).map((a, i) => (
                      <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 1 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--ir-blue)', marginRight: 5 }}>
                          {a.action_type.toUpperCase()} {a.train_id}
                        </span>
                        {a.duration_min && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>for {a.duration_min}m</span>}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                    <button className="btn btn-accept"
                      style={{ fontSize: 12, padding: '3px 10px' }}
                      onClick={() => onAccept?.(rec.id, opt.rank)}>
                      Apply
                    </button>
                    <button className="btn btn-sim"
                      style={{ fontSize: 12, padding: '3px 8px' }}>
                      Sim
                    </button>
                  </div>
                </div>
              ))}

              {/* Note: AI factor analysis has moved to the right Inspector panel */}

              {/* Override */}
              {!showOverride ? (
                <button
                  className="btn btn-override"
                  style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-heading)', letterSpacing: '0.04em' }}
                  onClick={() => setShowOverride(true)}
                >
                  Controller Override
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    className="input"
                    placeholder="State reason for manual override…"
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-override"
                      style={{ flex: 1, fontSize: 12 }}
                      onClick={() => {
                        if (!overrideReason.trim()) return
                        if (rec) onOverride?.(rec.id, overrideReason)
                        setShowOverride(false); setOverrideReason('')
                      }}
                    >
                      Confirm Override
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: '3px 12px' }}
                      onClick={() => { setShowOverride(false); setOverrideReason('') }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})

// ── Main component ────────────────────────────────────────────────────────────
export function ConflictAlert({ liveConflicts, conflictHistory, recommendation, onAccept, onOverride, predictions }: Props) {
  const { selectedConflictId, setSelectedConflict, exitFocusMode } = useStore()

  const activeCount = liveConflicts.filter(lc => lc.lifecycle !== 'RESOLVED' && lc.lifecycle !== 'ARCHIVED').length

  // Sort: critical first, then by severity desc
  const sorted = [...liveConflicts].sort((a, b) => {
    const ta = severityTier(a.severity) === 'critical' ? 0 : severityTier(a.severity) === 'major' ? 1 : 2
    const tb = severityTier(b.severity) === 'critical' ? 0 : severityTier(b.severity) === 'major' ? 1 : 2
    if (ta !== tb) return ta - tb
    return b.severity - a.severity
  })

  const handleSelect = useCallback((id: string) => {
    if (!id || id === selectedConflictId) exitFocusMode()
    else setSelectedConflict(id)
  }, [selectedConflictId, setSelectedConflict, exitFocusMode])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Queue header */}
      <div className="section-header" style={{ justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 13, height: 13, opacity: 0.7 }}>
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          ACTION QUEUE
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {selectedConflictId && (
            <button
              onClick={exitFocusMode}
              style={{
                fontSize: '0.6rem', padding: '1px 7px', borderRadius: 2,
                background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Exit Focus
            </button>
          )}
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700,
            color: activeCount > 0 ? '#FCA5A5' : '#4ADE80',
          }}>
            {activeCount === 0 ? '✓ CLEAR' : `${activeCount} ACTIVE`}
          </span>
        </div>
      </div>

      {/* Tier summary strip */}
      {activeCount > 0 && (
        <div style={{
          display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {(['critical', 'major', 'minor'] as const).map(tier => {
            const count = liveConflicts.filter(c => severityTier(c.severity) === tier && c.lifecycle !== 'RESOLVED' && c.lifecycle !== 'ARCHIVED').length
            if (count === 0) return null
            const cfg = TIER_CONFIG[tier]
            return (
              <div key={tier} style={{
                flex: 1, padding: '4px 10px',
                background: cfg.bgColor,
                borderRight: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: cfg.textColor }}>{count}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: cfg.textColor, opacity: 0.7, letterSpacing: '0.05em' }}>{cfg.label}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Conflict rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sorted.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--safety-green)" strokeWidth={1.5} style={{ width: 36, height: 36, opacity: 0.5 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>
            </svg>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
              Network clear — no active conflicts
            </span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {sorted.map(conflict => (
              <ConflictRow
                key={conflict.id}
                conflict={conflict}
                isSelected={selectedConflictId === conflict.id}
                onSelect={handleSelect}
                recommendation={recommendation}
                onAccept={onAccept}
                onOverride={onOverride}
                predictions={predictions}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Recent events feed (compact) */}
      {conflictHistory.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0, maxHeight: 130, overflowY: 'auto' }}>
          <div style={{ padding: '4px 10px', background: 'var(--bg-row-alt)', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Recent Events
            </span>
          </div>
          {conflictHistory.slice(0, 8).map(evt => {
            const { icon, color } = historyIcon(evt.type)
            return (
              <div key={evt.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 10px', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ color, fontSize: '0.7rem', flexShrink: 0, width: 12, textAlign: 'center' }}>{icon}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-faint)', flexShrink: 0, width: 28 }}>
                  {formatHHMM(evt.timestamp)}
                </span>
                <span style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {evt.message}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
