/**
 * PredictionPanel — Forecast & ML Insight Panel
 * ===============================================
 * Visual dashboard for ML delay forecast and SHAP feature importance.
 * Integrates with /api/v1/kpi/predictions via react-query.
 *
 * Layout:
 *  Left  — Sorted train list with delay/confidence indicators
 *  Right — Detailed: delay comparison, metrics grid, SHAP chart
 */

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Train, TRAIN_TYPE_COLORS } from '../types/train'
import { PredictionEntry } from '../store/index'
import { useStore } from '../store/index'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  predictions: PredictionEntry[]
  trains: Record<string, Train>
}

// Feature display metadata for SHAP chart
const FEATURE_META: Record<string, { label: string; description: string }> = {
  current_delay_min:   { label: 'Current Delay',  description: 'Accumulated delay propagates into future schedule' },
  section_load:        { label: 'Block Load',      description: 'Higher traffic density in current block increases risk' },
  speed_ratio:         { label: 'Speed Ratio',     description: 'Running slower than scheduled speed increases delay risk' },
  priority_class:      { label: 'Priority Class',  description: 'Lower priority trains face more hold-orders' },
  conflicts_ahead:     { label: 'Conflicts Ahead', description: 'Known conflicts in path increase delay probability' },
  platform_wait:       { label: 'Platform Wait',   description: 'Platform unavailability causes dwell extension' },
}

