/**
 * WhatIfPanel — Scenario Lab
 * ==========================
 * Preset disruption scenarios with parameter sliders, running what-if
 * simulations and comparing KPI before/after.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation } from '@tanstack/react-query'
import { whatifAPI } from '../services/api'
import { useStore } from '../store/index'
import { WhatIfResult } from '../store/index'

interface Props {
  result: WhatIfResult | null
}

// ── Disruption presets ─────────────────────────────────────────────────────────
type ParamDef =
  | { key: string; label: string; type: 'number'; default: number; min: number; max: number }
  | { key: string; label: string; type: 'select'; options: string[] }

const DISRUPTION_TYPES: Array<{
  id: string
  label: string
  icon: string
  description: string
  params: ParamDef[]
}> = [
  {
    id: 'add_delay',
    label: 'Add Train Delay',
    icon: '⏱',
    description: 'Simulate a delay for a specific train and observe propagation effects.',
    params: [
      { key: 'delay_min', label: 'Delay (min)', type: 'number', default: 15, min: 1, max: 120 },
      { key: 'train_id',  label: 'Train ID',   type: 'select', options: ['12127','11301','51421','77605','13401','12128','11302','51422','59661','92501'] },
    ],
  },
  {
    id: 'close_platform',
    label: 'Close Platform',
    icon: '🚧',
    description: 'Block a station platform and see how trains reroute and queue.',
    params: [
      { key: 'station_id', label: 'Station',  type: 'select', options: ['MUM','KLD','LNL','PNE','SRT'] },
      { key: 'platform',   label: 'Platform', type: 'number', default: 2, min: 1, max: 4 },
    ],
  },
  {
    id: 'signal_failure',
    label: 'Signal Failure',
    icon: '🚦',
    description: 'Simulate a signal failure in a block section, forcing manual clearance.',
    params: [
      { key: 'block_id', label: 'Block', type: 'select', options: ['BLK_MUM_KLD','BLK_KLD_LNL','BLK_LNL_PNE','BLK_PNE_SRT'] },
    ],
  },
  {
    id: 'block_track',
    label: 'Block Track',
    icon: '🔴',
    description: 'Completely block a track section due to obstruction or maintenance.',
    params: [
      { key: 'block_id', label: 'Block', type: 'select', options: ['BLK_MUM_KLD','BLK_KLD_LNL','BLK_LNL_PNE','BLK_PNE_SRT'] },
    ],
  },
  {
    id: 'weather_event',
    label: 'Weather Event',
    icon: '🌧',
    description: 'Apply network-wide speed restrictions due to severe weather.',
    params: [
      { key: 'speed_factor', label: 'Speed Factor', type: 'number', default: 0.6, min: 0.1, max: 1.0 },
      { key: 'delay_add',    label: 'Delay Add (min)',     type: 'number', default: 5, min: 1, max: 60 },
    ],
  },
]

// ── KPI Compare card ──────────────────────────────────────────────────────────
function KPICompare({
  label, before, after, delta, unit = '',
}: {
  label: string
  before: number
  after: number
  delta: number
  unit?: string
}) {
  const improved = delta < 0
  const deltaColor = improved ? 'var(--success)' : delta > 0 ? 'var(--danger)' : 'var(--text-muted)'

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="flex items-end gap-2">
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Before</div>
          <div className="font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {typeof before === 'number' ? before.toFixed(1) : before}{unit}
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} className="w-3 h-3 mb-1">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>After</div>
          <div className="font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {typeof after === 'number' ? after.toFixed(1) : after}{unit}
          </div>
        </div>
        <div className="ml-auto">
          <div
            className="text-sm font-bold"
            style={{ color: deltaColor, fontFamily: 'var(--font-mono)' }}
          >
            {delta >= 0 ? '+' : ''}{typeof delta === 'number' ? delta.toFixed(1) : delta}{unit}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function WhatIfPanel({ result }: Props) {
  const [selectedType, setSelectedType] = useState(DISRUPTION_TYPES[0].id)
  const [params, setParams] = useState<Record<string, string | number>>({})
  const setWhatIfResult = useStore((s) => s.setWhatIfResult)

  const disruption = DISRUPTION_TYPES.find((d) => d.id === selectedType) ?? DISRUPTION_TYPES[0]

  const runMutation = useMutation({
    mutationFn: () => {
      const resolvedParams: Record<string, unknown> = {}
      for (const param of disruption.params) {
        resolvedParams[param.key] = params[param.key] ?? (param.type === 'number' ? param.default : param.type === 'select' ? param.options[0] : '')
      }
      return whatifAPI.simulate(selectedType, resolvedParams).then((r) => r.data)
    },
    onSuccess: (data) => {
      setWhatIfResult(data as WhatIfResult)
    },
  })

  const handleParamChange = (key: string, value: string | number) => {
    setParams((prev) => ({ ...prev, [key]: value }))
  }

  const getParamValue = (param: ParamDef): string | number => {
    if (param.key in params) return params[param.key]
    if (param.type === 'number') return param.default
    if (param.type === 'select') return param.options[0]
    return ''
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
      >
        <div>
          <h2
            className="font-heading font-semibold text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            Scenario Lab
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Simulate disruptions and compare before/after KPIs
          </p>
        </div>
        <span
          className="text-xs px-2 py-1 rounded"
          style={{
            background: 'var(--warning)18',
            border: '1px solid var(--warning)44',
            color: 'var(--warning)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          SIMULATION MODE
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Preset cards + params */}
        <div className="flex flex-col gap-3">
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
          >
            <div
              className="px-3 py-2.5 border-b text-xs font-semibold"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
            >
              DISRUPTION TYPE
            </div>
            <div className="flex flex-col gap-0.5 p-2">
              {DISRUPTION_TYPES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    setSelectedType(d.id)
                    setParams({})
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all w-full"
                  style={{
                    background: selectedType === d.id ? 'var(--accent)12' : 'transparent',
                    border: `1px solid ${selectedType === d.id ? 'var(--accent)44' : 'transparent'}`,
                    transitionDuration: 'var(--transition-hover)',
                  }}
                >
                  <span className="text-base flex-shrink-0">{d.icon}</span>
                  <span
                    className="text-xs font-medium"
                    style={{ color: selectedType === d.id ? 'var(--accent)' : 'var(--text-primary)' }}
                  >
                    {d.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div
            className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
          >
            <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              PARAMETERS
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {disruption.description}
            </p>
            {disruption.params.map((param) => (
              <div key={param.key} className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--secondary)' }}>
                  {param.label}
                </label>
                {param.type === 'number' ? (
                  <div className="flex flex-col gap-1">
                    <input
                      type="range"
                      min={param.min}
                      max={param.max}
                      value={Number(getParamValue(param))}
                      onChange={(e) => handleParamChange(param.key, Number(e.target.value))}
                      className="w-full"
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      <span>{param.min}</span>
                      <span className="font-bold" style={{ color: 'var(--accent)' }}>
                        {getParamValue(param)}
                      </span>
                      <span>{param.max}</span>
                    </div>
                  </div>
                ) : (
                  <select
                    value={String(getParamValue(param))}
                    onChange={(e) => handleParamChange(param.key, e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg text-xs"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {param.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}

            <button
              id="btn-run-whatif"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all"
              style={{
                background: runMutation.isPending ? 'var(--surface-2)' : 'var(--accent)',
                color: runMutation.isPending ? 'var(--text-muted)' : '#fff',
                transitionDuration: 'var(--transition-hover)',
              }}
            >
              {runMutation.isPending ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Running simulation...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Run Scenario
                </>
              )}
            </button>

            {runMutation.isError && (
              <div
                className="text-xs px-3 py-2 rounded-lg"
                style={{ background: 'var(--danger)18', color: 'var(--danger)', border: '1px solid var(--danger)44' }}
              >
                Simulation failed. Is the backend running?
              </div>
            )}
          </div>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-4"
              >
                {/* Narrative */}
                <div
                  className="rounded-xl p-4"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--accent)33' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">🧠</span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
                    >
                      AI NARRATIVE
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {result.narrative}
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>Affected trains:</span>
                    <div className="flex gap-1 flex-wrap">
                      {result.affected_trains.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--surface-2)', fontFamily: 'var(--font-mono)', color: 'var(--secondary)' }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* KPI Comparisons */}
                <div
                  className="rounded-xl p-4"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
                >
                  <div
                    className="text-xs font-semibold mb-3"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    KPI IMPACT
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <KPICompare
                      label="Average Delay"
                      before={result.before?.avg_delay_min ?? 0}
                      after={result.after?.avg_delay_min ?? 0}
                      delta={result.delta?.avg_delay_min ?? 0}
                      unit="m"
                    />
                    <KPICompare
                      label="Active Conflicts"
                      before={result.before?.active_conflicts ?? 0}
                      after={result.after?.active_conflicts ?? 0}
                      delta={result.delta?.active_conflicts ?? 0}
                    />
                    <KPICompare
                      label="Throughput"
                      before={result.before?.throughput_pct ?? 0}
                      after={result.after?.throughput_pct ?? 0}
                      delta={(result.after?.throughput_pct ?? 0) - (result.before?.throughput_pct ?? 0)}
                      unit="%"
                    />
                    <KPICompare
                      label="Trains Delayed"
                      before={result.before?.trains_delayed ?? 0}
                      after={result.after?.trains_delayed ?? 0}
                      delta={result.delta?.trains_delayed ?? 0}
                    />
                    <KPICompare
                      label="Block Utilization"
                      before={result.before?.block_utilization_pct ?? 0}
                      after={result.after?.block_utilization_pct ?? 0}
                      delta={(result.after?.block_utilization_pct ?? 0) - (result.before?.block_utilization_pct ?? 0)}
                      unit="%"
                    />
                    <KPICompare
                      label="Delay Reduction"
                      before={result.before?.delay_reduction_pct ?? 0}
                      after={result.after?.delay_reduction_pct ?? 0}
                      delta={(result.after?.delay_reduction_pct ?? 0) - (result.before?.delay_reduction_pct ?? 0)}
                      unit="%"
                    />
                  </div>

                  <div
                    className="text-xs text-right mt-3"
                    style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                  >
                    Computed in {result.execution_time_ms?.toFixed(1)}ms
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center gap-4 rounded-xl"
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  minHeight: 400,
                  color: 'var(--text-muted)',
                }}
              >
                <div style={{ fontSize: '3rem' }}>🔬</div>
                <div className="text-center">
                  <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    No scenario run yet
                  </div>
                  <div className="text-sm mt-1">
                    Select a disruption type and parameters, then click Run
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}