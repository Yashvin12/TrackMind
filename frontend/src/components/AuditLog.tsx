import { useState, memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { auditAPI } from '../services/api'
import { AuditLog as AuditLogType } from '../types/recommendation'

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60)  return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60)  return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)    return `${diffH}h ago`
  return `${Math.floor(diffH / 24)}d ago`
}

interface Props {
  logs: AuditLogType[]
  sessionId?: string
}

const EVENT_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  recommendation_accepted:  { color: 'var(--safety-green)',  bg: 'var(--safety-green-light)',  border: 'var(--safety-green-border)',  icon: '✓' },
  recommendation_overridden:{ color: 'var(--safety-amber)',  bg: 'var(--safety-amber-light)',  border: 'var(--safety-amber-border)',  icon: '↩' },
  conflict_detected:        { color: 'var(--safety-red)',    bg: 'var(--safety-red-light)',    border: 'var(--safety-red-border)',    icon: '⚡' },
  simulation_started:       { color: 'var(--safety-green)',  bg: 'var(--safety-green-light)',  border: 'var(--safety-green-border)',  icon: '▶' },
  simulation_reset:         { color: 'var(--safety-amber)',  bg: 'var(--safety-amber-light)',  border: 'var(--safety-amber-border)',  icon: '↺' },
  prediction_generated:     { color: 'var(--safety-blue)',   bg: 'var(--safety-blue-light)',   border: 'var(--safety-blue-border)',   icon: '📊' },
}

function getEventConfig(eventType: string) {
  const key = Object.keys(EVENT_CONFIG).find(k => {
    const kParts = k.split('_')
    return eventType.includes(kParts[0]) && eventType.includes(kParts[kParts.length - 1])
  })
  return EVENT_CONFIG[key ?? ''] ?? {
    color: 'var(--text-muted)',
    bg: 'var(--bg-row-alt)',
    border: 'var(--border)',
    icon: '•',
  }
}

