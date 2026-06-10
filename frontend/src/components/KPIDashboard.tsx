/**
 * KPIDashboard — Smoothed, Animated KPI Bar
 * ==========================================
 * - Values update at most every 5 seconds unless a significant event occurs
 *   (conflict count change, simulation toggle, recommendation applied).
 * - Numbers animate from old to new value using Framer Motion.
 * - Stable layout: no remounts, no flicker.
 */

import { motion } from 'framer-motion'
import { KPIMetrics } from '../types/api'
import { Train } from '../types/train'
import { useStore } from '../store/index'

interface KPICardProps {
  label: string
  value: number
  displayValue: string
  sub: string
  accent: string
  blink?: boolean
  index: number
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ label, displayValue, sub, accent, blink = false, index }: Omit<KPICardProps, 'value'>) {

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
        style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}
      >
        {label}
      </div>
      <div
        className="font-heading font-bold text-base leading-tight tabular-nums"
        style={{
          color: accent,
          fontFamily: 'var(--font-mono)',
          animation: blink ? 'pulse 1.5s ease-in-out infinite' : undefined,
        }}
      >
        {displayValue}
      </div>
      <div className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>
        {sub}
      </div>
    </motion.div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────
function KPIDivider() {
  return (
    <div
      className="flex-shrink-0 self-stretch"
      style={{ width: 1, background: 'var(--border)', margin: '2px 0' }}
    />
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
interface Props {
  metrics: KPIMetrics
  trains: Record<string, Train>
}

export function KPIDashboard({ metrics, trains }: Props) {
  const smoothedKpis = useStore((s) => s.smoothedKpis)

  // Use smoothedKpis for display if available, falling back to metrics
  const display = smoothedKpis ?? metrics

  const totalTrains = Object.keys(trains).length

  const cards: Omit<KPICardProps, 'index'>[] = [
    {
      label: 'Active Trains',
      value: display.active_trains ?? totalTrains,
      displayValue: String(display.active_trains ?? totalTrains),
      sub: `${display.completed_trains ?? 0} completed`,
      accent: 'var(--accent)',
    },
    {
      label: 'Conflicts',
      value: display.active_conflicts,
      displayValue: String(display.active_conflicts),
      sub: display.active_conflicts > 0 ? 'needs attention' : 'network clear',
      accent: display.active_conflicts > 0 ? 'var(--danger)' : 'var(--success)',
      blink: display.active_conflicts > 0,
    },
    {
      label: 'Avg Delay',
      value: display.avg_delay_min,
      displayValue: `${display.avg_delay_min.toFixed(1)}m`,
      sub: 'network average',
      accent:
        display.avg_delay_min > 15
          ? 'var(--danger)'
          : display.avg_delay_min > 5
          ? 'var(--warning)'
          : 'var(--success)',
    },
    {
      label: 'Throughput',
      value: display.throughput_pct,
      displayValue: `${display.throughput_pct.toFixed(0)}%`,
      sub: 'of schedule',
      accent: display.throughput_pct >= 90 ? 'var(--success)' : 'var(--warning)',
    },
    {
      label: 'Accepted',
      value: display.recommendations_accepted,
      displayValue: String(display.recommendations_accepted),
      sub: 'recommendations',
      accent: 'var(--success)',
    },
    {
      label: 'Overridden',
      value: display.recommendations_overridden,
      displayValue: String(display.recommendations_overridden),
      sub: 'by controller',
      accent: '#f97316',
    },
    {
      label: 'Delay Saved',
      value: display.delay_reduction_pct,
      displayValue: `${display.delay_reduction_pct.toFixed(0)}%`,
      sub: 'vs unassisted',
      accent: 'var(--secondary)',
    },
  ]

  return (
    <div className="flex items-center gap-5 overflow-x-auto pb-0.5">
      {cards.map((card, i) => (
        <div key={card.label} className="flex items-center gap-5 flex-shrink-0">
          {i > 0 && <KPIDivider />}
          <KPICard {...card} index={i} />
        </div>
      ))}
    </div>
  )
}
