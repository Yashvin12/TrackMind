import { motion } from 'framer-motion'
import { useState } from 'react'
import { Recommendation, RecommendationOption } from '../types/recommendation'

interface Props {
  recommendation: Recommendation | null
  onAccept: (recommendationId: string, optionRank?: number) => void
  onOverride: (recommendationId: string, reason: string) => void
  isLoading?: boolean
  fullWidth?: boolean
}

function confidenceBadge(c: string) {
  if (c === 'High')   return { bg: 'var(--success)18', border: 'var(--success)44', color: 'var(--success)' }
  if (c === 'Medium') return { bg: 'var(--warning)18', border: 'var(--warning)44', color: 'var(--warning)' }
  return { bg: 'var(--danger)18', border: 'var(--danger)44', color: 'var(--danger)' }
}

function actionIcon(type: string) {
  if (type === 'hold')    return '⏸'
  if (type === 'proceed') return '▶'
  if (type === 'reroute') return '↩'
  if (type === 'loop')    return '🔄'
  return '•'
}

function OptionCard({
  option,
  onAccept,
  isTop,
}: {
  option: RecommendationOption
  onAccept: () => void
  isTop: boolean
}) {
  const [showShap, setShowShap] = useState(false)
  const conf = confidenceBadge(option.confidence)

  // Find worst delay for display
  const maxDelay = Math.max(...Object.values(option.predicted_delays), 0)

  return (
    <motion.div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: isTop ? 'var(--accent)08' : 'var(--surface-2)',
        border: `1px solid ${isTop ? 'var(--accent)33' : 'var(--border)'}`,
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (option.rank - 1) * 0.08 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Rank badge */}
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{
              background: isTop ? 'var(--accent)' : 'var(--surface-1)',
              color: isTop ? '#fff' : 'var(--text-muted)',
            }}
          >
            {option.rank}
          </span>
          {isTop && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'var(--accent)22', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
            >
              RECOMMENDED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Confidence */}
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ background: conf.bg, border: `1px solid ${conf.border}`, color: conf.color, fontFamily: 'var(--font-mono)' }}
          >
            {option.confidence}
          </span>
          {/* Acceptance probability */}
          <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {(option.acceptance_probability * 100).toFixed(0)}% accept
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5">
        {option.actions.map((action, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
          >
            <span>{actionIcon(action.action_type)}</span>
            <span
              className="font-semibold"
              style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
            >
              {action.action_type.toUpperCase()}
            </span>
            <span style={{ color: 'var(--secondary)', fontFamily: 'var(--font-mono)' }}>
              {action.train_id}
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

      {/* Explanation */}
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {option.explanation}
      </p>

      {/* Impact metrics */}
      <div className="flex items-center gap-4 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Weighted delay: </span>
          <span style={{ color: option.total_weighted_delay > 20 ? 'var(--danger)' : 'var(--success)' }}>
            {option.total_weighted_delay.toFixed(1)}m
          </span>
        </div>
        {maxDelay > 0 && (
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Max delay: </span>
            <span style={{ color: 'var(--warning)' }}>{maxDelay.toFixed(1)}m</span>
          </div>
        )}
      </div>

      {/* SHAP toggle */}
      {option.shap_explanation && Object.keys(option.shap_explanation).length > 0 && (
        <div>
          <button
            onClick={() => setShowShap(!showShap)}
            className="text-xs transition-all"
            style={{ color: 'var(--accent)', transitionDuration: 'var(--transition-hover)' }}
          >
            {showShap ? '▲ Hide' : '▼ Show'} SHAP reasoning
          </button>
          {showShap && (
            <div className="mt-2 flex flex-col gap-1">
              {Object.entries(option.shap_explanation).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <span className="w-28 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {key.replace(/_/g, ' ')}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-1)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(Math.abs(val) * 100, 100)}%`,
                        background: val >= 0 ? 'var(--success)' : 'var(--danger)',
                      }}
                    />
                  </div>
                  <span style={{ color: val >= 0 ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
                    {val >= 0 ? '+' : ''}{val.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Accept button */}
      <button
        id={`btn-accept-rank-${option.rank}`}
        onClick={onAccept}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all"
        style={{
          background: isTop ? 'var(--accent)' : 'var(--surface-1)',
          color: isTop ? '#fff' : 'var(--text-primary)',
          border: `1px solid ${isTop ? 'var(--accent)' : 'var(--border)'}`,
          transitionDuration: 'var(--transition-hover)',
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
          <path d="M5 13l4 4L19 7" />
        </svg>
        Apply Option {option.rank}
      </button>
    </motion.div>
  )
}

export function RecommendationCards({
  recommendation,
  onAccept,
  onOverride,
  isLoading = false,
  fullWidth = false,
}: Props) {
  const [showOverride, setShowOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')

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
              style={{
                background: 'var(--accent)',
                animationDelay: `${i * 0.15}s`,
              }}
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
        <div style={{ fontSize: '2.5rem' }}>🧩</div>
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

  return (
    <div
      className={`rounded-xl flex flex-col gap-4 p-4 ${fullWidth ? '' : ''}`}
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2
            className="font-heading font-semibold text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            Decision Panel
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Conflict {recommendation.conflict_id.slice(0, 12)}&hellip; &bull; {recommendation.options.length} options
          </p>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Option cards */}
      <div className="flex flex-col gap-3">
        {recommendation.options.map((option) => (
          <OptionCard
            key={option.rank}
            option={option}
            isTop={option.rank === 1}
            onAccept={() => onAccept(recommendation.id, option.rank)}
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
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
              onClick={() => {
                setShowOverride(false)
                setOverrideReason('')
              }}
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