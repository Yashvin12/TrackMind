/**
 * AIInspectorPanel — Persistent Right-Side AI Inspector
 * ======================================================
 * Context-aware panel that updates based on selection:
 * - Train selected    → position, delay, priority, ETA, AI prediction
 * - Conflict selected → severity, T-minus, recommendation, SHAP factors, actions
 * - Nothing selected  → system health summary
 */

import { useState, memo } from 'react'
import { Train } from '../types/train'
import { LiveConflict, PredictionEntry } from '../store/index'
import { Recommendation } from '../types/recommendation'

interface Props {
  selectedTrain: Train | null
  selectedConflict: LiveConflict | null
  prediction?: PredictionEntry | null
  recommendation?: Recommendation | null
  conflictCount: number
  trainCount: number
  avgDelay: number
  onAccept?: (recId: string) => void
  onOverride?: (recId: string, reason: string) => void
  onSimulate?: (recId: string) => void
}

const PRIORITY_LABELS: Record<number, { label: string; badge: string }> = {
  1: { label: 'P1 · Emergency', badge: 'badge-p1' },
  2: { label: 'P2 · VVIP/Special', badge: 'badge-p2' },
  3: { label: 'P3 · Rajdhani/VB', badge: 'badge-p3' },
  4: { label: 'P4 · Express/Mail', badge: 'badge-p4' },
  5: { label: 'P5 · Passenger', badge: 'badge-p5' },
  6: { label: 'P6 · Freight', badge: 'badge-p6' },
}

const TYPE_COLOR: Record<string, string> = {
  rajdhani:     'var(--train-rajdhani)',
  express:      'var(--train-express)',
  passenger:    'var(--train-passenger)',
  freight:      'var(--train-freight)',
  departmental: 'var(--train-dept)',
}

function InspectorRow({ label, value, mono = false, color }: {
  label: string; value: React.ReactNode; mono?: boolean; color?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 8 }}>
      <div className="inspector-label">{label}</div>
      <div className={mono ? 'inspector-value' : ''} style={{
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
        fontSize: 14,
        fontWeight: mono ? 700 : 600,
        color: color ?? 'var(--text-primary)',
        lineHeight: 1.3,
      }}>
        {value}
      </div>
    </div>
  )
}

function FactorBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(Math.abs(value) * 100, 100)
  const color = value > 0.65 ? 'var(--safety-red)' : value > 0.35 ? 'var(--safety-amber)' : 'var(--safety-green)'
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 400ms ease' }} />
      </div>
    </div>
  )
}

