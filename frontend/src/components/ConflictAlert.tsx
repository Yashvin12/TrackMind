import { motion, AnimatePresence } from 'framer-motion'
import { Conflict, severityLabel, conflictTypeLabel } from '../types/conflict'
import clsx from 'clsx'

interface Props {
  conflicts: Conflict[]
}

function severityBadgeClass(severity: number): string {
  const label = severityLabel(severity)
  return clsx('px-2 py-0.5 rounded-full text-xs font-semibold border', {
    'badge-conflict-low': label === 'low',
    'badge-conflict-medium': label === 'medium',
    'badge-conflict-high': label === 'high' || label === 'critical',
  })
}

export function ConflictAlert({ conflicts }: Props) {
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-200 text-sm">Active Conflicts</h2>
        <span
          className={clsx(
            'text-xs font-bold px-2 py-0.5 rounded-full',
            conflicts.length > 0
              ? 'bg-red-900/50 text-red-400 border border-red-800'
              : 'bg-emerald-900/50 text-emerald-400 border border-emerald-800'
          )}
        >
          {conflicts.length === 0 ? 'Clear' : `${conflicts.length} active`}
        </span>
      </div>

      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
        <AnimatePresence initial={false}>
          {conflicts.length === 0 && (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-slate-500 text-sm text-center py-4"
            >
              No conflicts detected
            </motion.p>
          )}

          {conflicts.map((conflict) => (
            <motion.div
              key={conflict.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="bg-slate-800/70 rounded-lg p-3 border border-slate-700 flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">
                  {conflict.trains_involved.join(' ↔ ')}
                </span>
                <span className={severityBadgeClass(conflict.severity)}>
                  {severityLabel(conflict.severity)}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-300">
                <span className="font-medium">{conflictTypeLabel(conflict.conflict_type)}</span>
                <span className="text-slate-500">·</span>
                <span className="font-mono text-slate-400">{conflict.block_section}</span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span
                  className={clsx(
                    'font-mono font-semibold',
                    conflict.time_to_conflict_min <= 10 ? 'text-red-400' : 'text-amber-400'
                  )}
                >
                  T−{conflict.time_to_conflict_min.toFixed(1)} min
                </span>
                <div className="flex-1 h-1 rounded-full bg-slate-700">
                  <div
                    className="h-1 rounded-full bg-red-500 transition-all duration-500"
                    style={{ width: `${Math.min(conflict.severity * 100, 100)}%` }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
