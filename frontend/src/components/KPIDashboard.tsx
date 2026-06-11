/**
 * KPIDashboard — Compact Inline Operational Strip
 * =================================================
 * Pipe-separated KPI values displayed inside the header bar.
 * Monospaced numbers, color-coded by threshold.
 * No cards, no titles, just the numbers a controller needs at a glance.
 */

import { KPIMetrics } from '../types/api'
import { Train } from '../types/train'
import { useStore } from '../store/index'

interface Props {
  metrics: KPIMetrics
  trains: Record<string, Train>
}

interface Metric {
  label: string
  value: string
  color: string
  blink?: boolean
}

function Pip() {
  return (
    <span style={{
      color: 'rgba(255,255,255,0.2)',
      fontSize: '0.7rem',
      margin: '0 8px',
      userSelect: 'none',
    }}>│</span>
  )
}

function KPIItem({ label, value, color, blink }: Metric) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.58rem',
        color: 'rgba(255,255,255,0.38)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.82rem',
        fontWeight: 700,
        color,
        letterSpacing: '0.02em',
        animation: blink ? 'blink-live 1.5s ease-in-out infinite' : undefined,
      }}>
        {value}
      </span>
    </div>
  )
}

export function KPIDashboard({ metrics, trains }: Props) {
  const smoothedKpis = useStore(s => s.smoothedKpis)
  const d = smoothedKpis ?? metrics

  const totalTrains = Object.keys(trains).length

  const items: Metric[] = [
    {
      label: 'Trains',
      value: String(d.active_trains ?? totalTrains),
      color: 'rgba(255,255,255,0.85)',
    },
    {
      label: 'Conflicts',
      value: String(d.active_conflicts),
      color: d.active_conflicts > 0 ? '#FCA5A5' : '#4ADE80',
      blink: d.active_conflicts > 0,
    },
    {
      label: 'Delay',
      value: `${d.avg_delay_min.toFixed(1)}m`,
      color: d.avg_delay_min > 15 ? '#FCA5A5' : d.avg_delay_min > 5 ? '#FBBF24' : '#4ADE80',
    },
    {
      label: 'Throughput',
      value: `${d.throughput_pct.toFixed(0)}%`,
      color: d.throughput_pct >= 90 ? '#4ADE80' : '#FBBF24',
    },
    {
      label: 'Saved',
      value: `${d.delay_reduction_pct.toFixed(0)}%`,
      color: 'rgba(255,255,255,0.7)',
    },
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
      {items.map((item, i) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <Pip />}
          <KPIItem {...item} />
        </div>
      ))}
    </div>
  )
}
