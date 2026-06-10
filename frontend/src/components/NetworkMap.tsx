import { useMemo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Train, TRAIN_TYPE_COLORS } from '../types/train'
import { Conflict } from '../types/conflict'
import { StationState } from '../store/index'

interface Props {
  trains: Record<string, Train>
  stationState: Record<string, StationState>
  blockOccupancy: Record<string, string[]>
  signalStates: Record<string, string>
  conflicts: Conflict[]
}

// ── Layout constants ───────────────────────────────────────────────────────────
const W = 900
const H = 420
const PAD = { left: 60, right: 60, top: 80, bottom: 60 }

const STATION_POSITIONS: Record<string, { x: number; y: number; km: number }> = {
  MUM: { x: PAD.left,                                       y: H / 2, km: 0 },
  KLD: { x: PAD.left + (W - PAD.left - PAD.right) * 0.22,  y: H / 2, km: 60 },
  LNL: { x: PAD.left + (W - PAD.left - PAD.right) * 0.44,  y: H / 2, km: 96 },
  PNE: { x: PAD.left + (W - PAD.left - PAD.right) * 0.68,  y: H / 2, km: 192 },
  SRT: { x: W - PAD.right,                                  y: H / 2, km: 450 },
}

const STATION_NAMES: Record<string, string> = {
  MUM: 'Mumbai CST',
  KLD: 'Karjat',
  LNL: 'Lonavala',
  PNE: 'Pune Jn',
  SRT: 'Solapur Rd',
}

const BLOCKS: Array<{ id: string; from: string; to: string; type: 'single' | 'double' }> = [
  { id: 'BLK_MUM_KLD', from: 'MUM', to: 'KLD', type: 'double' },
  { id: 'BLK_KLD_LNL', from: 'KLD', to: 'LNL', type: 'single' },
  { id: 'BLK_LNL_PNE', from: 'LNL', to: 'PNE', type: 'double' },
  { id: 'BLK_PNE_SRT', from: 'PNE', to: 'SRT', type: 'single' },
]

const STATIONS = Object.keys(STATION_POSITIONS)

function kmToX(km: number): number {
  const maxKm = STATION_POSITIONS['SRT'].km
  const chartW = W - PAD.left - PAD.right
  return PAD.left + (km / maxKm) * chartW
}

function getSignalColor(state: string): string {
  if (state === 'green')  return '#10b981'
  if (state === 'yellow') return '#f59e0b'
  if (state === 'red')    return '#ef4444'
  return '#6b7280'
}

