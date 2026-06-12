/**
 * WhatIfPanel — Scenario Lab (Industrial Light Mode)
 * ===================================================
 * Split-view layout:
 *  Left col:  Disruption type selector + parameter sliders
 *  Right col: BEFORE KPI table (top) / AFTER KPI table (bottom)
 *             Loading spinner replaces right panel during simulation.
 *
 * Design rules:
 *  - bg-white panels, border border-slate-300, rounded-sm
 *  - All numbers in font-mono
 *  - No dark: classes, no shadows
 */

import { useState, memo } from 'react'
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
    description: 'Simulate a delay for a specific train and observe cascade propagation effects.',
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
    description: 'Apply network-wide speed restrictions due to severe weather conditions.',
    params: [
      { key: 'speed_factor', label: 'Speed Factor', type: 'number', default: 0.6, min: 0.1, max: 1.0 },
      { key: 'delay_add',    label: 'Delay Add (min)',     type: 'number', default: 5, min: 1, max: 60 },
    ],
  },
]

// KPI definitions for the before/after tables
const KPI_ROWS: Array<{
  key: keyof NonNullable<WhatIfResult>['before']
  label: string
  unit: string
  lowerIsBetter: boolean
}> = [
  { key: 'throughput_pct',       label: 'Throughput',        unit: '%',  lowerIsBetter: false },
  { key: 'avg_delay_min',        label: 'Avg Delay',         unit: 'min', lowerIsBetter: true },
  { key: 'trains_delayed',       label: 'Trains Delayed',    unit: '',   lowerIsBetter: true },
  { key: 'active_conflicts',     label: 'Active Conflicts',  unit: '',   lowerIsBetter: true },
  { key: 'block_utilization_pct', label: 'Block Utilization', unit: '%', lowerIsBetter: false },
  { key: 'delay_reduction_pct',  label: 'Delay Reduction',   unit: '%',  lowerIsBetter: false },
]

