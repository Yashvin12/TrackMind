/**
 * ConflictAlert — Operator-grade Conflict Center
 * ================================================
 * - Conflicts grouped: CRITICAL → MAJOR → MINOR
 * - Collapsible groups (preserves scroll position)
 * - Full card: train IDs, impact, time remaining, recommended action, confidence
 * - Action buttons: Simulate · Apply · Ignore · Acknowledge
 * - No rerender storms: memo + stable keys + reference equality
 * - Glow severity badges on hover only
 */

import { memo, useCallback, useState, useRef } from 'react'
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

// ── Severity helpers ────────────────────────────────────────────────────────────
function severityTier(s: number): 'critical' | 'major' | 'minor' {
  if (s >= 0.75) return 'critical'
  if (s >= 0.40) return 'major'
  return 'minor'
}

const TIER_COLORS = {
  critical: { bg: 'hsl(0 84% 60% / 0.10)',   border: 'hsl(0 84% 60% / 0.35)',   text: 'hsl(0 84% 65%)',     badge: 'badge-critical' },
  major:    { bg: 'hsl(38 92% 55% / 0.10)',  border: 'hsl(38 92% 55% / 0.32)',  text: 'hsl(38 92% 60%)',    badge: 'badge-warning'  },
  minor:    { bg: 'hsl(210 100% 60% / 0.08)', border: 'hsl(210 100% 60% / 0.28)', text: 'hsl(210 100% 65%)', badge: 'badge-low'       },
}

const TIER_LABEL = { critical: 'CRITICAL', major: 'MAJOR', minor: 'MINOR' }

// Lifecycle badge
function lifecycleBadge(lc: ConflictLifecycle): { label: string; color: string; bg: string } {
  if (lc === 'DETECTED')  return { label: 'NEW',      color: '#FFB547', bg: 'rgba(255,181,71,0.12)' }
  if (lc === 'ACTIVE')    return { label: 'ACTIVE',   color: '#FF5757', bg: 'rgba(255,87,87,0.12)'  }
  if (lc === 'RESOLVING') return { label: 'RESOLVING',color: '#4E7CFF', bg: 'rgba(78,124,255,0.12)' }
  if (lc === 'RESOLVED')  return { label: 'RESOLVED', color: '#20D97C', bg: 'rgba(32,217,124,0.12)' }
  return { label: 'ARCHIVED', color: '#6B7A9E', bg: 'rgba(107,122,158,0.08)' }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function historyIcon(type: HistoryEvent['type']): string {
  if (type === 'conflict_detected')      return '⚠'
  if (type === 'conflict_resolved')      return '✓'
  if (type === 'signal_delay')           return '◈'
  if (type === 'train_held')             return '⏸'
  if (type === 'recommendation_applied') return '✔'
  return '·'
}

function historyColor(type: HistoryEvent['type']): string {
  if (type === 'conflict_detected')      return '#FF5757'
  if (type === 'conflict_resolved')      return '#20D97C'
  if (type === 'signal_delay')           return '#FFB547'
  if (type === 'train_held')             return '#8FA7D9'
  if (type === 'recommendation_applied') return '#4E7CFF'
  return '#6B7A9E'
}

// Recommended action from conflict type
function recommendedAction(conflictType: string, tier: 'critical' | 'major' | 'minor'): string {
  if (conflictType === 'block_occupancy')     return 'Hold trailing train at signal'
  if (conflictType === 'opposing_movement')   return 'Issue red aspect, enter loop'
  if (conflictType === 'platform_contention') return 'Redirect to alternate platform'
  if (conflictType === 'loop_capacity')       return 'Extend loop dwell, delay dispatch'
  if (conflictType === 'headway_violation')   return 'Apply TSR 60 km/h'
  if (conflictType === 'overtaking_conflict') return 'Expedite slower train at loop'
  if (conflictType === 'signal_violation')    return 'Emergency stop, verify signal'
  if (tier === 'critical') return 'Immediate controller intervention'
  if (tier === 'major')    return 'Adjust speed or priority class'
  return 'Monitor — no immediate action'
}

function confidenceFromSeverity(s: number): number {
  return Math.min(99, Math.round(60 + s * 38))
}

// ── Action buttons ─────────────────────────────────────────────────────────────
interface ActionButtonsProps {
  conflict: LiveConflict
  tier: 'critical' | 'major' | 'minor'
}

const ActionButtons = memo(function ActionButtons({ conflict, tier }: ActionButtonsProps) {
  const [acted, setActed] = useState<string | null>(null)

  const btnBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 10px',
    borderRadius: 5,
    fontSize: '0.65rem',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.04em',
    transition: 'all 120ms ease',
    border: '1px solid transparent',
    userSelect: 'none' as const,
  }

  if (acted) {
    return (
      <div style={{ fontSize: '0.65rem', color: '#20D97C', fontFamily: 'var(--font-mono)', paddingTop: 2 }}>
        ✓ Action recorded: {acted}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const, paddingTop: 2 }}>
      {tier === 'critical' && (
        <button
          style={{
            ...btnBase,
            background: 'hsl(0 84% 60% / 0.15)',
            border: '1px solid hsl(0 84% 60% / 0.4)',
            color: '#FF5757',
          }}
          onClick={(e) => { e.stopPropagation(); setActed('Simulate') }}
          title={`Simulate resolution for ${conflict.id}`}
        >
          ◎ Simulate
        </button>
      )}
      <button
        style={{
          ...btnBase,
          background: 'hsl(220 100% 60% / 0.12)',
          border: '1px solid hsl(220 100% 60% / 0.35)',
          color: 'var(--accent)',
        }}
        onClick={(e) => { e.stopPropagation(); setActed('Apply') }}
        title="Apply recommended resolution"
      >
        ✓ Apply
      </button>
      <button
        style={{
          ...btnBase,
          background: 'hsl(38 92% 55% / 0.10)',
          border: '1px solid hsl(38 92% 55% / 0.28)',
          color: 'hsl(38 92% 60%)',
        }}
        onClick={(e) => { e.stopPropagation(); setActed('Acknowledged') }}
        title="Acknowledge — take manual control"
      >
        ⌁ Ack
      </button>
      <button
        style={{
          ...btnBase,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
        }}
        onClick={(e) => { e.stopPropagation(); setActed('Ignored') }}
        title="Ignore this conflict"
      >
        ✕ Ignore
      </button>
    </div>
  )
})

