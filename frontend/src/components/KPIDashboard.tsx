import { KPIMetrics } from '../types/api'
import { Train } from '../types/train'
import { motion } from 'framer-motion'

interface KPICardProps {
  label: string
  value: string | number
  sub: string
  accent: string
  blink?: boolean
  index: number
}

function KPICard({ label, value, sub, accent, blink = false, index }: KPICardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="flex flex-col gap-0.5"
      style={{ minWidth: 80 }}
    >
      <div
        className="text-xs"
        style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}
      >
        {label.toUpperCase()}
      </div>
      <div
        className="font-heading font-bold text-base leading-tight"
        style={{
          color: accent,
          fontFamily: 'var(--font-mono)',
          animation: blink ? 'pulse 1.5s ease-in-out infinite' : undefined,
        }}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>
        {sub}
      </div>
    </motion.div>
  )
}

interface Props {
  metrics: KPIMetrics
  trains: Record<string, Train>
}

export function KPIDashboard({ metrics, trains }: Props) {
  const totalTrains = Object.keys(trains).length

  const cards: Omit<KPICardProps, 'index'>[] = [
    {
      label: 'Trains Active',
      value: `${metrics.active_trains ?? totalTrains}`,
      sub: `${metrics.completed_trains ?? 0} completed`,
      accent: 'var(--accent)',
    },
    {
      label: 'Conflicts',
      value: metrics.active_conflicts,
      sub: metrics.active_conflicts > 0 ? 'needs attention' : 'network clear',
      accent: metrics.active_conflicts > 0 ? 'var(--danger)' : 'var(--success)',
      blink: metrics.active_conflicts > 0,
    },
    {
      label: 'Avg Delay',
      value: `${metrics.avg_delay_min.toFixed(1)}m`,
      sub: 'network average',
      accent:
        metrics.avg_delay_min > 15
          ? 'var(--danger)'
          : metrics.avg_delay_min > 5
          ? 'var(--warning)'
          : 'var(--success)',
    },
    {
      label: 'Throughput',
      value: `${metrics.throughput_pct.toFixed(0)}%`,
      sub: 'of schedule',
      accent: metrics.throughput_pct >= 90 ? 'var(--success)' : 'var(--warning)',
    },
    {
      label: 'Accepted',
      value: metrics.recommendations_accepted,
      sub: 'recommendations',
      accent: 'var(--success)',
    },
    {
      label: 'Overridden',
      value: metrics.recommendations_overridden,
      sub: 'by controller',
      accent: '#f97316',
    },
    {
      label: 'Delay Saved',
      value: `${metrics.delay_reduction_pct.toFixed(0)}%`,
      sub: 'vs unassisted',
      accent: 'var(--secondary)',
    },
  ]

  return (
    <div className="flex items-center gap-6 overflow-x-auto pb-0.5">
      {cards.map((card, i) => (
        <div key={card.label} className="flex-shrink-0">
          <KPICard {...card} index={i} />
        </div>
      ))}
    </div>
  )
}