// ── KPI Table ──────────────────────────────────────────────────────────────────
function KPITable({
  label,
  data,
  compare,
  phase,
}: {
  label: 'BEFORE' | 'AFTER'
  data: WhatIfResult['before'] | null
  compare?: WhatIfResult['before'] | null
  phase: 'before' | 'after'
}) {
  return (
    <div style={{
      flex: 1,
      border: '1px solid #CBD5E1',
      borderRadius: 2,
      overflow: 'hidden',
      background: '#FFFFFF',
    }}>
      {/* Table header bar */}
      <div style={{
        padding: '5px 12px',
        background: phase === 'before' ? '#F1F5F9' : (label === 'AFTER' ? '#F0FDF4' : '#F1F5F9'),
        borderBottom: '1px solid #CBD5E1',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.07em',
          color: phase === 'after' ? '#15803D' : '#475569',
        }}>
          {label}
        </span>
        {phase === 'after' && (
          <span style={{ fontSize: '0.6rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
            — scenario result
          </span>
        )}
      </div>

      {/* Rows */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {KPI_ROWS.map(({ key, label: rowLabel, unit, lowerIsBetter }, i) => {
            const val = data?.[key] ?? null
            const compareVal = compare?.[key] ?? null
            const delta = val !== null && compareVal !== null ? (val as number) - (compareVal as number) : null
            // For "after" phase, compare against "before" (compareVal is before)
            const improved = delta !== null && (lowerIsBetter ? delta < 0 : delta > 0)
            const worsened = delta !== null && (lowerIsBetter ? delta > 0 : delta < 0)
            const deltaColor = improved ? '#16A34A' : worsened ? '#DC2626' : '#64748B'
            const deltaArrow = improved ? '↓' : worsened ? '↑' : '→'

            return (
              <tr key={key} style={{
                borderBottom: i < KPI_ROWS.length - 1 ? '1px solid #F1F5F9' : undefined,
                background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
              }}>
                <td style={{
                  padding: '5px 12px',
                  fontSize: '0.7rem',
                  color: '#475569',
                  width: '55%',
                  borderRight: '1px solid #F1F5F9',
                }}>
                  {rowLabel}
                </td>
                <td style={{
                  padding: '5px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#1E293B',
                  textAlign: 'right',
                }}>
                  {val !== null ? `${(val as number).toFixed(1)}${unit}` : '—'}
                </td>
                {phase === 'after' && delta !== null && (
                  <td style={{
                    padding: '5px 8px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: deltaColor,
                    textAlign: 'right',
                    width: 60,
                  }}>
                    {deltaArrow} {Math.abs(delta).toFixed(1)}{unit}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Industrial Spinner ─────────────────────────────────────────────────────────
function IndustrialSpinner() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      gap: 14,
      minHeight: 200,
    }}>
      <svg width={40} height={40} viewBox="0 0 40 40" style={{ animation: 'spin 1s linear infinite' }}>
        <circle cx={20} cy={20} r={16} fill="none" stroke="#E2E8F0" strokeWidth={3} />
        <circle cx={20} cy={20} r={16} fill="none" stroke="#1E5AA8" strokeWidth={3}
          strokeDasharray="60 40" strokeLinecap="round" />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem',
          fontWeight: 700,
          color: '#1E293B',
          letterSpacing: '0.04em',
          marginBottom: 4,
        }}>
          RUNNING SIMULATION
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.62rem',
          color: '#94A3B8',
        }}>
          Computing optimal path…
        </div>
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export const WhatIfPanel = memo(function WhatIfPanel({ result }: Props) {
  const [selectedType, setSelectedType] = useState(DISRUPTION_TYPES[0].id)
  const [params, setParams] = useState<Record<string, string | number>>({})
  const setWhatIfResult = useStore((s) => s.setWhatIfResult)

  const disruption = DISRUPTION_TYPES.find((d) => d.id === selectedType) ?? DISRUPTION_TYPES[0]

  const runMutation = useMutation({
    mutationFn: () => {
      const resolvedParams: Record<string, unknown> = {}
      for (const param of disruption.params) {
        resolvedParams[param.key] = params[param.key] ?? (
          param.type === 'number' ? param.default :
          param.type === 'select' ? param.options[0] : ''
        )
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#F8FAFC' }}>

      {/* Panel header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 12px',
        background: '#1A3057',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} style={{ width: 13, height: 13 }}>
            <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.07em',
            color: 'rgba(255,255,255,0.85)',
          }}>
            SCENARIO LAB
          </span>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.58rem',
          fontWeight: 700,
          letterSpacing: '0.05em',
          background: 'rgba(217,119,6,0.25)',
          border: '1px solid rgba(251,191,36,0.3)',
          color: '#FCD34D',
          padding: '1px 8px',
          borderRadius: 2,
        }}>
          SIMULATION MODE
        </span>
      </div>

      {/* Body: two columns */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        gap: 0,
      }}>
        {/* ── Left: Disruption type + parameters ── */}
        <div style={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          background: '#FFFFFF',
        }}>
          {/* Disruption type list */}
          <div style={{
            padding: '5px 8px 4px',
            background: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              fontWeight: 700,
              letterSpacing: '0.07em',
              color: '#94A3B8',
            }}>
              DISRUPTION TYPE
            </span>
          </div>
          {DISRUPTION_TYPES.map((d) => (
            <button
              key={d.id}
              onClick={() => { setSelectedType(d.id); setParams({}) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                textAlign: 'left',
                background: selectedType === d.id ? '#EFF6FF' : 'transparent',
                borderBottom: '1px solid #F1F5F9',
                border: 'none',
                borderLeft: selectedType === d.id ? '3px solid #1E5AA8' : '3px solid transparent',
                cursor: 'pointer',
                width: '100%',
                transition: 'all 100ms ease',
              }}
            >
              <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>{d.icon}</span>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: selectedType === d.id ? 600 : 400,
                color: selectedType === d.id ? '#1E3A8A' : '#475569',
                lineHeight: 1.3,
              }}>
                {d.label}
              </span>
            </button>
          ))}

          {/* Parameters */}
          <div style={{
            padding: '8px 10px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            flex: 1,
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              fontWeight: 700,
              letterSpacing: '0.07em',
              color: '#94A3B8',
            }}>
              PARAMETERS
            </span>
            <p style={{ fontSize: '0.68rem', color: '#64748B', lineHeight: 1.5, margin: 0 }}>
              {disruption.description}
            </p>
            {disruption.params.map((param) => (
              <div key={param.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  color: '#334155',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {param.label}
                </label>
                {param.type === 'number' ? (
                  <div>
                    <input
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={param.max <= 1 ? 0.05 : 1}
                      value={Number(getParamValue(param))}
                      onChange={(e) => handleParamChange(param.key, Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#1E5AA8' }}
                    />
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.6rem',
                      color: '#94A3B8',
                      fontFamily: 'var(--font-mono)',
                      marginTop: 1,
                    }}>
                      <span>{param.min}</span>
                      <span style={{ fontWeight: 700, color: '#1E5AA8' }}>
                        {getParamValue(param)}
                      </span>
                      <span>{param.max}</span>
                    </div>
                  </div>
                ) : (
                  <select
                    value={String(getParamValue(param))}
                    onChange={(e) => handleParamChange(param.key, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '3px 6px',
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      border: '1px solid #CBD5E1',
                      borderRadius: 2,
                      background: '#FFFFFF',
                      color: '#1E293B',
                    }}
                  >
                    {param.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}

            {/* Run button */}
            <button
              id="btn-run-whatif"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              style={{
                marginTop: 4,
                padding: '8px 0',
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                letterSpacing: '0.05em',
                borderRadius: 2,
                border: runMutation.isPending ? '1px solid #CBD5E1' : '1px solid #1E5AA8',
                background: runMutation.isPending ? '#F1F5F9' : '#1E5AA8',
                color: runMutation.isPending ? '#94A3B8' : '#FFFFFF',
                cursor: runMutation.isPending ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                width: '100%',
                transition: 'all 120ms ease',
              }}
            >
              {runMutation.isPending ? (
                <>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity={0.25} />
                    <path fill="currentColor" opacity={0.75} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  RUNNING…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="currentColor" width={12} height={12}>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  RUN SCENARIO
                </>
              )}
            </button>

            {runMutation.isError && (
              <div style={{
                padding: '6px 10px',
                borderRadius: 2,
                border: '1px solid #FECACA',
                background: '#FEF2F2',
                fontSize: '0.65rem',
                color: '#DC2626',
                fontFamily: 'var(--font-mono)',
              }}>
                Simulation failed. Is the backend running?
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Before / After KPI split-view ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          overflow: 'hidden',
        }}>
          <AnimatePresence mode="wait">
            {runMutation.isPending ? (
              <motion.div
                key="spinner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#FFFFFF',
                }}
              >
                <IndustrialSpinner />
              </motion.div>
            ) : result ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {/* BEFORE section — top half */}
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  borderBottom: '2px solid #CBD5E1',
                }}>
                  <KPITable label="BEFORE" data={result.before} phase="before" />
                </div>

                {/* AFTER section — bottom half */}
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}>
                  <KPITable label="AFTER" data={result.after} compare={result.before} phase="after" />
                </div>

                {/* Narrative + metadata footer */}
                <div style={{
                  padding: '6px 12px',
                  background: '#F8FAFC',
                  borderTop: '1px solid #E2E8F0',
                  flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>🧠</span>
                    <p style={{
                      fontSize: '0.68rem',
                      color: '#475569',
                      lineHeight: 1.5,
                      margin: 0,
                      flex: 1,
                    }}>
                      {result.narrative}
                    </p>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 5,
                    fontSize: '0.6rem',
                    color: '#94A3B8',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    <span>
                      Affected:{' '}
                      {result.affected_trains.map((t, i) => (
                        <span key={t} style={{ color: '#64748B', marginLeft: i === 0 ? 0 : 4 }}>{t}</span>
                      ))}
                    </span>
                    <span>Computed in {result.execution_time_ms?.toFixed(1)}ms</span>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  background: '#FFFFFF',
                  color: '#94A3B8',
                }}
              >
                <div style={{ fontSize: '2.5rem', opacity: 0.4 }}>🔬</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#334155',
                    letterSpacing: '0.04em',
                    marginBottom: 4,
                  }}>
                    NO SCENARIO RUN YET
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                    Select a disruption type and parameters,<br />then click Run Scenario
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
})