function LogRow({ log, index }: { log: AuditLogType; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = getEventConfig(log.event_type)

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      {/* Row button — op-table density: 28px row height */}
      <button
        style={{
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 10px',
          height: 'var(--row-h)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          transition: 'background var(--transition-fast)',
        }}
        onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-row-hover)')}
        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Event type badge — DESIGN.md badge style: 2px radius, 1px border */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '1px 6px',
          borderRadius: 2,
          border: `1px solid ${cfg.border}`,
          background: cfg.bg,
          color: cfg.color,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}>
          <span>{cfg.icon}</span>
          {log.event_type.replace(/_/g, ' ')}
        </span>

        {/* Train / Conflict ID — mono for vertical scanning */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--text-secondary)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {log.train_ids?.join(', ') || log.conflict_id || '—'}
        </span>

        {/* Controller decision */}
        {log.controller_decision && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            color: log.controller_decision === 'accepted' ? 'var(--safety-green)' : 'var(--safety-amber)',
            flexShrink: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}>
            {log.controller_decision}
          </span>
        )}

        {/* Relative time — right-aligned mono */}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-faint)',
          flexShrink: 0,
          width: 50,
          textAlign: 'right',
        }}>
          {log.timestamp ? relativeTime(log.timestamp) : '—'}
        </span>

        {/* Expand chevron */}
        <span style={{ color: 'var(--text-faint)', fontSize: 10, flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded detail — op-table / spreadsheet density layout */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="inspector-section" style={{
              padding: '8px 10px 10px 10px',
              background: 'var(--bg-row-alt)',
              borderTop: '1px solid var(--border)',
            }}>
              {/* Spreadsheet-like detail grid — 4 columns */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '4px 12px',
                borderBottom: '1px solid var(--border)',
                paddingBottom: 8,
                marginBottom: 8,
              }}>
                {[
                  { label: 'LOG ID',       value: log.id?.slice(0, 12) + '…' },
                  { label: 'SESSION',      value: log.section_id || '—' },
                  { label: 'CONFLICT ID',  value: log.conflict_id ? log.conflict_id.slice(0, 12) + '…' : '—' },
                  { label: 'REC ID',       value: log.recommendation_id ? log.recommendation_id.slice(0, 12) + '…' : '—' },
                  { label: 'PRED DELAY',   value: log.predicted_delay_min != null ? `${log.predicted_delay_min.toFixed(1)} min` : '—' },
                  { label: 'ACTUAL DELAY', value: log.actual_delay_min != null ? `${log.actual_delay_min.toFixed(1)} min` : '—' },
                  { label: 'OUTCOME Δ',   value: log.outcome_deviation != null ? `${log.outcome_deviation.toFixed(1)}` : '—' },
                  { label: 'SYSTEM VER.',  value: log.system_version || '1.0.0' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.07em',
                      color: 'var(--text-muted)',
                      marginBottom: 1,
                    }}>{label}</div>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>{value}</div>
                  </div>
                ))}
              </div>
              {log.recommended_action && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    color: 'var(--text-muted)',
                    marginBottom: 2,
                  }}>RECOMMENDED ACTION</div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0, fontFamily: 'var(--font-body)' }}>
                    {log.recommended_action}
                  </p>
                </div>
              )}
              {log.controller_override_reason && (
                <div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    color: 'var(--text-muted)',
                    marginBottom: 2,
                  }}>OVERRIDE REASON</div>
                  <p style={{ fontSize: 12, color: 'var(--safety-amber)', lineHeight: 1.5, margin: 0, fontFamily: 'var(--font-body)' }}>
                    {log.controller_override_reason}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export const AuditLog = memo(function AuditLog({ logs: propLogs, sessionId }: Props) {
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Fetch from API if no prop logs, otherwise use props
  const { data: apiData } = useQuery({
    queryKey: ['audit-logs', sessionId],
    queryFn: () => auditAPI.list(sessionId, 200).then((r) => r.data),
    enabled: propLogs.length === 0,
    refetchInterval: 15_000,
  })

  const allLogs: AuditLogType[] = propLogs.length > 0 ? propLogs : (apiData?.logs ?? [])
  const eventTypes = ['all', ...Array.from(new Set(allLogs.map((l) => l.event_type)))]

  const filtered = allLogs.filter((l) => {
    const matchType = filter === 'all' || l.event_type === filter
    const matchSearch = !search || (
      l.train_ids?.some((t) => t.toLowerCase().includes(search.toLowerCase())) ||
      l.conflict_id?.toLowerCase().includes(search.toLowerCase()) ||
      l.event_type.toLowerCase().includes(search.toLowerCase())
    )
    return matchType && matchSearch
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-panel)' }}>

      {/* Panel header — section-header class per DESIGN.md */}
      <div className="section-header" style={{ justifyContent: 'space-between', padding: '0 12px', height: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 13, height: 13, opacity: 0.7 }}>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          AUDIT LOG
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 400, fontSize: 11, opacity: 0.6 }}>
            {filtered.length} of {allLogs.length} entries
          </span>
        </div>

        {/* Filter controls — DESIGN.md input styling: 28px height, 2px radius, 1px border */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
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
              height: 24,
            }}
          >
            {eventTypes.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All events' : t.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search train / conflict…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'var(--text-on-blue)',
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 2,
              fontFamily: 'var(--font-mono)',
              width: 170,
              height: 24,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Table column headers — op-table visual language: label-caps typography */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: 'var(--row-h)',
        padding: '0 10px',
        gap: 8,
        background: 'var(--bg-row-alt)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {[
          { label: 'EVENT TYPE', flex: '0 0 200px' },
          { label: 'TRAINS / CONFLICT ID', flex: 1 },
          { label: 'DECISION', flex: '0 0 90px' },
          { label: 'TIME', flex: '0 0 60px', textAlign: 'right' as const },
          { label: '', flex: '0 0 16px' },
        ].map(col => (
          <div key={col.label} style={{
            flex: col.flex,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            textAlign: col.textAlign,
            overflow: 'hidden',
          }}>
            {col.label}
          </div>
        ))}
      </div>

      {/* Log rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 12,
            opacity: 0.5,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth={1} style={{ width: 40, height: 40 }}>
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.5 }}>
              {allLogs.length === 0
                ? 'No audit events yet. Start a simulation to record decisions.'
                : 'No entries match the current filter.'}
            </span>
          </div>
        ) : (
          filtered.map((log, i) => <LogRow key={log.id} log={log} index={i} />)
        )}
      </div>
    </div>
  )
})