// ── Train marker ───────────────────────────────────────────────────────────────
function TrainMarker({
  train, x, y, isConflict,
}: { train: Train; x: number; y: number; isConflict: boolean }) {
  const [hovered, setHovered] = useState(false)
  const color = TRAIN_TYPE_COLORS[train.type] ?? '#94a3b8'
  const isUp = (train.direction ?? 1) === 1

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {/* Conflict glow */}
      {isConflict && (
        <circle
          cx={x}
          cy={y}
          r={14}
          fill="none"
          stroke="#ef4444"
          strokeWidth={1.5}
          opacity={0.5}
          style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
        />
      )}

      {/* Train body */}
      <motion.rect
        x={x - 10}
        y={y - 6}
        width={20}
        height={12}
        rx={3}
        fill={color}
        opacity={0.9}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        style={{ transformOrigin: `${x}px ${y}px` }}
      />

      {/* Direction arrow */}
      <polygon
        points={
          isUp
            ? `${x + 10},${y} ${x + 15},${y - 4} ${x + 15},${y + 4}`
            : `${x - 10},${y} ${x - 15},${y - 4} ${x - 15},${y + 4}`
        }
        fill={color}
        opacity={0.7}
      />

      {/* Train ID label */}
      <text
        x={x}
        y={y - 12}
        textAnchor="middle"
        fontSize={8}
        fill={color}
        fontFamily="IBM Plex Mono, monospace"
        fontWeight="600"
      >
        {train.id}
      </text>

      {/* Delay badge */}
      {train.current_delay_min > 2 && (
        <text
          x={x}
          y={y + 22}
          textAnchor="middle"
          fontSize={7}
          fill="#fbbf24"
          fontFamily="IBM Plex Mono, monospace"
        >
          +{train.current_delay_min.toFixed(0)}m
        </text>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <foreignObject x={x - 80} y={y - 90} width={160} height={80}>
          <div
            style={{
              background: '#10192E',
              border: '1px solid #243154',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 10,
              color: '#E8EBF5',
              fontFamily: 'IBM Plex Mono, monospace',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontWeight: 600, color: color, marginBottom: 2 }}>
              {train.id} — {train.type}
            </div>
            <div>Speed: {train.speed_kmh.toFixed(0)} km/h</div>
            <div>Delay: {train.current_delay_min.toFixed(1)} min</div>
            <div>Location: {train.current_location}</div>
          </div>
        </foreignObject>
      )}
    </g>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function NetworkMap({
  trains,
  stationState,
  blockOccupancy,
  signalStates,
  conflicts,
}: Props) {
  const trainList = useMemo(() => Object.values(trains), [trains])

  const conflictBlocks = useMemo(
    () => new Set(conflicts.filter((c) => !c.resolved).map((c) => c.block_section)),
    [conflicts]
  )

  const conflictTrains = useMemo(
    () => new Set(conflicts.flatMap((c) => [...(c.affected_trains ?? []), ...(c.trains_involved ?? [])])),
    [conflicts]
  )

  // Map train to x position based on km_position or block progress
  function trainX(train: Train): number {
    if (train.km_position !== undefined) return kmToX(train.km_position)
    const loc = train.current_location
    if (STATION_POSITIONS[loc]) return STATION_POSITIONS[loc].x
    // Try block midpoint
    const block = BLOCKS.find((b) => b.id === loc || b.id === train.current_block)
    if (block) {
      const fromX = STATION_POSITIONS[block.from]?.x ?? PAD.left
      const toX   = STATION_POSITIONS[block.to]?.x ?? W - PAD.right
      const pct   = train.progress_pct ?? 0.5
      return fromX + (toX - fromX) * pct
    }
    return PAD.left + (W - PAD.left - PAD.right) / 2
  }

  function trainY(train: Train, idx: number): number {
    const base = H / 2
    const dir  = train.direction ?? 1
    // Stagger trains in same block vertically
    const offset = (idx % 3) * 8
    return dir === 1 ? base - 18 - offset : base + 18 + offset
  }

  useEffect(() => {
    const id = setInterval(() => {/* animate trains */}, 2000)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h2
            className="font-heading font-semibold text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            Network Map
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Mumbai–Pune Corridor &bull; {trainList.length} trains active
          </p>
        </div>
        <div className="flex items-center gap-3">
          {conflictBlocks.size > 0 && (
            <span
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded"
              style={{
                background: 'var(--danger)18',
                border: '1px solid var(--danger)44',
                color: 'var(--danger)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: 'var(--danger)' }}
              />
              {conflictBlocks.size} block{conflictBlocks.size !== 1 ? 's' : ''} conflicted
            </span>
          )}
          <span
            className="text-xs px-2 py-1 rounded"
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            LIVE
          </span>
        </div>
      </div>

      {/* SVG Map */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ minWidth: 600, display: 'block' }}
          role="img"
          aria-label="Railway network map"
        >
          <defs>
            {/* Conflict glow filter */}
            <filter id="conflict-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Grid pattern */}
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1A2540" strokeWidth="0.5" />
            </pattern>
          </defs>

          {/* Background grid */}
          <rect width={W} height={H} fill="url(#grid)" opacity={0.4} />

          {/* ── Track lines ─────────────────────────────────────────────── */}
          {BLOCKS.map((block) => {
            const fromPos = STATION_POSITIONS[block.from]
            const toPos   = STATION_POSITIONS[block.to]
            if (!fromPos || !toPos) return null

            const occupied    = (blockOccupancy[block.id] ?? []).length > 0
            const isConflict  = conflictBlocks.has(block.id)
            const trackColor  = isConflict ? '#ef4444' : occupied ? '#4E7CFF' : '#1A2540'
            const trackOpacity = isConflict ? 0.8 : occupied ? 0.6 : 0.9

            return (
              <g key={block.id}>
                {/* Double track */}
                {block.type === 'double' && (
                  <>
                    <line
                      x1={fromPos.x} y1={fromPos.y - 6}
                      x2={toPos.x}   y2={toPos.y - 6}
                      stroke={trackColor}
                      strokeWidth={2}
                      opacity={trackOpacity}
                    />
                    <line
                      x1={fromPos.x} y1={fromPos.y + 6}
                      x2={toPos.x}   y2={toPos.y + 6}
                      stroke={trackColor}
                      strokeWidth={2}
                      opacity={trackOpacity}
                    />
                  </>
                )}
                {/* Single track */}
                {block.type === 'single' && (
                  <line
                    x1={fromPos.x} y1={fromPos.y}
                    x2={toPos.x}   y2={toPos.y}
                    stroke={trackColor}
                    strokeWidth={3}
                    opacity={trackOpacity}
                  />
                )}

                {/* Conflict heat overlay */}
                {isConflict && (
                  <rect
                    x={Math.min(fromPos.x, toPos.x)}
                    y={fromPos.y - 20}
                    width={Math.abs(toPos.x - fromPos.x)}
                    height={40}
                    fill="#ef4444"
                    opacity={0.06}
                    rx={4}
                    filter="url(#conflict-glow)"
                  />
                )}

                {/* Block label */}
                <text
                  x={(fromPos.x + toPos.x) / 2}
                  y={fromPos.y - 28}
                  textAnchor="middle"
                  fontSize={8}
                  fill={isConflict ? '#ef4444' : '#6B7A9E'}
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {block.id.replace('BLK_', '')}
                </text>

                {/* Occupancy count */}
                {occupied && (
                  <text
                    x={(fromPos.x + toPos.x) / 2}
                    y={fromPos.y + 38}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#4E7CFF"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {(blockOccupancy[block.id] ?? []).length} train{(blockOccupancy[block.id] ?? []).length !== 1 ? 's' : ''}
                  </text>
                )}
              </g>
            )
          })}

          {/* ── Signal indicators ────────────────────────────────────────── */}
          {BLOCKS.map((block) => {
            const fromPos = STATION_POSITIONS[block.from]
            const toPos   = STATION_POSITIONS[block.to]
            if (!fromPos || !toPos) return null

            const midX       = (fromPos.x + toPos.x) / 2
            const signalKey  = Object.keys(signalStates).find((k) => k.includes(block.from) || k.includes(block.id))
            const signalState = signalKey ? signalStates[signalKey] : 'green'
            const sigColor   = getSignalColor(signalState)

            return (
              <g key={`sig-${block.id}`}>
                <rect x={midX - 4} y={fromPos.y - 18} width={8} height={14} rx={2} fill="#0B1328" stroke="#243154" strokeWidth={1} />
                <circle cx={midX} cy={fromPos.y - 14} r={3} fill={sigColor} opacity={0.9} />
              </g>
            )
          })}

          {/* ── Station nodes ─────────────────────────────────────────── */}
          {STATIONS.map((code) => {
            const pos = STATION_POSITIONS[code]
            const state = stationState[code]
            const avail = state?.available_platforms ?? 2
            const total = state?.num_platforms ?? 4
            const utilPct = total > 0 ? ((total - avail) / total) : 0

            return (
              <g key={code}>
                {/* Station platform bar */}
                <rect
                  x={pos.x - 20}
                  y={pos.y - 40}
                  width={40}
                  height={6}
                  rx={3}
                  fill="#1A2540"
                />
                <rect
                  x={pos.x - 20}
                  y={pos.y - 40}
                  width={40 * utilPct}
                  height={6}
                  rx={3}
                  fill={utilPct > 0.8 ? '#FF5757' : utilPct > 0.5 ? '#FFB547' : '#20D97C'}
                />

                {/* Station node */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={10}
                  fill="#10192E"
                  stroke="#4E7CFF"
                  strokeWidth={1.5}
                />
                <circle cx={pos.x} cy={pos.y} r={4} fill="#4E7CFF" />

                {/* Station code */}
                <text
                  x={pos.x}
                  y={pos.y + 22}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#E8EBF5"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="700"
                >
                  {code}
                </text>

                {/* Station name */}
                <text
                  x={pos.x}
                  y={pos.y + 34}
                  textAnchor="middle"
                  fontSize={7}
                  fill="#6B7A9E"
                  fontFamily="Inter, sans-serif"
                >
                  {STATION_NAMES[code]}
                </text>

                {/* Km marker */}
                <text
                  x={pos.x}
                  y={PAD.top - 10}
                  textAnchor="middle"
                  fontSize={7}
                  fill="#6B7A9E"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {pos.km}km
                </text>
              </g>
            )
          })}

          {/* ── Train markers ─────────────────────────────────────────── */}
          {trainList.map((train, idx) => {
            const x = trainX(train)
            const y = trainY(train, idx)
            const isConflict = conflictTrains.has(train.id)

            return (
              <TrainMarker
                key={train.id}
                train={train}
                x={x}
                y={y}
                isConflict={isConflict}
              />
            )
          })}

          {/* ── Horizontal axis (km ruler) ───────────────────────────── */}
          <line
            x1={PAD.left}
            y1={H - PAD.bottom + 10}
            x2={W - PAD.right}
            y2={H - PAD.bottom + 10}
            stroke="#1A2540"
            strokeWidth={1}
          />
        </svg>
      </div>

      {/* Legend */}
      <div
        className="flex flex-wrap gap-4 px-4 py-3 border-t text-xs"
        style={{ borderColor: 'var(--border)' }}
      >
        {(['rajdhani', 'express', 'passenger', 'freight', 'departmental'] as const).map((t) => (
          <div key={t} className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-2 rounded" style={{ background: TRAIN_TYPE_COLORS[t] }} />
            <span style={{ color: 'var(--text-muted)' }} className="capitalize">{t}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#ef4444', opacity: 0.6 }} />
          <span style={{ color: 'var(--text-muted)' }}>Conflict</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-1.5 rounded" style={{ background: '#1A2540' }} />
          <span style={{ color: 'var(--text-muted)' }}>Track block</span>
        </div>
      </div>
    </div>
  )
}