import { motion, AnimatePresence } from 'framer-motion'
import { Conflict, severityLabel, conflictTypeLabel } from '../types/conflict'
import clsx from 'clsx'

interface Props {
  conflicts: Conflict[]
  expanded?: boolean
}

function severityColors(severity: number) {
  const label = severityLabel(severity)
  if (label === 'critical') return { bg: 'hsl(0 84% 60% / 0.12)', border: 'hsl(0 84% 60% / 0.4)', text: 'hsl(0 84% 65%)', badge: 'badge-critical' }
  if (label === 'high')     return { bg: 'hsl(22 100% 55% / 0.1)', border: 'hsl(22 100% 55% / 0.35)', text: '#f97316', badge: 'badge-high' }
  if (label === 'medium')   return { bg: 'hsl(38 92% 60% / 0.1)', border: 'hsl(38 92% 60% / 0.35)', text: 'hsl(38 92% 60%)', badge: 'badge-medium' }
  return { bg: 'hsl(198 100% 54% / 0.08)', border: 'hsl(198 100% 54% / 0.3)', text: '#22d3ee', badge: 'badge-low' }
}

export function ConflictAlert({ conflicts, expanded = false }: Props) {
  const sorted = [...conflicts].sort((a, b) => b.severity - a.severity)

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--rail-text))' }}>
            {expanded ? 'Conflict Center' : 'Active Conflicts'}
          </h2>
          {conflicts.length > 0 && (
            <span
              className="status-dot danger"
              style={{ width: '8px', height: '8px' }}
            />
          )}
        </div>
        <span className={clsx('badge', conflicts.length > 0 ? 'badge-critical' : 'badge-success')}>
          {conflicts.length === 0 ? '✓ Clear' : `${conflicts.length} active`}
        </span>
      </div>

      <div className={clsx('flex flex-col gap-2 overflow-y-auto', expanded ? 'max-h-[600px]' : 'max-h-64')}>
        <AnimatePresence initial={false}>
          {sorted.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-8 flex flex-col items-center gap-2"
            >
              <span style={{ fontSize: '2rem' }}>✅</span>
              <p className="text-sm" style={{ color: 'hsl(var(--rail-text-3))' }}>
                Network clear — no conflicts detected
              </p>
            </motion.div>
          )}

          {sorted.map((conflict) => {
            const colors = severityColors(conflict.severity)
            const trainIds = conflict.affected_trains ?? conflict.trains_involved ?? []

            return (
              <motion.div
                key={conflict.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl p-3 flex flex-col gap-2"
                style={{
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                }}
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                  <span className="mono text-xs font-semibold" style={{ color: 'hsl(var(--rail-text-2))' }}>
                    {trainIds.join(' ↔ ')}
                  </span>
                  <span className={clsx('badge', colors.badge)} style={{ flexShrink: 0 }}>
                    {severityLabel(conflict.severity)}
                  </span>
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
                      style={{
                        width: `${Math.min(conflict.severity * 100, 100)}%`,
                        background: colors.text,
                      }}
                    />
                  </div>
                  <span className="mono text-xs" style={{ color: colors.text }}>
                    {(conflict.severity * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Resolution options (expanded only) */}
                {expanded && conflict.resolution_options && conflict.resolution_options.length > 0 && (
                  <div className="flex flex-col gap-1 mt-1 pl-2 border-l-2"
                       style={{ borderColor: colors.border }}>
                    <span className="label" style={{ fontSize: '0.65rem' }}>Suggested resolutions</span>
                    {conflict.resolution_options.slice(0, 2).map((opt, i) => (
                      <p key={i} className="text-xs" style={{ color: 'hsl(var(--rail-text-2))' }}>
                        {i + 1}. {opt}
                      </p>
                    ))}
                  </div>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
