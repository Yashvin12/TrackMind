import { motion } from 'framer-motion'
import { KPIMetrics } from '../types/api'

interface Props {
  metrics: KPIMetrics | null
}

interface KPICardProps {
  label: string
  value: string | number
  sub?: string
  color?: string
  index: number
}

function KPICard({ label, value, sub, color = 'text-indigo-400', index }: KPICardProps) {
  return (
    <motion.div
      className="card flex flex-col gap-1"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold font-mono ${color}`}>{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </motion.div>
  )
}

export function KPIDashboard({ metrics }: Props) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="card animate-pulse">
            <div className="h-3 bg-slate-800 rounded w-2/3 mb-2" />
            <div className="h-7 bg-slate-800 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  const cards: Omit<KPICardProps, 'index'>[] = [
    {
      label: 'Active Trains',
      value: metrics.total_trains,
      sub: 'on section',
      color: 'text-blue-400',
    },
    {
      label: 'Conflicts',
      value: metrics.active_conflicts,
      sub: 'active',
      color: metrics.active_conflicts > 0 ? 'text-red-400' : 'text-emerald-400',
    },
    {
      label: 'Avg Delay',
      value: `${metrics.avg_delay_min.toFixed(1)} min`,
      sub: 'current',
      color: 'text-amber-400',
    },
    {
      label: 'Throughput',
      value: `${metrics.throughput_pct.toFixed(0)}%`,
      sub: 'of schedule',
      color: 'text-indigo-400',
    },
    {
      label: 'Accepted',
      value: metrics.recommendations_accepted,
      sub: 'recommendations',
      color: 'text-emerald-400',
    },
    {
      label: 'Overridden',
      value: metrics.recommendations_overridden,
      sub: 'by controller',
      color: 'text-orange-400',
    },
    {
      label: 'Delay Reduction',
      value: `${metrics.delay_reduction_pct.toFixed(0)}%`,
      sub: 'vs no system',
      color: 'text-emerald-400',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      {cards.map((card, i) => (
        <KPICard key={card.label} {...card} index={i} />
      ))}
    </div>
  )
}
