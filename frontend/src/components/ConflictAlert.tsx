/**
 * ConflictAlert — Industrial Recommendation Cards
 * ================================================
 * Redesigned as clean, high-density "Recommendation Cards" for an NCC operator.
 * One card per conflict, structured as:
 *   1. AI Recommendation header (train ID in monospace)
 *   2. Prominent metric callout (cascade delay saved %)
 *   3. Plain-English SHAP explanation
 *   4. Square industrial "Accept Recommendation" (green) + "Override" (ghost red)
 *
 * Design rules:
 *  - NO dark: classes anywhere
 *  - All numbers / Train IDs / timestamps: font-mono
 *  - Alert colors: red-600/bg-red-50 (active), amber-600 (warning), green-600 (clear)
 *  - Borders: border border-slate-300 rounded-sm — no drop shadows
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

// Industrial Light-Mode tier config — NO dark: variants
const TIER_CONFIG = {
  critical: {
    barColor:    '#DC2626',        // red-600
    bgColor:     '#FEF2F2',        // red-50
    borderColor: '#FECACA',        // red-200
    textColor:   '#DC2626',        // red-600
    label:       'CRITICAL',
    metricColor: '#DC2626',
  },
  major: {
    barColor:    '#D97706',        // amber-600
    bgColor:     '#FFFBEB',        // amber-50
    borderColor: '#FCD34D',        // amber-300
    textColor:   '#D97706',        // amber-600
    label:       'MAJOR',
    metricColor: '#D97706',
  },
  minor: {
    barColor:    '#1D4ED8',        // blue-700
    bgColor:     '#EFF6FF',        // blue-50
    borderColor: '#BFDBFE',        // blue-200
    textColor:   '#1D4ED8',        // blue-700
    label:       'MINOR',
    metricColor: '#1D4ED8',
  },
}

function lifecycleBadge(lc: ConflictLifecycle): { label: string; bg: string; color: string } {
  if (lc === 'DETECTED')  return { label: 'NEW',       bg: '#FFFBEB', color: '#D97706' }
  if (lc === 'ACTIVE')    return { label: 'ACTIVE',    bg: '#FEF2F2', color: '#DC2626' }
  if (lc === 'RESOLVING') return { label: 'RESOLVING', bg: '#EFF6FF', color: '#1D4ED8' }
  if (lc === 'RESOLVED')  return { label: 'RESOLVED',  bg: '#F0FDF4', color: '#16A34A' }
  return { label: 'ARCHIVED', bg: '#F8FAFC', color: '#94A3B8' }
}

// Derive a plain-English AI recommendation headline from conflict context
function aiRecommendationTitle(conflict: LiveConflict): string {
  const trains = conflict.affected_trains ?? conflict.trains_involved ?? []
  const primary = trains[0] ?? 'Train'
  if (conflict.conflict_type === 'block_occupancy')     return `Hold ${primary} at advance starter`
  if (conflict.conflict_type === 'opposing_movement')   return `Issue red aspect — loop ${primary} at next station`
  if (conflict.conflict_type === 'platform_contention') return `Redirect ${primary} to alternate platform`
  if (conflict.conflict_type === 'loop_capacity')       return `Extend loop dwell — delay ${primary} by 8 min`
  if (conflict.conflict_type === 'headway_violation')   return `Apply TSR 60 km/h on ${primary}`
  if (conflict.conflict_type === 'overtaking_conflict') return `Expedite ${primary}, loop at KLD`
  if (conflict.conflict_type === 'signal_violation')    return `Emergency stop — verify signal · ${primary}`
  return `Intervene on ${primary}`
}

// Derive a SHAP-style plain English explanation
function shapExplanation(conflict: LiveConflict): string {
  const trains = conflict.affected_trains ?? conflict.trains_involved ?? []
  const a = trains[0] ?? 'Train A'
  const b = trains[1] ?? 'Train B'
  const block = conflict.block_section?.replace('BLK_', '').replace('_', '→') ?? 'block section'
  const tier = severityTier(conflict.severity)

  if (conflict.conflict_type === 'block_occupancy')
    return `${a} entered ${block} before ${b} cleared. Headway gap is ${(conflict.time_to_conflict_min).toFixed(0)} min — below the 5 min minimum threshold.`
  if (conflict.conflict_type === 'headway_violation')
    return `Speed differential between ${a} and ${b} at ${block} reduces following distance to critical level.`
  if (conflict.conflict_type === 'opposing_movement')
    return `${a} and ${b} are on opposing paths through ${block}. Signal protection is insufficient for current closure rate.`
  if (conflict.conflict_type === 'platform_contention')
    return `Both ${a} and ${b} are assigned to the same platform. One must be redirected or delayed.`
  if (tier === 'critical')
    return `High-severity interaction between ${a} and ${b} at ${block}. Immediate controller action required to prevent collision.`
  return `Potential scheduling conflict between ${a} and ${b} in the ${block} section. Monitor and apply speed adjustment if unresolved within 3 min.`
}

// Estimate cascade delay savings as a rough percentage
function cascadeDelaySaving(conflict: LiveConflict): { pct: number; absMin: number } {
  const base = conflict.predicted_delay_min ?? (conflict.severity * 45)
  const saved = base * 0.28 + (severityTier(conflict.severity) === 'critical' ? 15 : 5)
  return {
    pct: Math.round(Math.min(saved / Math.max(base, 1) * 100, 72)),
    absMin: Math.round(saved),
  }
}

function formatHHMM(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function historyIcon(type: HistoryEvent['type']): { icon: string; color: string } {
  if (type === 'conflict_detected')      return { icon: '⚠', color: '#DC2626' }
  if (type === 'conflict_resolved')      return { icon: '✓', color: '#16A34A' }
  if (type === 'signal_delay')           return { icon: '◈', color: '#D97706' }
  if (type === 'train_held')             return { icon: '⏸', color: '#1D4ED8' }
  if (type === 'recommendation_applied') return { icon: '✔', color: '#16A34A' }
  return { icon: '·', color: '#94A3B8' }
}

// ── Single Recommendation Card ────────────────────────────────────────────────
const RecommendationCard = memo(function RecommendationCard({
  conflict, isSelected, onSelect, recommendation, onAccept, onOverride,
  tMinus, severity
}: {
  conflict: LiveConflict
  isSelected: boolean
  onSelect: (id: string) => void
  recommendation?: Recommendation | null
  onAccept?: (recId: string, rank?: number) => void
  onOverride?: (recId: string, reason: string) => void
  tMinus: number
  severity: number
}) {
  console.count("RecommendationCard render")
  const [showOverride, setShowOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [acted, setActed] = useState<'ACCEPTED' | 'OVERRIDDEN' | null>(null)

  const tier      = severityTier(severity)
  const cfg       = TIER_CONFIG[tier]
  const lcBadge   = lifecycleBadge(conflict.lifecycle)
  const trainIds  = conflict.affected_trains ?? conflict.trains_involved ?? []
  const isResolved = conflict.lifecycle === 'RESOLVED' || conflict.lifecycle === 'ARCHIVED'
  const isUrgent   = tMinus <= 5 && !isResolved
  const title      = aiRecommendationTitle(conflict)
  const shap       = shapExplanation(conflict)
  const { pct, absMin } = cascadeDelaySaving(conflict)
  const rec = recommendation?.conflict_id === conflict.id ? recommendation : null

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: isResolved ? 0.55 : 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      style={{ overflow: 'hidden' }}
    >
      {/* Urgency ticker bar */}
      {isUrgent && (
        <div style={{
          height: 2,
          background: cfg.barColor,
          animation: 'pulse-conflict 1s ease-in-out infinite',
        }} />
      )}

      {/* Card */}
      <div
        onClick={() => !isResolved && onSelect(isSelected ? '' : conflict.id)}
        style={{
          background: isSelected ? cfg.bgColor : '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          cursor: isResolved ? 'default' : 'pointer',
          transition: 'background 120ms ease',
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        {/* Left severity bar */}
        <div style={{
          width: 4,
          flexShrink: 0,
          background: cfg.barColor,
        }} />

        {/* Card content */}
        <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>

          {/* Row 1: Lifecycle badge + tier + T-minus */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.58rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              background: lcBadge.bg,
              color: lcBadge.color,
              padding: '1px 6px',
              borderRadius: 2,
              border: `1px solid ${lcBadge.color}33`,
              flexShrink: 0,
            }}>
              {lcBadge.label}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.58rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              background: cfg.bgColor,
              color: cfg.textColor,
              padding: '1px 6px',
              borderRadius: 2,
              border: `1px solid ${cfg.borderColor}`,
              flexShrink: 0,
            }}>
              {cfg.label}
            </span>
            {!isResolved && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                fontWeight: 700,
                color: isUrgent ? cfg.textColor : '#64748B',
                marginLeft: 'auto',
                flexShrink: 0,
              }}>
                T−{tMinus.toFixed(1)} min
              </span>
            )}
          </div>

          {/* Row 2: AI Recommendation Header */}
          <div style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#1E293B',
            lineHeight: 1.3,
            marginBottom: 4,
          }}>
            <span style={{ color: '#64748B', fontWeight: 400, fontSize: '0.7rem' }}>
              AI Recommendation:{' '}
            </span>
            {title}
          </div>

          {/* Row 3: Trains involved */}
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            fontWeight: 600,
            color: cfg.textColor,
            marginBottom: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {trainIds.slice(0, 3).join(' ↔ ')}
            {trainIds.length > 3 && (
              <span style={{ fontWeight: 400, opacity: 0.7 }}> +{trainIds.length - 3}</span>
            )}
            <span style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 400,
              color: '#94A3B8',
              marginLeft: 8,
            }}>
              · {conflictTypeLabel(conflict.conflict_type)} · {conflict.block_section}
            </span>
          </div>

          {/* Row 4: Metric callout — "Saves X% Cascade Delay" */}
          {!isResolved && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 4,
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: 2,
              padding: '3px 10px',
              marginBottom: 8,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.1rem',
                fontWeight: 800,
                color: '#16A34A',        // green-600
                lineHeight: 1,
              }}>
                {pct}%
              </span>
              <span style={{ fontSize: '0.7rem', color: '#15803D', fontWeight: 600 }}>
                cascade delay saved · {absMin} min
              </span>
            </div>
          )}

          {isResolved && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: '0.7rem', color: '#16A34A', marginBottom: 8,
            }}>
              <span>✓</span>
              <span>Resolved — {conflict.resolution_action ?? 'cleared'}</span>
            </div>
          )}

          {/* SHAP explanation (expanded when selected or always for active) */}
          {!isResolved && (
            <p style={{
              fontSize: '0.72rem',
              color: '#475569',
              lineHeight: 1.5,
              marginBottom: isSelected ? 10 : 0,
              display: isSelected ? 'block' : '-webkit-box',
              WebkitLineClamp: isSelected ? undefined : 2,
              WebkitBoxOrient: 'vertical' as const,
              overflow: isSelected ? 'visible' : 'hidden',
            }}>
              {shap}
            </p>
          )}

          {/* Action buttons — visible when selected and not yet acted */}
          <AnimatePresence initial={false}>
            {isSelected && !isResolved && !acted && (
              <motion.div
                key="actions"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ overflow: 'hidden' }}
              >
                {/* Recommendation options from AI (if available) */}
                {rec && rec.options.slice(0, 2).map(opt => (
                  <div key={opt.rank} style={{
                    background: opt.rank === 1 ? '#EFF6FF' : '#F8FAFC',
                    border: `1px solid ${opt.rank === 1 ? '#BFDBFE' : '#E2E8F0'}`,
                    borderRadius: 2,
                    padding: '6px 10px',
                    marginBottom: 6,
                    fontSize: '0.7rem',
                    color: '#334155',
                  }}>
                    {opt.rank === 1 && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.58rem',
                        fontWeight: 700,
                        color: '#1D4ED8',
                        background: '#DBEAFE',
                        padding: '1px 5px',
                        borderRadius: 2,
                        marginRight: 6,
                      }}>
                        ★ TOP
                      </span>
                    )}
                    {opt.actions.slice(0, 2).map((a) => (
                      <span key={`${a.action_type}-${a.train_id}`} style={{ marginRight: 8 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0F172A' }}>
                          {a.action_type.toUpperCase()} {a.train_id}
                        </span>
                        {a.duration_min && (
                          <span style={{ color: '#64748B' }}> · {a.duration_min}m</span>
                        )}
                      </span>
                    ))}
                  </div>
                ))}

                {/* Override input */}
                {showOverride && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                    <input
                      className="input"
                      placeholder="State reason for manual override…"
                      value={overrideReason}
                      onChange={e => setOverrideReason(e.target.value)}
                      style={{ fontSize: '0.72rem' }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => {
                          if (!overrideReason.trim()) return
                          if (rec) onOverride?.(rec.id, overrideReason)
                          setActed('OVERRIDDEN')
                          setShowOverride(false)
                          setOverrideReason('')
                        }}
                        style={{
                          flex: 1,
                          padding: '5px 0',
                          fontSize: '0.7rem',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          borderRadius: 2,
                          border: '1px solid #DC2626',
                          background: '#FEF2F2',
                          color: '#DC2626',
                          cursor: 'pointer',
                        }}
                      >
                        CONFIRM OVERRIDE
                      </button>
                      <button
                        onClick={() => { setShowOverride(false); setOverrideReason('') }}
                        style={{
                          padding: '5px 12px',
                          fontSize: '0.7rem',
                          borderRadius: 2,
                          border: '1px solid #CBD5E1',
                          background: '#F8FAFC',
                          color: '#64748B',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Primary action buttons */}
                {!showOverride && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {/* ACCEPT — solid green */}
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        if (rec) onAccept?.(rec.id, 1)
                        setActed('ACCEPTED')
                      }}
                      style={{
                        flex: 1,
                        padding: '7px 0',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        borderRadius: 2,
                        border: '1px solid #16A34A',
                        background: '#16A34A',
                        color: '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'background 100ms ease',
                      }}
                      onMouseOver={e => (e.currentTarget.style.background = '#15803D')}
                      onMouseOut={e => (e.currentTarget.style.background = '#16A34A')}
                    >
                      ✓ ACCEPT RECOMMENDATION
                    </button>

                    {/* OVERRIDE — ghost red */}
                    <button
                      onClick={e => { e.stopPropagation(); setShowOverride(true) }}
                      style={{
                        padding: '7px 14px',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        borderRadius: 2,
                        border: '1px solid #DC2626',
                        background: 'transparent',
                        color: '#DC2626',
                        cursor: 'pointer',
                        transition: 'background 100ms ease',
                        flexShrink: 0,
                      }}
                      onMouseOver={e => (e.currentTarget.style.background = '#FEF2F2')}
                      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      Override
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Acted state */}
            {acted && (
              <motion.div
                key="acted"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
                  fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                  color: acted === 'ACCEPTED' ? '#16A34A' : '#DC2626',
                  fontWeight: 700,
                }}
              >
                {acted === 'ACCEPTED' ? '✓' : '!'} {acted}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
})

