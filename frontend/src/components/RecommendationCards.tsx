import { motion } from 'framer-motion'
import { Recommendation, RecommendationOption } from '../types/recommendation'
import clsx from 'clsx'

interface Props {
  recommendation: Recommendation | null
  onAccept: (recommendationId: string, optionRank: number) => void
  onOverride: (recommendationId: string, reason: string) => void
  isLoading?: boolean
}

function confidenceBadge(c: string) {
  return clsx('px-2 py-0.5 rounded-full text-xs font-semibold border', {
    'bg-emerald-900/40 text-emerald-400 border-emerald-700': c === 'High',
    'bg-amber-900/40 text-amber-400 border-amber-700': c === 'Medium',
    'bg-red-900/40 text-red-400 border-red-700': c === 'Low',
  })
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
  const totalDelay = Object.values(option.predicted_delays).reduce((a, b) => a + b, 0)

  return (
    <motion.div
      className={clsx(
        'rounded-xl border p-4 flex flex-col gap-3',
        isTop
          ? 'border-indigo-700 bg-indigo-950/40'
          : 'border-slate-700 bg-slate-800/40'
      )}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (option.rank - 1) * 0.08 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center',
              isTop ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'
            )}
          >
            {option.rank}
          </span>
          <span className={confidenceBadge(option.confidence)}>{option.confidence}</span>
          {isTop && (
            <span className="text-xs font-semibold text-indigo-400 bg-indigo-950 border border-indigo-800 px-2 py-0.5 rounded-full">
              Recommended
            </span>
          )}
        </div>
        <span className="text-xs font-mono text-slate-400">
          Σ{option.total_weighted_delay.toFixed(1)} wt·min
        </span>
      </div>

      <p className="text-sm text-slate-300 leading-relaxed">{option.explanation}</p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {Object.entries(option.predicted_delays).map(([trainId, delay]) => (
          <div key={trainId} className="flex justify-between bg-slate-900/60 rounded-lg px-3 py-1.5">
            <span className="font-mono text-slate-400">{trainId}</span>
            <span
              className={clsx('font-semibold', delay > 10 ? 'text-red-400' : 'text-emerald-400')}
            >
              +{delay.toFixed(1)} min
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-1">
        {option.actions.map((action, i) => (
          <span
            key={i}
            className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-300"
          >
            {action.action_type === 'hold'
              ? `Hold ${action.train_id} ${action.duration_min}m`
              : `${action.action_type} ${action.train_id}`}
          </span>
        ))}
      </div>

      <button onClick={onAccept} className="btn-primary text-sm w-full mt-1">
        Accept Option {option.rank}
      </button>
    </motion.div>
  )
}

export function RecommendationCards({ recommendation, onAccept, onOverride, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="card flex flex-col gap-3">
        <h2 className="font-semibold text-slate-200 text-sm">Recommendations</h2>
        <div className="text-slate-500 text-sm text-center py-8">
          <div className="inline-block w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
          <p>Optimizing precedence…</p>
        </div>
      </div>
    )
  }

  if (!recommendation) {
    return (
      <div className="card flex flex-col gap-3">
        <h2 className="font-semibold text-slate-200 text-sm">Recommendations</h2>
        <p className="text-slate-500 text-sm text-center py-8">
          No active recommendations. Conflicts will trigger optimization automatically.
        </p>
      </div>
    )
  }

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-200 text-sm">Recommendations</h2>
        <span className="text-xs text-slate-500 font-mono">
          {new Date(recommendation.generated_time).toLocaleTimeString()}
        </span>
      </div>

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

      <button
        onClick={() => onOverride(recommendation.id, 'Controller manual override')}
        className="btn-secondary text-sm w-full"
      >
        Override — Proceed All
      </button>
    </div>
  )
}