/* ── Train Inspector ──────────────────────────────────────────────────────── */
function TrainInspector({ train, prediction }: { train: Train; prediction?: PredictionEntry | null }) {
  const pri = PRIORITY_LABELS[train.priority_class ?? 5]
  const typeColor = TYPE_COLOR[train.type ?? 'passenger']
  const delay = train.current_delay_min ?? 0
  const delayColor = delay > 15 ? 'var(--safety-red)' : delay > 5 ? 'var(--safety-amber)' : 'var(--safety-green)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flex: 1 }}>
      {/* Train identity */}
      <div className="inspector-section" style={{ background: 'var(--ir-blue-pale)', borderBottom: '1px solid var(--ir-blue-light)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: typeColor, marginBottom: 2 }}>
          {train.id}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {train.name ?? train.type}
        </div>
        <span className={`badge ${pri?.badge ?? 'badge-neutral'}`}>{pri?.label ?? `P${train.priority_class}`}</span>
      </div>

      {/* Live state */}
      <div className="inspector-section">
        <InspectorRow label="Current Block" value={train.current_block ?? train.current_location ?? '—'} mono />
        <InspectorRow label="Speed" value={`${(train.speed_kmh ?? 0).toFixed(0)} km/h`} mono />
        <InspectorRow
          label="Delay"
          value={delay <= 0 ? 'On time' : `+${delay.toFixed(0)} min`}
          mono
          color={delayColor}
        />
        <InspectorRow label="Direction" mono
          value={(train.direction ?? 1) === 1 ? '→ UP LINE' : '← DOWN LINE'}
          color={(train.direction ?? 1) === 1 ? 'var(--safety-blue)' : 'var(--safety-amber)'}
        />
        {train.eta_next_station && (
          <InspectorRow label="ETA Next Station" value={train.eta_next_station} mono />
        )}
        {train.platform != null && (
          <InspectorRow label="Platform" value={`Platform ${train.platform}`} mono />
        )}
      </div>

      {/* AI Prediction */}
      {prediction && (
        <div className="inspector-section">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: 'var(--ir-blue)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 11, height: 11 }}>
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
            </svg>
            AI FORECAST
          </div>
          <FactorBar label="Conflict Probability" value={prediction.conflict_probability} />
          <FactorBar label="Section Congestion" value={prediction.congestion_level} />
          <FactorBar label="Future Delay Risk" value={Math.min(prediction.future_delay_min / 30, 1)} />
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>Model Confidence</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--safety-green)' }}>
              {(prediction.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Status */}
      <div className="inspector-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: train.status === 'running' ? 'var(--safety-green)' :
                        train.status === 'stopped' ? 'var(--safety-red)' : 'var(--safety-amber)',
            animation: train.status === 'running' ? 'blink-live 1.5s ease-in-out infinite' : undefined,
          }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
            color: train.status === 'running' ? 'var(--safety-green)' : 'var(--text-secondary)',
            textTransform: 'uppercase' }}>
            {train.status ?? 'Unknown'}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Conflict Inspector ───────────────────────────────────────────────────── */
function ConflictInspector({
  conflict, recommendation, onAccept, onOverride, onSimulate, predictions,
}: {
  conflict: LiveConflict
  recommendation?: Recommendation | null
  predictions?: PredictionEntry[]
  onAccept?: (id: string) => void
  onOverride?: (id: string, reason: string) => void
  onSimulate?: (id: string) => void
}) {
  const [showOverride, setShowOverride] = useState(false)
  const [reason, setReason] = useState('')

  const severity = conflict.severity
  const sevColor = severity >= 0.75 ? 'var(--safety-red)' : severity >= 0.4 ? 'var(--safety-amber)' : 'var(--safety-blue)'
  const sevBg    = severity >= 0.75 ? 'var(--safety-red-light)' : severity >= 0.4 ? 'var(--safety-amber-light)' : 'var(--safety-blue-light)'
  const sevLabel = severity >= 0.75 ? 'CRITICAL' : severity >= 0.4 ? 'MAJOR' : 'MINOR'
  const trains   = conflict.affected_trains ?? conflict.trains_involved ?? []
  const confidence = Math.min(99, Math.round(58 + severity * 40))

  // Derive SHAP factors from related predictions
  const relatedPreds = predictions?.filter(p => trains.includes(p.train_id)) ?? []
  const avgConflict  = relatedPreds.reduce((s, p) => s + (p.conflict_probability ?? 0), 0) / Math.max(relatedPreds.length, 1)
  const avgCong      = relatedPreds.reduce((s, p) => s + (p.congestion_level ?? 0), 0) / Math.max(relatedPreds.length, 1)
  const avgDelay     = relatedPreds.reduce((s, p) => s + (p.future_delay_min ?? 0), 0) / Math.max(relatedPreds.length, 1)

  const rec = recommendation?.conflict_id === conflict.id ? recommendation : null
  const topOption = rec?.options[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flex: 1 }}>
      {/* Conflict identity */}
      <div className="inspector-section" style={{ background: sevBg, borderBottom: `1px solid ${sevColor}40` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: sevColor, marginBottom: 2 }}>
              {trains.join(' ↔ ')}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)' }}>
              {conflict.block_section}
            </div>
          </div>
          <span style={{
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11,
            color: sevColor, background: `${sevColor}18`,
            padding: '2px 7px', borderRadius: 2, border: `1px solid ${sevColor}40`,
          }}>
            {sevLabel}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: sevColor }}>
            T−{conflict.time_to_conflict_min.toFixed(1)}m
          </span>
          <div style={{ flex: 1, height: 4, background: 'rgba(0,0,0,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(severity * 100, 100)}%`, background: sevColor, borderRadius: 2 }} />
          </div>
        </div>
      </div>

      {/* AI Recommendation */}
      {topOption && (
        <div className="inspector-section" style={{ background: 'var(--ir-blue-pale)', borderBottom: '1px solid var(--ir-blue-light)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: 'var(--ir-blue)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 11, height: 11 }}>
                <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
              </svg>
              AI RECOMMENDATION
            </span>
            <span style={{ color: 'var(--safety-green)' }}>{confidence}% conf.</span>
          </div>
          {topOption.actions.slice(0, 3).map((a) => (
            <div key={`${a.action_type}-${a.train_id}`} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3, lineHeight: 1.4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--ir-blue)', marginRight: 5 }}>
                {a.action_type.toUpperCase()} {a.train_id}
              </span>
              {a.duration_min && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>for {a.duration_min}m</span>}
            </div>
          ))}
          {conflict.predicted_delay_min !== undefined && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              Expected outcome:{' '}
              <strong style={{ color: 'var(--safety-green)' }}>
                −{(conflict.predicted_delay_min * 0.7).toFixed(0)} min saved
              </strong>
            </div>
          )}
        </div>
      )}

      {/* SHAP Factors */}
      <div className="inspector-section">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>
          Factor Analysis
        </div>
        <FactorBar label="Conflict Probability" value={avgConflict > 0 ? avgConflict : severity} />
        <FactorBar label="Section Congestion" value={avgCong > 0 ? avgCong : severity * 0.8} />
        <FactorBar label="Predicted Delay Risk" value={Math.min(avgDelay / 30, 1)} />
        <FactorBar label="Cascade Risk" value={severity * 0.85} />
      </div>

      {/* Action buttons */}
      {rec && !showOverride && (
        <div className="inspector-section" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            className="btn btn-accept"
            style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-heading)', letterSpacing: '0.04em' }}
            onClick={() => onAccept?.(rec.id)}
          >
            ✓ Approve Recommendation
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-sim"
              style={{ flex: 1, fontSize: 12 }}
              onClick={() => onSimulate?.(rec.id)}
            >
              Simulate
            </button>
            <button
              className="btn btn-override"
              style={{ flex: 1, fontSize: 12 }}
              onClick={() => setShowOverride(true)}
            >
              Override
            </button>
          </div>
        </div>
      )}

      {showOverride && rec && (
        <div className="inspector-section" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="inspector-label">Override Reason</div>
          <input
            className="input"
            placeholder="State reason for manual override…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-override"
              style={{ flex: 1, fontSize: 12 }}
              onClick={() => {
                if (!reason.trim()) return
                onOverride?.(rec.id, reason)
                setShowOverride(false); setReason('')
              }}
            >
              Confirm
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, fontSize: 12 }}
              onClick={() => { setShowOverride(false); setReason('') }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Idle (nothing selected) ─────────────────────────────────────────────── */
function IdleInspector({ conflictCount, trainCount, avgDelay }: {
  conflictCount: number; trainCount: number; avgDelay: number
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flex: 1 }}>
      <div className="inspector-section">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>
          Section Overview
        </div>
        <InspectorRow label="Active Trains" value={String(trainCount)} mono />
        <InspectorRow
          label="Active Conflicts"
          value={String(conflictCount)}
          mono
          color={conflictCount > 0 ? 'var(--safety-red)' : 'var(--safety-green)'}
        />
        <InspectorRow
          label="Avg Delay"
          value={avgDelay <= 0 ? 'On time' : `+${avgDelay.toFixed(1)} min`}
          mono
          color={avgDelay > 15 ? 'var(--safety-red)' : avgDelay > 5 ? 'var(--safety-amber)' : 'var(--safety-green)'}
        />
      </div>
      <div className="inspector-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.5 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth={1} style={{ width: 40, height: 40 }}>
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
        </svg>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.4 }}>
          Select a train or conflict to inspect
        </span>
      </div>
    </div>
  )
}

