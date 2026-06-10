import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { auditAPI } from '../services/api'
import { AuditLog as AuditLogType } from '../types/recommendation'
import clsx from 'clsx'

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

const EVENT_STYLES: Record<string, { badge: string; icon: string }> = {
  accepted:  { badge: 'badge-success',  icon: '✓' },
  overridden:{ badge: 'badge-high',     icon: '↩' },
  conflict:  { badge: 'badge-critical', icon: '⚡' },
  started:   { badge: 'badge-low',      icon: '▶' },
  reset:     { badge: 'badge-medium',   icon: '↺' },
  predicted: { badge: 'badge-low',      icon: '📊' },
}

function getEventStyle(eventType: string) {
  return EVENT_STYLES[eventType] ?? { badge: 'badge-low', icon: '•' }
}

function LogRow({ log, index }: { log: AuditLogType; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const { badge, icon } = getEventStyle(log.event_type)

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="border-b last:border-0"
      style={{ borderColor: 'hsl(var(--rail-border) / 0.5)' }}
    >
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Icon */}
        <span
          className="w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0"
          style={{ background: 'hsl(var(--rail-surface-3))' }}
        >
          {icon}
        </span>

        {/* Event type */}
        <span className={clsx('badge flex-shrink-0', badge)} style={{ fontSize: '0.65rem' }}>
          {log.event_type}
        </span>

        {/* Trains */}
        <span className="mono text-xs flex-1 truncate" style={{ color: 'hsl(var(--rail-text-2))' }}>
          {log.train_ids?.join(', ') || log.conflict_id || '—'}
        </span>

        {/* Decision */}
        {log.controller_decision && (
          <span
            className="text-xs flex-shrink-0"
            style={{ color: log.controller_decision === 'accepted' ? 'hsl(var(--rail-success))' : '#f97316' }}
          >
            {log.controller_decision}
          </span>
        )}

        {/* Time */}
        <span className="mono text-xs flex-shrink-0" style={{ color: 'hsl(var(--rail-text-3))' }}>
          {log.timestamp ? relativeTime(log.timestamp) : '—'}
        </span>

        <span style={{ color: 'hsl(var(--rail-text-3))', fontSize: '0.7rem' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-3 pt-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs ml-9"
              style={{ borderTop: `1px solid hsl(var(--rail-border) / 0.3)` }}
            >
              {[
                { label: 'Log ID',         value: log.id?.slice(0, 12) + '…' },
                { label: 'Session',        value: log.section_id || '—' },
                { label: 'Conflict ID',    value: log.conflict_id?.slice(0, 12) + '…' || '—' },
                { label: 'Rec ID',         value: log.recommendation_id?.slice(0, 12) + '…' || '—' },
                { label: 'Pred Delay',     value: log.predicted_delay_min != null ? `${log.predicted_delay_min.toFixed(1)} min` : '—' },
                { label: 'Actual Delay',   value: log.actual_delay_min != null ? `${log.actual_delay_min.toFixed(1)} min` : '—' },
                { label: 'Outcome Δ',      value: log.outcome_deviation != null ? `${log.outcome_deviation.toFixed(1)}` : '—' },
                { label: 'System ver.',    value: log.system_version || '1.0.0' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="label" style={{ fontSize: '0.6rem' }}>{label}</div>
                  <div className="mono mt-0.5" style={{ color: 'hsl(var(--rail-text))' }}>{value}</div>
                </div>
              ))}
              {log.recommended_action && (
                <div className="col-span-full">
                  <div className="label mb-1" style={{ fontSize: '0.6rem' }}>Recommended action</div>
                  <p style={{ color: 'hsl(var(--rail-text-2))', lineHeight: 1.6 }}>
                    {log.recommended_action}
                  </p>
                </div>
              )}
              {log.controller_override_reason && (
                <div className="col-span-full">
                  <div className="label mb-1" style={{ fontSize: '0.6rem' }}>Override reason</div>
                  <p style={{ color: '#f97316', lineHeight: 1.6 }}>
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

export function AuditLog({ logs: propLogs, sessionId }: Props) {
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
    <div className="card flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-sm" style={{ color: 'hsl(var(--rail-text))' }}>
            Audit Log
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--rail-text-3))' }}>
            {filtered.length} of {allLogs.length} entries
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <input
            className="input"
            placeholder="Search train ID, conflict…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '200px', fontSize: '0.8rem' }}
          />
          {/* Event type filter */}
          <select
            className="input select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: '140px', fontSize: '0.8rem' }}
          >
            {eventTypes.map((t) => (
              <option key={t} value={t}>{t === 'all' ? 'All events' : t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table header */}
      <div
        className="grid text-xs px-4"
        style={{
          gridTemplateColumns: '2rem 6rem 1fr 6rem 8rem 1.5rem',
          color: 'hsl(var(--rail-text-3))',
          paddingBottom: '0.5rem',
          borderBottom: `1px solid hsl(var(--rail-border))`,
        }}
      >
        <span></span>
        <span className="label">Event</span>
        <span className="label">Trains / Conflict</span>
        <span className="label">Decision</span>
        <span className="label">Time</span>
        <span></span>
      </div>

      {/* Rows */}
      <div className="flex flex-col overflow-y-auto" style={{ maxHeight: '60vh' }}>
        {filtered.length === 0 ? (
          <div className="text-center py-16" style={{ color: 'hsl(var(--rail-text-3))' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
            <p className="text-sm">No audit events yet. Start a simulation to record decisions.</p>
          </div>
        ) : (
          filtered.map((log, i) => <LogRow key={log.id} log={log} index={i} />)
        )}
      </div>
    </div>
  )
}
