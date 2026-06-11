/**
 * KPIDashboard — Compact Inline Operational Strip
 * =================================================
 * Pipe-separated KPI values displayed inside the header bar.
 * Monospaced numbers, color-coded by threshold.
 * No cards, no titles — just the numbers a controller needs at a glance.
 * Minimum font sizes: labels 11px, values 13px (SKILL.md compliant).
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
      color: 'rgba(255,255,255,0.18)',
      fontSize: 13,
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
        fontSize: 11,
        color: 'rgba(255,255,255,0.42)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
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
      color: 'rgba(255,255,255,0.88)',
    },
    {
      label: 'Conflicts',
      value: String(d.active_conflicts),
      color: d.active_conflicts > 0 ? '#FCA5A5' : '#4ADE80',
      blink: d.active_conflicts > 0,
    },
    {
      label: 'Avg Delay',
      value: `${d.avg_delay_min.toFixed(1)}m`,
      color: d.avg_delay_min > 15 ? '#FCA5A5' : d.avg_delay_min > 5 ? '#FBBF24' : '#4ADE80',
    },
    {
      label: 'Throughput',
      value: `${d.throughput_pct.toFixed(0)}%`,
      color: d.throughput_pct >= 90 ? '#4ADE80' : d.throughput_pct >= 75 ? '#FBBF24' : '#FCA5A5',
    },
    {
      label: 'Delay Saved',
      value: `${d.delay_reduction_pct.toFixed(0)}%`,
      color: 'rgba(255,255,255,0.7)',
    },
    {
      label: 'AI Rec',
      value: String((d.recommendations_accepted ?? 0) + (d.recommendations_overridden ?? 0)),
      color: 'rgba(255,255,255,0.65)',
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