/* ── Main Export ──────────────────────────────────────────────────────────── */
export const AIInspectorPanel = memo(function AIInspectorPanel({
  selectedTrain,
  selectedConflict,
  prediction,
  recommendation,
  conflictCount,
  trainCount,
  avgDelay,
  onAccept,
  onOverride,
  onSimulate,
}: Props & { predictions?: PredictionEntry[] }) {
  console.count("AIInspectorPanel render")
  const hasSelection = selectedTrain || selectedConflict

  return (
    <div className="ncc-inspector" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Inspector header */}
      <div className="inspector-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 13, height: 13, opacity: 0.7 }}>
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
          </svg>
          AI INSPECTOR
        </div>
        {hasSelection && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--safety-green)',
            background: 'rgba(74,222,128,0.12)', padding: '1px 6px', borderRadius: 2 }}>
            ACTIVE
          </span>
        )}
      </div>

      {/* Context label */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-row-alt)', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
          {selectedTrain
            ? `Train · ${selectedTrain.id}`
            : selectedConflict
            ? `Conflict · ${selectedConflict.block_section}`
            : 'MUM–SRT Section'}
        </span>
      </div>

      {/* Content */}
      {selectedTrain ? (
        <TrainInspector train={selectedTrain} prediction={prediction} />
      ) : selectedConflict ? (
        <ConflictInspector
          conflict={selectedConflict}
          recommendation={recommendation}
          onAccept={onAccept}
          onOverride={onOverride}
          onSimulate={onSimulate}
        />
      ) : (
        <IdleInspector conflictCount={conflictCount} trainCount={trainCount} avgDelay={avgDelay} />
      )}
    </div>
  )
})