// ── Single conflict card ────────────────────────────────────────────────────────
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
  const tier     = severityTier(conflict.severity)
  const colors   = TIER_COLORS[tier]
  const lcBadge  = lifecycleBadge(conflict.lifecycle)
  const trainIds = conflict.affected_trains ?? conflict.trains_involved ?? []
  const isResolved = conflict.lifecycle === 'RESOLVED' || conflict.lifecycle === 'ARCHIVED'
  const action   = recommendedAction(conflict.conflict_type, tier)
  const conf     = confidenceFromSeverity(conflict.severity)
  const isUrgent = conflict.time_to_conflict_min <= 5 && !isResolved

  return (
    <motion.div
      initial={false}
      animate={{ opacity: isResolved ? 0.5 : 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.18 } }}
      layout="position"
      className="rounded-lg flex flex-col gap-0"
      style={{
        background:  isSelected ? `hsl(220 100% 60% / 0.07)` : colors.bg,
        border: `1px solid ${isSelected ? 'var(--accent)' : colors.border}`,
        cursor: isResolved ? 'default' : 'pointer',
        boxShadow: isSelected ? `0 0 0 1px var(--accent)` : isUrgent ? `0 0 0 1px ${colors.border}` : undefined,
        transition: 'box-shadow 0.12s ease, border-color 0.12s ease, opacity 0.2s ease',
        overflow: 'hidden',
      }}
      onClick={() => !isResolved && onSelect(isSelected ? '' : conflict.id)}
    >
      {/* Urgency bar */}
      {isUrgent && (
        <div style={{ height: 2, background: colors.text, animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.9 }} />
      )}

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {/* Row 1: train IDs + badges */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: colors.text, letterSpacing: '0.03em' }}>
            {trainIds.slice(0, 3).join(' ↔ ')}
            {trainIds.length > 3 && <span style={{ opacity: 0.6 }}> +{trainIds.length - 3}</span>}
          </span>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ background: lcBadge.bg, color: lcBadge.color, fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.07em', padding: '1px 6px', borderRadius: 3 }}>
              {lcBadge.label}
            </span>
            <span className={clsx('badge', colors.badge)} style={{ fontSize: '0.58rem' }}>
              {TIER_LABEL[tier]}
            </span>
          </div>
        </div>

        {/* Row 2: conflict type + block */}
        <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
            {conflictTypeLabel(conflict.conflict_type)}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.68rem' }}>
            {conflict.block_section}
          </span>
        </div>

        {/* Row 3: time remaining + impact */}
        {!isResolved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: isUrgent ? 'hsl(0 84% 65%)' : colors.text,
                minWidth: 70,
              }}
            >
              T−{conflict.time_to_conflict_min.toFixed(1)} min
            </span>
            {conflict.predicted_delay_min !== undefined && (
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                impact <span style={{ color: colors.text, fontWeight: 600 }}>+{conflict.predicted_delay_min.toFixed(0)} min</span>
              </span>
            )}
            <div style={{ flex: 1, height: 3, background: 'var(--surface-3)', borderRadius: 9999, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(conflict.severity * 100, 100)}%`,
                  background: colors.text,
                  borderRadius: 9999,
                  transition: 'width 400ms ease',
                }}
              />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: colors.text, minWidth: 28, textAlign: 'right' }}>
              {(conflict.severity * 100).toFixed(0)}%
            </span>
          </div>
        )}

        {/* Row 4: recommended action + confidence (expanded or selected) */}
        {(expanded || isSelected) && !isResolved && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.58rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.07em' }}>RECOMMENDED ACTION</span>
              <span style={{ fontSize: '0.58rem', fontFamily: 'var(--font-mono)', color: '#20D97C' }}>
                {conf}% confidence
              </span>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {action}
            </span>
            <ActionButtons conflict={conflict} tier={tier} />
          </div>
        )}

        {/* Resolved message */}
        {isResolved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: '#20D97C' }}>
            <span>✓</span>
            <span>Resolved — {conflict.resolution_action ?? 'cleared'}</span>
          </div>
        )}

        {/* Focus mode hint */}
        {isSelected && !isResolved && (
          <div style={{ fontSize: '0.62rem', color: 'var(--accent)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 9, height: 9 }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            Focus mode — network map highlighting
          </div>
        )}
      </div>
    </motion.div>
  )
})

// ── Collapsible group ──────────────────────────────────────────────────────────
const ConflictGroup = memo(function ConflictGroup({
  tier,
  conflicts,
  selectedConflictId,
  onSelect,
  expanded,
  defaultOpen,
}: {
  tier: 'critical' | 'major' | 'minor'
  conflicts: LiveConflict[]
  selectedConflictId: string | null
  onSelect: (id: string) => void
  expanded?: boolean
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const colors = TIER_COLORS[tier]
  const active = conflicts.filter((c) => c.lifecycle !== 'RESOLVED' && c.lifecycle !== 'ARCHIVED').length

  if (conflicts.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Group header */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 6px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          borderBottom: open ? `1px solid ${colors.border}` : '1px solid transparent',
          marginBottom: open ? 6 : 2,
          transition: 'border-color 0.12s ease',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: colors.text,
            flexShrink: 0,
            opacity: 0.9,
          }}
        />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: colors.text, letterSpacing: '0.08em', flex: 1, textAlign: 'left' }}>
          {TIER_LABEL[tier]}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', marginRight: 6 }}>
          {active} active / {conflicts.length} total
        </span>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}
          style={{ width: 10, height: 10, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', flexShrink: 0 }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Cards */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="group-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 5 }}
          >
            <AnimatePresence initial={false}>
              {conflicts.map((conflict) => (
                <ConflictCard
                  key={conflict.id}
                  conflict={conflict}
                  isSelected={selectedConflictId === conflict.id}
                  onSelect={onSelect}
                  expanded={expanded}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

// ── Main component ─────────────────────────────────────────────────────────────
export function ConflictAlert({ liveConflicts, conflictHistory, expanded = false }: Props) {
  const { selectedConflictId, setSelectedConflict, exitFocusMode } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Group by tier, then sort by severity desc within each tier
  const groups = {
    critical: liveConflicts.filter((c) => severityTier(c.severity) === 'critical').sort((a, b) => b.severity - a.severity),
    major:    liveConflicts.filter((c) => severityTier(c.severity) === 'major').sort((a, b) => b.severity - a.severity),
    minor:    liveConflicts.filter((c) => severityTier(c.severity) === 'minor').sort((a, b) => b.severity - a.severity),
  }

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontWeight: 600, fontSize: '0.875rem', color: 'hsl(var(--rail-text))', margin: 0 }}>
            {expanded ? 'Conflict Center' : 'Active Conflicts'}
          </h2>
          {activeCount > 0 && (
            <span className="status-dot danger" style={{ width: 7, height: 7, animation: 'pulse 1.5s ease-in-out infinite' }} />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {selectedConflictId && (
            <button
              onClick={exitFocusMode}
              style={{
                fontSize: '0.65rem',
                padding: '2px 8px',
                borderRadius: 4,
                background: 'var(--warning)18',
                color: 'var(--warning)',
                border: '1px solid var(--warning)44',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
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

      {/* Summary strip */}
      {liveConflicts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, fontSize: '0.62rem', fontFamily: 'var(--font-mono)' }}>
          {(Object.entries(groups) as Array<[keyof typeof groups, LiveConflict[]]>).map(([tier, list]) =>
            list.length > 0 ? (
              <span key={tier} style={{ color: TIER_COLORS[tier].text, opacity: 0.85 }}>
                {list.length} {tier}
              </span>
            ) : null
          )}
        </div>
      )}

      {/* Groups */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflowY: 'auto',
          maxHeight: expanded ? 560 : 320,
          scrollBehavior: 'smooth',
          paddingRight: 2,
        }}
      >
        {liveConflicts.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ textAlign: 'center', padding: '28px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#20D97C" strokeWidth={1.5} style={{ width: 28, height: 28, opacity: 0.55 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" />
            </svg>
            <p style={{ fontSize: '0.8rem', color: 'hsl(var(--rail-text-3))', margin: 0 }}>
              Network clear — no conflicts detected
            </p>
          </motion.div>
        ) : (
          <>
            <ConflictGroup
              tier="critical"
              conflicts={groups.critical}
              selectedConflictId={selectedConflictId}
              onSelect={handleSelect}
              expanded={expanded}
              defaultOpen={true}
            />
            <ConflictGroup
              tier="major"
              conflicts={groups.major}
              selectedConflictId={selectedConflictId}
              onSelect={handleSelect}
              expanded={expanded}
              defaultOpen={groups.critical.length === 0}
            />
            <ConflictGroup
              tier="minor"
              conflicts={groups.minor}
              selectedConflictId={selectedConflictId}
              onSelect={handleSelect}
              expanded={expanded}
              defaultOpen={false}
            />
          </>
        )}
      </div>

      {/* Recent Events feed */}
      {(expanded || conflictHistory.length > 0) && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 6 }}>
            RECENT EVENTS
          </div>
          {conflictHistory.length === 0 ? (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No events yet</div>
          ) : (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', maxHeight: expanded ? 200 : 110 }}
            >
              {conflictHistory.slice(0, expanded ? 20 : 6).map((evt) => (
                <div
                  key={evt.id}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', minHeight: 26 }}
                >
                  <span style={{ color: historyColor(evt.type), fontSize: '0.65rem', flexShrink: 0, marginTop: 1 }}>
                    {historyIcon(evt.type)}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', flexShrink: 0, paddingTop: 1, letterSpacing: '0.02em' }}>
                    {formatTime(evt.timestamp)}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
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