// ── SHAP Chart ────────────────────────────────────────────────────────────────
function ShapChart({ shapValues }: { shapValues: Record<string, number> }) {
  const entries = Object.entries(shapValues)
    .map(([key, val]) => ({
      key,
      label: FEATURE_META[key]?.label ?? key.replace(/_/g, ' '),
      value: val,
      description: FEATURE_META[key]?.description ?? '',
    }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 6)

  const maxAbs = Math.max(...entries.map((e) => Math.abs(e.value)), 0.01)

  return (
    <div className="flex flex-col gap-1 p-3">
      <div
        className="flex items-center justify-between mb-2 text-xs font-semibold"
        style={{ color: 'var(--text-muted)' }}
      >
        <span>SHAP Feature Importance</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
          XGBoost / TreeExplainer
        </span>
      </div>
      {entries.map(({ key, label, value, description }) => {
        const isPos = value >= 0
        const pct   = Math.abs(value) / maxAbs
        return (
          <div key={key} className="flex items-center gap-3" title={description}>
            <div
              className="text-xs flex-shrink-0 text-right"
              style={{
                width: 110,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
              }}
            >
              {label}
            </div>
            <div className="flex-1 relative h-4 flex items-center">
              <div
                className="absolute"
                style={{
                  left: isPos ? '50%' : `${50 - pct * 50}%`,
                  width: `${pct * 50}%`,
                  height: '8px',
                  borderRadius: 4,
                  background: isPos ? 'var(--danger)' : 'var(--success)',
                  opacity: 0.85,
                }}
              />
              {/* Center line */}
              <div
                className="absolute"
                style={{
                  left: '50%',
                  width: 1,
                  height: 16,
                  background: 'var(--border-2)',
                  transform: 'translateX(-0.5px)',
                }}
              />
            </div>
            <div
              className="text-xs flex-shrink-0"
              style={{
                width: 48,
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                color: isPos ? 'var(--danger)' : 'var(--success)',
              }}
            >
              {isPos ? '+' : ''}{value.toFixed(3)}
            </div>
          </div>
        )
      })}
      <div className="flex justify-between mt-1 text-xs" style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>
        <span style={{ color: 'var(--success)' }}>← Reduces delay</span>
        <span style={{ color: 'var(--danger)' }}>Increases delay →</span>
      </div>
    </div>
  )
}

// ── Risk gauge ─────────────────────────────────────────────────────────────────
function RiskGauge({ score, label }: { score: number; label: string }) {
  const color = score > 0.7 ? 'var(--danger)' : score > 0.4 ? 'var(--warning)' : 'var(--success)'
  const angle = -140 + score * 280

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 80 50" width={80} height={50}>
        {/* Track */}
        <path d="M 10 45 A 35 35 0 0 1 70 45" fill="none" stroke="var(--surface-2)" strokeWidth={6} strokeLinecap="round" />
        {/* Fill */}
        <path
          d="M 10 45 A 35 35 0 0 1 70 45"
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${score * 110} 110`}
          opacity={0.85}
        />
        {/* Needle */}
        <line
          x1={40}
          y1={45}
          x2={40 + Math.cos((angle - 90) * (Math.PI / 180)) * 28}
          y2={45 + Math.sin((angle - 90) * (Math.PI / 180)) * 28}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx={40} cy={45} r={3} fill={color} />
        <text x={40} y={35} textAnchor="middle" fontSize={10} fill="var(--text-primary)" fontFamily="IBM Plex Mono, monospace" fontWeight="700">
          {(score * 100).toFixed(0)}%
        </text>
      </svg>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

// ── Train list item ────────────────────────────────────────────────────────────
function TrainPredRow({
  pred, train, active, onClick,
}: {
  pred: PredictionEntry
  train?: Train
  active: boolean
  onClick: () => void
}) {
  const color = TRAIN_TYPE_COLORS[train?.type ?? 'express']
  const riskColor =
    pred.conflict_probability > 0.7 ? 'var(--danger)'
    : pred.conflict_probability > 0.4 ? 'var(--warning)'
    : 'var(--success)'

  return (
    <motion.button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-3"
      style={{
        background: active ? 'var(--accent)12' : 'transparent',
        border: `1px solid ${active ? 'var(--accent)44' : 'transparent'}`,
        transitionDuration: 'var(--transition-hover)',
      }}
      whileHover={{ backgroundColor: 'var(--surface-2)' }}
    >
      {/* Type indicator */}
      <span className="w-2 h-8 rounded-full flex-shrink-0" style={{ background: color }} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-xs font-semibold truncate"
            style={{ color: active ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
          >
            {pred.train_id}
          </span>
          <span
            className="text-xs flex-shrink-0"
            style={{ color: riskColor, fontFamily: 'var(--font-mono)' }}
          >
            {(pred.conflict_probability * 100).toFixed(0)}%
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {/* Delay bar */}
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(pred.future_delay_min / 30, 1) * 100}%`,
                background: pred.future_delay_min > 15 ? 'var(--danger)' : pred.future_delay_min > 5 ? 'var(--warning)' : 'var(--success)',
              }}
            />
          </div>
          <span
            className="text-xs flex-shrink-0"
            style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
          >
            +{pred.future_delay_min.toFixed(1)}m
          </span>
        </div>
      </div>

      {active && (
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2} className="w-3 h-3 flex-shrink-0">
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </motion.button>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function PredictionPanel({ predictions: propPredictions, trains }: Props) {
  const [activePredId, setActivePredId] = useState<string | null>(null)
  const storePredictions = useStore((s) => s.predictions)

  // Prefer prop predictions, fall back to store
  const predictions = propPredictions.length > 0 ? propPredictions : storePredictions

  const sortedPreds = useMemo(
    () => [...predictions].sort((a, b) => b.conflict_probability - a.conflict_probability),
    [predictions]
  )

  // Auto-select highest risk
  const autoSelected = activePredId ?? sortedPreds[0]?.train_id ?? null

  const displayPred = predictions.find((p) => p.train_id === (activePredId ?? autoSelected))

  const avgConflictProb = predictions.length > 0
    ? predictions.reduce((s, p) => s + p.conflict_probability, 0) / predictions.length
    : 0

  const avgDelay = predictions.length > 0
    ? predictions.reduce((s, p) => s + p.future_delay_min, 0) / predictions.length
    : 0

  if (predictions.length === 0) {
    return (
      <div
        className="rounded-xl flex flex-col items-center justify-center py-32 gap-4"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
      >
        <div style={{ fontSize: '3rem' }}>📡</div>
        <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
          <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>No prediction data</div>
          <div className="text-sm mt-1">Start a simulation to generate ML forecasts</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Network summary row ────────────────────────────────────────── */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
      >
        <div className="flex flex-col items-center gap-1">
          <RiskGauge score={avgConflictProb} label="Avg Conflict Risk" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <RiskGauge score={Math.min(avgDelay / 30, 1)} label="Avg Delay Risk" />
        </div>
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg p-3"
          style={{ background: 'var(--surface-2)' }}
        >
          <div className="text-2xl font-heading font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {predictions.filter((p) => p.conflict_probability > 0.7).length}
          </div>
          <div className="text-xs text-center" style={{ color: 'var(--danger)' }}>High Risk Trains</div>
        </div>
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg p-3"
          style={{ background: 'var(--surface-2)' }}
        >
          <div className="text-2xl font-heading font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {avgDelay.toFixed(1)}m
          </div>
          <div className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>Avg Forecast Delay</div>
        </div>
      </div>

      {/* ── Main split layout ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Train list */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
        >
          <div
            className="flex items-center justify-between px-3 py-3 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <h3
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
            >
              Train Forecast
            </h3>
            <span
              className="text-xs px-2 py-0.5 rounded"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {predictions.length} trains
            </span>
          </div>

          {/* Column headers */}
          <div
            className="flex items-center gap-2 px-3 py-2 text-xs"
            style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}
          >
            <span className="w-2" />
            <span className="flex-1">Train / Delay</span>
            <span>Risk %</span>
          </div>

          <div className="overflow-y-auto p-2 flex flex-col gap-0.5" style={{ maxHeight: '60vh' }}>
            {sortedPreds.map((pred) => (
              <TrainPredRow
                key={pred.train_id}
                pred={pred}
                train={trains[pred.train_id]}
                active={(activePredId ?? autoSelected) === pred.train_id}
                onClick={() => setActivePredId(pred.train_id)}
              />
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {displayPred ? (
              <motion.div
                key={displayPred.train_id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col gap-4"
              >
                {/* Train header */}
                <div
                  className="rounded-xl p-4 flex items-center gap-4"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 font-heading font-bold text-sm"
                    style={{
                      background: `${TRAIN_TYPE_COLORS[trains[displayPred.train_id]?.type ?? 'express']}22`,
                      color: TRAIN_TYPE_COLORS[trains[displayPred.train_id]?.type ?? 'express'],
                      border: `1px solid ${TRAIN_TYPE_COLORS[trains[displayPred.train_id]?.type ?? 'express']}44`,
                    }}
                  >
                    {displayPred.train_id.slice(0, 4)}
                  </div>
                  <div className="flex-1">
                    <div className="font-heading font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Train {displayPred.train_id}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {trains[displayPred.train_id]?.type?.replace(/_/g, ' ') ?? 'Unknown type'} &bull;{' '}
                      {trains[displayPred.train_id]?.current_location ?? 'Unknown location'}
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <div
                        className="text-xl font-bold"
                        style={{
                          color: displayPred.future_delay_min > 15 ? 'var(--danger)' : displayPred.future_delay_min > 5 ? 'var(--warning)' : 'var(--success)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        +{displayPred.future_delay_min.toFixed(1)}m
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Forecast Delay</div>
                    </div>
                    <div className="text-center">
                      <div
                        className="text-xl font-bold"
                        style={{
                          color: displayPred.conflict_probability > 0.7 ? 'var(--danger)' : displayPred.conflict_probability > 0.4 ? 'var(--warning)' : 'var(--success)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {(displayPred.conflict_probability * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Conflict Risk</div>
                    </div>
                  </div>
                </div>

                {/* Metrics grid */}
                <div
                  className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
                >
                  {[
                    {
                      label: 'Congestion Level',
                      value: `${(displayPred.congestion_level * 100).toFixed(0)}%`,
                      color: displayPred.congestion_level > 0.7 ? 'var(--danger)' : 'var(--warning)',
                    },
                    {
                      label: 'Confidence',
                      value: `${(displayPred.confidence * 100).toFixed(0)}%`,
                      color: displayPred.confidence > 0.7 ? 'var(--success)' : 'var(--warning)',
                    },
                    {
                      label: 'Current Delay',
                      value: `${trains[displayPred.train_id]?.current_delay_min?.toFixed(1) ?? '0.0'}m`,
                      color: 'var(--text-primary)',
                    },
                    {
                      label: 'Speed',
                      value: `${trains[displayPred.train_id]?.speed_kmh?.toFixed(0) ?? '—'} km/h`,
                      color: 'var(--secondary)',
                    },
                  ].map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="flex flex-col gap-1 p-3 rounded-lg"
                      style={{ background: 'var(--surface-2)' }}
                    >
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
                      <div
                        className="text-lg font-bold"
                        style={{ color, fontFamily: 'var(--font-mono)' }}
                      >
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* SHAP Chart */}
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
                >
                  {Object.keys(displayPred.shap_values).length > 0 ? (
                    <ShapChart shapValues={displayPred.shap_values} />
                  ) : (
                    <div
                      className="text-xs text-center py-6"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      SHAP values not available (analytic fallback active)
                    </div>
                  )}
                </div>

                {/* Model footnote */}
                <div
                  className="text-xs text-right"
                  style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                >
                  XGBoost regression (100 estimators · depth 4) · SHAP TreeExplainer · Refreshes every 3s
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="no-selection"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-32 gap-4 rounded-xl"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
              >
                <div style={{ fontSize: '2.5rem' }}>📊</div>
                <div className="text-center" style={{ color: 'var(--text-muted)' }}>
                  <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Select a train</div>
                  <div className="text-sm mt-1">View detailed ML forecast and SHAP explanations</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}