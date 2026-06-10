/**
 * RecommendationCards — Operator Decision Panel
 * =============================================
 * Displays structured action decisions for each recommendation option:
 *  - ACTION label, Expected Delay, Network Gain, Confidence %, Risk level
 *  - Apply / Simulate / Compare action buttons
 *  - Top-ranked option highlighted as primary decision
 */

import { motion } from 'framer-motion'
import { useState } from 'react'
import { Recommendation, RecommendationOption } from '../types/recommendation'
import { useStore } from '../store/index'

interface Props {
  recommendation: Recommendation | null
  onAccept: (recommendationId: string, optionRank?: number) => void
  onOverride: (recommendationId: string, reason: string) => void
  isLoading?: boolean
  fullWidth?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function confidenceToRisk(c: string): { label: string; color: string } {
  if (c === 'High')   return { label: 'Low Risk',    color: 'var(--success)' }
  if (c === 'Medium') return { label: 'Medium Risk', color: 'var(--warning)' }
  return               { label: 'High Risk',   color: 'var(--danger)'  }
}

function confidencePct(c: string): number {
  if (c === 'High')   return 92
  if (c === 'Medium') return 72
  return 48
}

function confidenceStyle(c: string): { bg: string; border: string; color: string } {
  if (c === 'High')   return { bg: 'var(--success)18', border: 'var(--success)44', color: 'var(--success)' }
  if (c === 'Medium') return { bg: 'var(--warning)18', border: 'var(--warning)44', color: 'var(--warning)' }
  return { bg: 'var(--danger)18', border: 'var(--danger)44', color: 'var(--danger)' }
}

function actionLabel(type: string, trainId: string): string {
  if (type === 'hold')    return `HOLD ${trainId}`
  if (type === 'proceed') return `ALLOW ${trainId}`
  if (type === 'reroute') return `REROUTE ${trainId}`
  if (type === 'loop')    return `LOOP ${trainId}`
  return `${type.toUpperCase()} ${trainId}`
}

function actionColor(type: string): string {
  if (type === 'hold')    return 'var(--warning)'
  if (type === 'proceed') return 'var(--success)'
  if (type === 'reroute') return 'var(--accent)'
  return 'var(--secondary)'
}

// ── Option Card ────────────────────────────────────────────────────────────────
function OptionCard({
  option,
  onAccept,
  onSimulate,
  onCompare,
  isTop,
  isComparing,
}: {
  option: RecommendationOption
  onAccept: () => void
  onSimulate: () => void
  onCompare: () => void
  isTop: boolean
  isComparing: boolean
}) {
  const conf      = confidenceStyle(option.confidence)
  const risk      = confidenceToRisk(option.confidence)
  const pct       = confidencePct(option.confidence)
  const maxDelay  = Math.max(...Object.values(option.predicted_delays), 0)
  const localDelay = maxDelay
  const networkGain = option.total_weighted_delay

  return (
    <motion.div
      className="rounded-xl flex flex-col gap-0 overflow-hidden"
      style={{
        background: isTop ? 'var(--accent)08' : 'var(--surface-2)',
        border: `1px solid ${isTop ? 'var(--accent)44' : 'var(--border)'}`,
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (option.rank - 1) * 0.07 }}
    >
      {/* Rank bar */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: `1px solid ${isTop ? 'var(--accent)22' : 'var(--border)'}` }}
      >
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: isTop ? 'var(--accent)' : 'var(--surface-1)', color: isTop ? '#fff' : 'var(--text-muted)' }}
        >
          {option.rank}
        </span>
        {isTop && (
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{ background: 'var(--accent)22', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.08em' }}
          >
            TOP RECOMMENDATION
          </span>
        )}
        <div className="flex-1" />
        {/* Confidence */}
        <span
          className="text-xs px-2 py-0.5 rounded"
          style={{ background: conf.bg, border: `1px solid ${conf.border}`, color: conf.color, fontFamily: 'var(--font-mono)' }}
        >
          {pct}%
        </span>
        {/* Risk */}
        <span className="text-xs" style={{ color: risk.color, fontFamily: 'var(--font-mono)' }}>
          {risk.label}
        </span>
      </div>

      {/* Action list */}
      <div className="flex flex-col gap-1.5 px-4 py-3">
        {option.actions.map((action, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
          >
            {/* Action type dot */}
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: actionColor(action.action_type) }}
            />
            {/* Label */}
            <span
              className="font-bold flex-shrink-0"
              style={{ color: actionColor(action.action_type), fontFamily: 'var(--font-mono)' }}
            >
              {actionLabel(action.action_type, action.train_id)}
            </span>
            {action.duration_min && (
              <span style={{ color: 'var(--text-muted)' }}>for {action.duration_min}m</span>
            )}
            <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
              — {action.reason}
            </span>
          </div>
        ))}
      </div>

      {/* Impact metrics */}
      <div
        className="grid grid-cols-3 gap-0 px-4 pb-3"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <div className="flex flex-col gap-0.5">
          <div className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Local Delay
          </div>
          <div
            className="text-sm font-bold"
            style={{ color: localDelay > 10 ? 'var(--warning)' : 'var(--text-primary)' }}
          >
            +{localDelay.toFixed(1)}m
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Network Gain
          </div>
          <div
            className="text-sm font-bold"
            style={{ color: networkGain < 15 ? 'var(--success)' : 'var(--text-primary)' }}
          >
            −{networkGain.toFixed(1)}m
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Confidence
          </div>
          <div className="text-sm font-bold" style={{ color: conf.color }}>
            {pct}%
          </div>
        </div>
      </div>

      {/* Compare delta (only when this option is being compared) */}
      {isComparing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="px-4 pb-3"
        >
          <div
            className="rounded-lg p-3 text-xs flex flex-col gap-1"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--accent)33' }}
          >
            <div className="font-semibold mb-1" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
              DELTA COMPARISON
            </div>
            {Object.entries(option.predicted_delays).slice(0, 4).map(([trainId, delay]) => (
              <div key={trainId} className="flex items-center justify-between">
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{trainId}</span>
                <span style={{ color: delay > 10 ? 'var(--danger)' : 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                  {delay > 0 ? '+' : ''}{delay.toFixed(1)}m
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Action buttons */}
      <div
        className="flex gap-2 px-4 pb-4"
        style={{ borderTop: `1px solid ${isTop ? 'var(--accent)22' : 'var(--border)'}`, paddingTop: 12 }}
      >
        {/* Apply */}
        <button
          id={`btn-accept-rank-${option.rank}`}
          onClick={onAccept}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: isTop ? 'var(--accent)' : 'var(--surface-1)',
            color: isTop ? '#fff' : 'var(--text-primary)',
            border: `1px solid ${isTop ? 'var(--accent)' : 'var(--border)'}`,
            transitionDuration: 'var(--transition-hover)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 11, height: 11 }}>
            <path d="M5 13l4 4L19 7" />
          </svg>
          Apply
        </button>

        {/* Simulate */}
        <button
          onClick={onSimulate}
          className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-xs transition-all"
          style={{
            background: 'var(--surface-1)',
            color: 'var(--accent)',
            border: '1px solid var(--accent)33',
            transitionDuration: 'var(--transition-hover)',
          }}
          title="Load into Scenario Lab"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 10, height: 10 }}>
            <path d="M8 5v14l11-7z" />
          </svg>
          Sim
        </button>

        {/* Compare */}
        <button
          onClick={onCompare}
          className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-xs transition-all"
          style={{
            background: isComparing ? 'var(--secondary)22' : 'var(--surface-1)',
            color: 'var(--secondary)',
            border: `1px solid ${isComparing ? 'var(--secondary)44' : 'var(--border)'}`,
            transitionDuration: 'var(--transition-hover)',
          }}
          title="Show per-train delta"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 10, height: 10 }}>
            <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
          Δ
        </button>
      </div>
    </motion.div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function RecommendationCards({
  recommendation,
  onAccept,
  onOverride,
  isLoading = false,
  fullWidth = false,
}: Props) {
  const [showOverride, setShowOverride]     = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [comparingRank, setComparingRank]   = useState<number | null>(null)
  const { setActiveView }                   = useStore()

  if (isLoading) {
    return (
      <div
        className="rounded-xl p-8 flex flex-col items-center gap-3"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
      >
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full animate-bounce"
              style={{ background: 'var(--accent)', animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Computing optimal recommendations...
        </span>
      </div>
    )
  }

  if (!recommendation) {
    return (
      <div
        className="rounded-xl p-8 flex flex-col items-center gap-3"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
      >
        <div style={{ opacity: 0.4 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} style={{ width: 40, height: 40 }}>
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="text-center">
          <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            No active recommendation
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Recommendations appear when a conflict is detected and the optimizer runs.
          </p>
        </div>
      </div>
    )
  }

  const handleSimulate = (_option: RecommendationOption) => {
    // Navigate to scenario lab — operator can preview
    setActiveView('whatif')
  }

  return (
    <div
      className={`rounded-xl flex flex-col gap-4 p-4 ${fullWidth ? '' : ''}`}
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-heading font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            Recommended Actions
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Conflict {recommendation.conflict_id.slice(0, 12)}&hellip; &bull; {recommendation.options.length} option{recommendation.options.length !== 1 ? 's' : ''}
          </p>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded"
          style={{
            background: 'var(--surface-2)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
          }}
        >
          {recommendation.generated_by}
        </span>
      </div>

      {/* Option cards */}
      <div className="flex flex-col gap-3">
        {recommendation.options.map((option) => (
          <OptionCard
            key={option.rank}
            option={option}
            isTop={option.rank === 1}
            isComparing={comparingRank === option.rank}
            onAccept={() => onAccept(recommendation.id, option.rank)}
            onSimulate={() => handleSimulate(option)}
            onCompare={() => setComparingRank(comparingRank === option.rank ? null : option.rank)}
          />
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Override panel */}
      {!showOverride ? (
        <button
          id="btn-controller-override"
          onClick={() => setShowOverride(true)}
          className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs transition-all w-full"
          style={{
            background: 'var(--surface-2)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
            transitionDuration: 'var(--transition-hover)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 13, height: 13 }}>
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Controller Override
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Override reason (required)
          </label>
          <input
            id="input-override-reason"
            className="w-full px-3 py-2 rounded-lg text-xs"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-2)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
            placeholder="State reason for manual override..."
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              id="btn-confirm-override"
              onClick={() => {
                if (!overrideReason.trim()) return
                onOverride(recommendation.id, overrideReason || 'Controller override')
                setShowOverride(false)
                setOverrideReason('')
              }}
              className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: 'var(--danger)22',
                color: 'var(--danger)',
                border: '1px solid var(--danger)44',
                transitionDuration: 'var(--transition-hover)',
              }}
            >
              Confirm Override
            </button>
            <button
              onClick={() => { setShowOverride(false); setOverrideReason('') }}
              className="px-3 py-2 rounded-lg text-xs transition-all"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                transitionDuration: 'var(--transition-hover)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}