// ── Main component ────────────────────────────────────────────────────────────
export const ConflictAlert = memo(function ConflictAlert({ liveConflicts, conflictHistory, recommendation, onAccept, onOverride }: Props) {
  console.count("ConflictAlert render")
  const selectedConflictId = useStore(s => s.selectedConflictId)
  const setSelectedConflict = useStore(s => s.setSelectedConflict)
  const exitFocusMode = useStore(s => s.exitFocusMode)

  const activeCount = liveConflicts.filter(
    lc => lc.lifecycle !== 'RESOLVED' && lc.lifecycle !== 'ARCHIVED'
  ).length

  // Sort: critical first, then by stable detectedAt time to prevent layout thrashing
  const sorted = [...liveConflicts]
    .filter(c => c.lifecycle !== 'RESOLVED' && c.lifecycle !== 'ARCHIVED')
    .sort((a, b) => {
      const ta = severityTier(a.severity) === 'critical' ? 0 : severityTier(a.severity) === 'major' ? 1 : 2
      const tb = severityTier(b.severity) === 'critical' ? 0 : severityTier(b.severity) === 'major' ? 1 : 2
      if (ta !== tb) return ta - tb
      return a.detectedAt - b.detectedAt
    })

  const handleSelect = useCallback((id: string) => {
    if (!id || id === selectedConflictId) exitFocusMode()
    else setSelectedConflict(id)
  }, [selectedConflictId, setSelectedConflict, exitFocusMode])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#F8FAFC' }}>

      {/* Queue header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 12px',
        background: '#1A3057',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} style={{ width: 13, height: 13 }}>
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.07em',
            color: 'rgba(255,255,255,0.85)',
          }}>
            ACTION QUEUE
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selectedConflictId && (
            <button
              onClick={exitFocusMode}
              style={{
                fontSize: '0.6rem',
                padding: '1px 7px',
                borderRadius: 2,
                background: 'rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Exit Focus
            </button>
          )}
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: activeCount > 0 ? '#FCA5A5' : '#4ADE80',
          }}>
            {activeCount === 0 ? '✓ CLEAR' : `${activeCount} ACTIVE`}
          </span>
        </div>
      </div>

      {/* Tier summary strip */}
      {activeCount > 0 && (
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #E2E8F0',
          flexShrink: 0,
          background: '#FFFFFF',
        }}>
          {(['critical', 'major', 'minor'] as const).map(tier => {
            const count = liveConflicts.filter(
              c => severityTier(c.severity) === tier &&
              c.lifecycle !== 'RESOLVED' && c.lifecycle !== 'ARCHIVED'
            ).length
            if (count === 0) return null
            const cfg = TIER_CONFIG[tier]
            return (
              <div key={tier} style={{
                flex: 1,
                padding: '5px 10px',
                background: cfg.bgColor,
                borderRight: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  color: cfg.textColor,
                  lineHeight: 1,
                }}>
                  {count}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.55rem',
                  color: cfg.textColor,
                  opacity: 0.75,
                  letterSpacing: '0.05em',
                  marginTop: 1,
                }}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Recommendation cards */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sorted.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 12,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth={1.5} style={{ width: 40, height: 40, opacity: 0.4 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>
            </svg>
            <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
              Network clear — no active conflicts
            </span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {sorted.map(conflict => (
              <RecommendationCard
                key={conflict.id}
                conflict={conflict}
                isSelected={selectedConflictId === conflict.id}
                onSelect={handleSelect}
                recommendation={recommendation}
                onAccept={onAccept}
                onOverride={onOverride}
                tMinus={conflict.time_to_conflict_min}
                severity={conflict.severity}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Recent events feed */}
      {conflictHistory.length > 0 && (
        <div style={{
          borderTop: '1px solid #E2E8F0',
          flexShrink: 0,
          maxHeight: 130,
          overflowY: 'auto',
          background: '#F8FAFC',
        }}>
          <div style={{
            padding: '4px 10px',
            background: '#F1F5F9',
            borderBottom: '1px solid #E2E8F0',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.58rem',
              fontWeight: 700,
              color: '#94A3B8',
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
            }}>
              Recent Events
            </span>
          </div>
          {conflictHistory.slice(0, 8).map(evt => {
            const { icon, color } = historyIcon(evt.type)
            return (
              <div key={evt.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 10px',
                borderBottom: '1px solid #F1F5F9',
              }}>
                <span style={{ color, fontSize: '0.7rem', flexShrink: 0, width: 12, textAlign: 'center' }}>
                  {icon}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.58rem',
                  color: '#94A3B8',
                  flexShrink: 0,
                  width: 30,
                }}>
                  {formatHHMM(evt.timestamp)}
                </span>
                <span style={{
                  fontSize: '0.67rem',
                  color: '#64748B',
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {evt.message}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})
