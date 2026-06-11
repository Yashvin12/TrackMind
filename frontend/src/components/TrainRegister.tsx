/**
 * TrainRegister — Operational Control Chart (COA-style)
 * ======================================================
 * Dense, searchable, sortable table of all active trains.
 * Mirrors the digital version of the Section Controller's train register.
 * Color-coded rows: on-time (white), delayed (amber), critical (red).
 */

import { useState, useMemo } from 'react'
import { Train } from '../types/train'

interface Props {
  trains: Record<string, Train>
  onSelectTrain?: (trainId: string) => void
  selectedTrainId?: string | null
  collapsed?: boolean
  onToggleCollapse?: () => void
}

// IR Priority class labels
const PRIORITY_LABELS: Record<number, { label: string; badge: string }> = {
  1: { label: 'P1·EMG', badge: 'badge-p1' },
  2: { label: 'P2·VIP', badge: 'badge-p2' },
  3: { label: 'P3·RAJ', badge: 'badge-p3' },
  4: { label: 'P4·EXP', badge: 'badge-p4' },
  5: { label: 'P5·PAS', badge: 'badge-p5' },
  6: { label: 'P6·FRT', badge: 'badge-p6' },
}

const TYPE_COLOR: Record<string, string> = {
  rajdhani:     'var(--train-rajdhani)',
  express:      'var(--train-express)',
  passenger:    'var(--train-passenger)',
  freight:      'var(--train-freight)',
  departmental: 'var(--train-dept)',
}

type SortKey = 'id' | 'delay' | 'priority' | 'speed'
type FilterType = 'all' | 'rajdhani' | 'express' | 'passenger' | 'freight' | 'departmental'

export function TrainRegister({ trains, onSelectTrain, selectedTrainId, collapsed = false, onToggleCollapse }: Props) {
  const [search, setSearch]         = useState('')
  const [sortKey, setSortKey]       = useState<SortKey>('priority')
  const [sortAsc, setSortAsc]       = useState(true)
  const [filter, setFilter]         = useState<FilterType>('all')

  const trainList = useMemo(() => Object.values(trains), [trains])

  const filtered = useMemo(() => {
    let list = trainList
    if (filter !== 'all') list = list.filter(t => t.type === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t =>
        t.id.toLowerCase().includes(q) ||
        (t.name ?? '').toLowerCase().includes(q) ||
        (t.current_location ?? '').toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      let av: number, bv: number
      switch (sortKey) {
        case 'delay':    av = a.current_delay_min ?? 0; bv = b.current_delay_min ?? 0; break
        case 'priority': av = a.priority_class ?? 6;   bv = b.priority_class ?? 6;    break
        case 'speed':    av = a.speed_kmh ?? 0;        bv = b.speed_kmh ?? 0;         break
        default:         return a.id.localeCompare(b.id)
      }
      return sortAsc ? av - bv : bv - av
    })
    return list
  }, [trainList, filter, search, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(true) }
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    sortKey === k
      ? <span style={{ color: '#93C5FD' }}>{sortAsc ? '▲' : '▼'}</span>
      : <span style={{ opacity: 0.3 }}>▼</span>
  )

  function rowClass(t: Train) {
    if ((t.current_delay_min ?? 0) > 15) return 'row-critical'
    if ((t.current_delay_min ?? 0) > 5)  return 'row-warning'
    return ''
  }

  function delayStr(min: number) {
    if (min <= 0) return <span style={{ color: 'var(--safety-green)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>On time</span>
    const color = min > 15 ? 'var(--safety-red)' : 'var(--safety-amber)'
    return <span style={{ color, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>+{min.toFixed(0)}m</span>
  }

  const total    = trainList.length
  const delayed  = trainList.filter(t => (t.current_delay_min ?? 0) > 5).length
  const critical = trainList.filter(t => (t.current_delay_min ?? 0) > 15).length

  return (
    <div className="ncc-register" style={{ height: collapsed ? 36 : 'var(--register-h)' }}>
      {/* Register header */}
      <div
        className="section-header"
        style={{ cursor: 'pointer', justifyContent: 'space-between', flexShrink: 0 }}
        onClick={onToggleCollapse}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 13, height: 13, opacity: 0.7 }}>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          TRAIN REGISTER — SECTION CONTROL CHART
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 400, opacity: 0.7, fontSize: 11 }}>
            {total} active · {delayed} delayed · {critical > 0 ? <span style={{ color: '#FCA5A5' }}>{critical} critical</span> : '0 critical'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!collapsed && (
            <>
              {/* Filter */}
              <select
                value={filter}
                onChange={e => setFilter(e.target.value as FilterType)}
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'var(--text-on-blue-dim)',
                  fontSize: 11,
                  padding: '1px 20px 1px 6px',
                  borderRadius: 2,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  appearance: 'none',
                }}
              >
                <option value="all">All Types</option>
                <option value="rajdhani">Rajdhani/VB</option>
                <option value="express">Express</option>
                <option value="passenger">Passenger</option>
                <option value="freight">Freight</option>
                <option value="departmental">Departmental</option>
              </select>
              {/* Search */}
              <input
                type="search"
                placeholder="Search train / block…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'white',
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 2,
                  fontFamily: 'var(--font-mono)',
                  width: 180,
                  outline: 'none',
                }}
              />
            </>
          )}
          <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>{collapsed ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Table */}
      {!collapsed && (
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          <table className="op-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Train No.</th>
                <th style={{ width: 140 }}>Name / Type</th>
                <th style={{ width: 130, cursor: 'pointer' }} onClick={() => toggleSort('priority')}>
                  Priority <SortIcon k="priority" />
                </th>
                <th style={{ width: 140 }}>Block / Location</th>
                <th style={{ width: 80, cursor: 'pointer' }} onClick={() => toggleSort('speed')}>
                  Speed <SortIcon k="speed" />
                </th>
                <th style={{ width: 90, cursor: 'pointer' }} onClick={() => toggleSort('delay')}>
                  Delay <SortIcon k="delay" />
                </th>
                <th style={{ width: 70 }}>Platform</th>
                <th style={{ width: 70 }}>ETA Next</th>
                <th style={{ width: 60 }}>Dir.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '20px 0', fontStyle: 'italic' }}>
                    {trainList.length === 0 ? 'No trains active — start simulation' : 'No trains match filter'}
                  </td>
                </tr>
              ) : (
                filtered.map(t => {
                  const pri = PRIORITY_LABELS[t.priority_class ?? 5]
                  const typeColor = TYPE_COLOR[t.type ?? 'passenger']
                  const isSelected = selectedTrainId === t.id
                  return (
                    <tr
                      key={t.id}
                      className={rowClass(t)}
                      onClick={() => onSelectTrain?.(t.id)}
                      style={{
                        outline: isSelected ? `2px solid var(--ir-blue)` : undefined,
                        outlineOffset: -2,
                        background: isSelected ? 'var(--ir-blue-pale)' : undefined,
                      }}
                    >
                      <td>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: typeColor,
                          fontSize: 14,
                        }}>
                          {t.id}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.name ?? t.type ?? '—'}
                        </div>
                        <div style={{ fontSize: 11, color: typeColor, fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.2 }}>
                          {t.type}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${pri?.badge ?? 'badge-neutral'}`}>{pri?.label ?? `P${t.priority_class}`}</span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
                          {t.current_block ?? t.current_location ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                          {(t.speed_kmh ?? 0).toFixed(0)}<span style={{ fontSize: 11, color: 'var(--text-faint)' }}> km/h</span>
                        </span>
                      </td>
                      <td>{delayStr(t.current_delay_min ?? 0)}</td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>
                          {t.platform ? `P${t.platform}` : '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
                          {t.eta_next_station ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 13,
                          color: (t.direction ?? 1) === 1 ? 'var(--safety-blue)' : 'var(--safety-amber)',
                          fontWeight: 700,
                        }}>
                          {(t.direction ?? 1) === 1 ? '→ UP' : '← DN'}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
