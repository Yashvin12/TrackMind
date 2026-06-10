/**
 * NetworkMap — Operator-Grade Network Visualization
 * ===================================================
 * Visual lanes (Express / Passenger / Freight / Departmental) rendered as
 * horizontal parallel rails between station pillars. Supports:
 *  - Mouse-wheel zoom (horizontal spacing 120–500px)
 *  - Train stacking/grouping when visual distance < 48px
 *  - Smart labels: icon only → tooltip on hover → card on click
 *  - Block occupancy color-coding: green/yellow/red with flow animation
 *  - Focus Mode: fades unrelated elements when a conflict is selected
 */

import { useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Train, TRAIN_TYPE_COLORS, TrainType } from '../types/train'
import { Conflict } from '../types/conflict'
import { StationState } from '../store/index'
import { useStore } from '../store/index'

interface Props {
  trains: Record<string, Train>
  stationState: Record<string, StationState>
  blockOccupancy: Record<string, string[]>
  signalStates: Record<string, string>
  conflicts: Conflict[]
}

// ── Lane config ───────────────────────────────────────────────────────────────
const LANES: { type: TrainType; label: string; yOffset: number }[] = [
  { type: 'rajdhani',     label: 'Rajdhani',     yOffset: -72 },
  { type: 'express',      label: 'Express',       yOffset: -24 },
  { type: 'passenger',    label: 'Passenger',     yOffset: 24  },
  { type: 'freight',      label: 'Freight',       yOffset: 72  },
]
const DEPARTMENTAL_OFFSET = 120

// ── Station data ──────────────────────────────────────────────────────────────
const STATION_KM: Record<string, number> = {
  MUM: 0,
  KLD: 60,
  LNL: 96,
  PNE: 192,
  SRT: 450,
}
const STATION_NAMES: Record<string, string> = {
  MUM: 'Mumbai CST',
  KLD: 'Karjat',
  LNL: 'Lonavala',
  PNE: 'Pune Jn',
  SRT: 'Solapur Rd',
}
const STATIONS = Object.keys(STATION_KM)
const MAX_KM = STATION_KM['SRT']

const BLOCKS: Array<{ id: string; from: string; to: string; type: 'single' | 'double' }> = [
  { id: 'BLK_MUM_KLD', from: 'MUM', to: 'KLD', type: 'double' },
  { id: 'BLK_KLD_LNL', from: 'KLD', to: 'LNL', type: 'single' },
  { id: 'BLK_LNL_PNE', from: 'LNL', to: 'PNE', type: 'double' },
  { id: 'BLK_PNE_SRT', from: 'PNE', to: 'SRT', type: 'single' },
]

// ── Constants ─────────────────────────────────────────────────────────────────
const SVG_H = 480
const PAD_L = 72
const PAD_R = 72
const PAD_T = 40
const CENTER_Y = SVG_H / 2

const DEFAULT_SPACING = 180  // px between stations
const MIN_SPACING = 120
const MAX_SPACING = 420

// ── Helpers ───────────────────────────────────────────────────────────────────
function stationX(code: string, spacing: number): number {
  const km = STATION_KM[code] ?? 0
  return PAD_L + (km / MAX_KM) * (spacing * (STATIONS.length - 1))
}

function svgWidth(spacing: number): number {
  return stationX('SRT', spacing) + PAD_R
}

function trainX(train: Train, spacing: number): number {
  if (train.km_position !== undefined) {
    return PAD_L + (train.km_position / MAX_KM) * (spacing * (STATIONS.length - 1))
  }
  const loc = train.current_location
  if (STATION_KM[loc] !== undefined) return stationX(loc, spacing)
  const block = BLOCKS.find((b) => b.id === loc || b.id === train.current_block)
  if (block) {
    const fx = stationX(block.from, spacing)
    const tx = stationX(block.to, spacing)
    return fx + (tx - fx) * (train.progress_pct ?? 0.5)
  }
  return stationX('MUM', spacing)
}

function laneY(type: TrainType): number {
  if (type === 'departmental') return CENTER_Y + DEPARTMENTAL_OFFSET
  const lane = LANES.find((l) => l.type === type)
  return CENTER_Y + (lane?.yOffset ?? 0)
}

function getSignalColor(state: string): string {
  if (state === 'green')  return '#10b981'
  if (state === 'yellow') return '#f59e0b'
  if (state === 'red')    return '#ef4444'
  return '#6b7280'
}

// ── Train Group ───────────────────────────────────────────────────────────────
interface TrainGroup {
  lane: TrainType
  x: number
  trains: Train[]
}

function groupTrains(trainList: Train[], spacing: number): TrainGroup[] {
  // Bucket by lane type
  const byLane: Record<string, Train[]> = {}
  for (const t of trainList) {
    const type = t.type ?? 'passenger'
    if (!byLane[type]) byLane[type] = []
    byLane[type].push(t)
  }

  const groups: TrainGroup[] = []
  for (const [lane, trains] of Object.entries(byLane)) {
    // Sort by x position
    const sorted = [...trains].sort((a, b) => trainX(a, spacing) - trainX(b, spacing))
    let cluster: Train[] = []
    let clusterX = 0

    const flush = () => {
      if (cluster.length > 0) {
        groups.push({ lane: lane as TrainType, x: clusterX / cluster.length, trains: [...cluster] })
        cluster = []
        clusterX = 0
      }
    }

    for (const train of sorted) {
      const tx = trainX(train, spacing)
      if (cluster.length === 0) {
        cluster.push(train)
        clusterX = tx
      } else {
        const avgX = clusterX / cluster.length
        if (Math.abs(tx - avgX) < 48) {
          cluster.push(train)
          clusterX += tx
        } else {
          flush()
          cluster.push(train)
          clusterX = tx
        }
      }
    }
    flush()
  }
  return groups
}

// ── Train Card (tooltip / expanded) ──────────────────────────────────────────
function TrainDetailCard({
  trains,
  x, y,
  onClose,
}: {
  trains: Train[]
  x: number
  y: number
  onClose: () => void
}) {
  const cardW = 200
  const cardH = trains.length * 72 + 32
  const clampedX = Math.max(8, Math.min(x - cardW / 2, 9999))
  const clampedY = y - cardH - 16

  return (
    <foreignObject x={clampedX} y={clampedY} width={cardW} height={cardH + 8} style={{ overflow: 'visible' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.15 }}
        style={{
          background: '#0B1328',
          border: '1px solid #243154',
          borderRadius: 10,
          padding: '8px 10px',
          fontSize: 10,
          color: '#E8EBF5',
          fontFamily: 'IBM Plex Mono, monospace',
          pointerEvents: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ color: '#8FA7D9', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {trains.length} trains
          </span>
          <button
            onClick={onClose}
            style={{ color: '#6B7A9E', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }}
          >
            ✕
          </button>
        </div>
        {trains.map((train) => {
          const color = TRAIN_TYPE_COLORS[train.type] ?? '#94a3b8'
          const delay = train.current_delay_min
          return (
            <div
              key={train.id}
              style={{
                borderTop: '1px solid #1A2540',
                paddingTop: 6,
                marginTop: 4,
              }}
            >
              <div style={{ fontWeight: 700, color, marginBottom: 2 }}>{train.id}</div>
              <div style={{ color: '#9AA7C9', fontSize: 9 }}>{train.name ?? train.type}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 9 }}>
                <span style={{ color: delay > 5 ? '#FF5757' : '#20D97C' }}>
                  {delay > 0 ? `+${delay.toFixed(0)}m` : 'On time'}
                </span>
                <span style={{ color: '#6B7A9E' }}>{train.speed_kmh.toFixed(0)} km/h</span>
                <span style={{ color: '#6B7A9E' }}>P{train.priority_class}</span>
              </div>
            </div>
          )
        })}
      </motion.div>
    </foreignObject>
  )
}

// ── Single group marker ───────────────────────────────────────────────────────
function TrainGroupMarker({
  group,
  isConflict,
  focusMode,
  isFocused,
}: {
  group: TrainGroup
  isConflict: boolean
  focusMode: boolean
  isFocused: boolean
}) {
  const [open, setOpen] = useState(false)
  const y = laneY(group.lane)
  const color = TRAIN_TYPE_COLORS[group.lane] ?? '#94a3b8'
  const isMulti = group.trains.length > 1
  const isSingle = group.trains.length === 1
  const train0 = group.trains[0]
  const delay0 = train0?.current_delay_min ?? 0

  const fadeOpacity = focusMode && !isFocused ? 0.1 : 1

  return (
    <g style={{ opacity: fadeOpacity, transition: 'opacity 0.25s ease' }}>
      {/* Conflict pulse ring */}
      {isConflict && (
        <circle
          cx={group.x}
          cy={y}
          r={18}
          fill="none"
          stroke="#FF5757"
          strokeWidth={1.5}
          opacity={0.5}
          style={{ animation: 'pulse-ring 1.4s ease-in-out infinite' }}
        />
      )}

      {/* Clickable body */}
      <g
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: 'pointer' }}
      >
        {isMulti ? (
          // Grouped badge
          <>
            <rect
              x={group.x - 22}
              y={y - 10}
              width={44}
              height={20}
              rx={5}
              fill={color}
              opacity={0.18}
              stroke={color}
              strokeWidth={1}
            />
            <text
              x={group.x}
              y={y + 4}
              textAnchor="middle"
              fontSize={9}
              fill={color}
              fontFamily="IBM Plex Mono, monospace"
              fontWeight="700"
            >
              ({group.trains.length})
            </text>
          </>
        ) : (
          // Single train marker
          <>
            <rect
              x={group.x - 10}
              y={y - 6}
              width={20}
              height={12}
              rx={3}
              fill={color}
              opacity={0.9}
            />
            {/* Direction arrow */}
            {(train0?.direction ?? 1) === 1 ? (
              <polygon
                points={`${group.x + 10},${y} ${group.x + 15},${y - 4} ${group.x + 15},${y + 4}`}
                fill={color}
                opacity={0.7}
              />
            ) : (
              <polygon
                points={`${group.x - 10},${y} ${group.x - 15},${y - 4} ${group.x - 15},${y + 4}`}
                fill={color}
                opacity={0.7}
              />
            )}
          </>
        )}

        {/* Delay badge (below marker) - only for single, delayed trains */}
        {isSingle && delay0 > 2 && (
          <text
            x={group.x}
            y={y + 22}
            textAnchor="middle"
            fontSize={7}
            fill="#FFB547"
            fontFamily="IBM Plex Mono, monospace"
          >
            +{delay0.toFixed(0)}m
          </text>
        )}
      </g>

      {/* Expanded card */}
      <AnimatePresence>
        {open && (
          <TrainDetailCard
            trains={group.trains}
            x={group.x}
            y={y}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
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
  const [spacing, setSpacing] = useState(DEFAULT_SPACING)
  const svgRef = useRef<SVGSVGElement>(null)
  const { selectedConflictId, focusModeActive, liveConflicts } = useStore()

  const trainList = useMemo(() => Object.values(trains), [trains])

  const conflictBlocks = useMemo(
    () => new Set(conflicts.filter((c) => !c.resolved).map((c) => c.block_section)),
    [conflicts]
  )
  const conflictTrainIds = useMemo(
    () => new Set(conflicts.flatMap((c) => [...(c.affected_trains ?? []), ...(c.trains_involved ?? [])])),
    [conflicts]
  )

  // Focus mode: find affected elements for the selected conflict
  const focusedConflict = useMemo(() => {
    if (!selectedConflictId) return null
    return liveConflicts.find((lc) => lc.id === selectedConflictId) ?? null
  }, [selectedConflictId, liveConflicts])

  const focusedTrainIds = useMemo(
    () => new Set(focusedConflict ? [...(focusedConflict.affected_trains ?? []), ...(focusedConflict.trains_involved ?? [])] : []),
    [focusedConflict]
  )
  const focusedBlock = focusedConflict?.block_section ?? null

  // Train groups (stacked when <48px apart in same lane)
  const trainGroups = useMemo(() => groupTrains(trainList, spacing), [trainList, spacing])

  const W = svgWidth(spacing)

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault()
      setSpacing((prev) => {
        const delta = e.deltaY > 0 ? -16 : 16
        return Math.max(MIN_SPACING, Math.min(MAX_SPACING, prev + delta))
      })
    },
    []
  )

  const handleFitToSection = () => setSpacing(DEFAULT_SPACING)

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
          <h2 className="font-heading font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            Network Map
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Mumbai–Pune Corridor &bull; {trainList.length} trains active
            {focusModeActive && (
              <span style={{ color: 'var(--warning)', marginLeft: 8 }}>● FOCUS MODE</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--danger)' }} />
              {conflictBlocks.size} block{conflictBlocks.size !== 1 ? 's' : ''} conflicted
            </span>
          )}
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSpacing((s) => Math.max(MIN_SPACING, s - 24))}
              className="px-2 py-1 rounded text-xs transition-all"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              title="Zoom out"
            >
              −
            </button>
            <button
              onClick={handleFitToSection}
              className="px-2 py-1 rounded text-xs transition-all"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              title="Fit to section"
            >
              ⊞
            </button>
            <button
              onClick={() => setSpacing((s) => Math.min(MAX_SPACING, s + 24))}
              className="px-2 py-1 rounded text-xs transition-all"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              title="Zoom in"
            >
              +
            </button>
          </div>
          <span
            className="text-xs px-2 py-1 rounded"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
          >
            LIVE
          </span>
        </div>
      </div>

      {/* SVG Map */}
      <div className="overflow-x-auto" style={{ overscrollBehaviorX: 'contain' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${SVG_H}`}
          width={W}
          height={SVG_H}
          style={{ minWidth: 500, display: 'block' }}
          role="img"
          aria-label="Railway network map"
          onWheel={handleWheel}
        >
          <defs>
            {/* Glow filter */}
            <filter id="nm-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Flow animation for occupied tracks */}
            <linearGradient id="track-flow-occupied" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4E7CFF" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#4E7CFF" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#4E7CFF" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="track-flow-conflict" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FF5757" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#FF5757" stopOpacity="1" />
              <stop offset="100%" stopColor="#FF5757" stopOpacity="0.4" />
            </linearGradient>
            {/* Grid */}
            <pattern id="nm-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1A2540" strokeWidth="0.4" />
            </pattern>
          </defs>

          {/* Background grid */}
          <rect width={W} height={SVG_H} fill="url(#nm-grid)" opacity={0.5} />

          {/* ── Lane labels (left margin) ──────────────────────────────── */}
          {LANES.map((lane) => (
            <text
              key={`lane-label-${lane.type}`}
              x={PAD_L - 6}
              y={CENTER_Y + lane.yOffset + 4}
              textAnchor="end"
              fontSize={7}
              fill={TRAIN_TYPE_COLORS[lane.type]}
              fontFamily="IBM Plex Mono, monospace"
              opacity={0.7}
            >
              {lane.label.toUpperCase()}
            </text>
          ))}
          <text
            x={PAD_L - 6}
            y={CENTER_Y + DEPARTMENTAL_OFFSET + 4}
            textAnchor="end"
            fontSize={7}
            fill={TRAIN_TYPE_COLORS['departmental']}
            fontFamily="IBM Plex Mono, monospace"
            opacity={0.7}
          >
            DEPT
          </text>

          {/* ── Track rails for each lane ──────────────────────────────── */}
          {BLOCKS.map((block) => {
            const fromX = stationX(block.from, spacing)
            const toX = stationX(block.to, spacing)
            const occupied = (blockOccupancy[block.id] ?? []).length > 0
            const isConflict = conflictBlocks.has(block.id)
            const isFocusedBlock = block.id === focusedBlock
            const blockFocus = focusModeActive && !isFocusedBlock

            const baseColor = isConflict ? '#FF5757' : occupied ? '#4E7CFF' : '#1A2540'

            return (
              <g key={block.id} style={{ opacity: blockFocus ? 0.12 : 1, transition: 'opacity 0.25s ease' }}>
                {/* All lanes rendered as parallel rails */}
                {[...LANES.map((l) => l.yOffset), DEPARTMENTAL_OFFSET].map((yOff) => (
                  <g key={yOff}>
                    {/* Rail base */}
                    <line
                      x1={fromX}
                      y1={CENTER_Y + yOff}
                      x2={toX}
                      y2={CENTER_Y + yOff}
                      stroke={isConflict ? '#2A1520' : '#12213A'}
                      strokeWidth={block.type === 'double' ? 6 : 4}
                    />
                    {/* Main colored rail */}
                    <line
                      x1={fromX}
                      y1={CENTER_Y + yOff}
                      x2={toX}
                      y2={CENTER_Y + yOff}
                      stroke={baseColor}
                      strokeWidth={block.type === 'double' ? 3 : 2}
                      opacity={isConflict ? 0.9 : occupied ? 0.6 : 0.4}
                    />
                    {/* Animated flow overlay */}
                    {(occupied || isConflict) && (
                      <line
                        x1={fromX}
                        y1={CENTER_Y + yOff}
                        x2={toX}
                        y2={CENTER_Y + yOff}
                        stroke={isConflict ? '#FF5757' : '#4E7CFF'}
                        strokeWidth={2}
                        strokeDasharray="12 16"
                        opacity={0.5}
                        style={{
                          animation: `track-flow ${isConflict ? '0.7s' : '1.2s'} linear infinite`,
                        }}
                      />
                    )}
                  </g>
                ))}

                {/* Conflict heat overlay on the band */}
                {isConflict && (
                  <rect
                    x={fromX}
                    y={CENTER_Y - DEPARTMENTAL_OFFSET - 20}
                    width={toX - fromX}
                    height={DEPARTMENTAL_OFFSET * 2 + 40}
                    fill="#FF5757"
                    opacity={0.04}
                    rx={4}
                    filter={isFocusedBlock ? 'url(#nm-glow)' : undefined}
                  />
                )}

                {/* Focus ring on the focused block */}
                {isFocusedBlock && focusModeActive && (
                  <rect
                    x={fromX}
                    y={CENTER_Y - DEPARTMENTAL_OFFSET - 24}
                    width={toX - fromX}
                    height={DEPARTMENTAL_OFFSET * 2 + 48}
                    fill="none"
                    stroke="#FF5757"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    opacity={0.6}
                    rx={6}
                    style={{ animation: 'pulse-ring 1.5s ease-in-out infinite' }}
                  />
                )}

                {/* Block occupancy label */}
                {occupied && (
                  <text
                    x={(fromX + toX) / 2}
                    y={CENTER_Y - DEPARTMENTAL_OFFSET - 30}
                    textAnchor="middle"
                    fontSize={7}
                    fill={isConflict ? '#FF5757' : '#4E7CFF'}
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {(blockOccupancy[block.id] ?? []).length}T
                  </text>
                )}
              </g>
            )
          })}

          {/* ── Station pillars ──────────────────────────────────────────── */}
          {STATIONS.map((code) => {
            const x = stationX(code, spacing)
            const st = stationState[code]
            const avail = st?.available_platforms ?? 2
            const total = st?.num_platforms ?? 4
            const utilPct = total > 0 ? (total - avail) / total : 0
            const isFocusedStation = focusedBlock
              ? (focusedBlock.includes(code))
              : false

            const stationFade = focusModeActive && !isFocusedStation ? 0.12 : 1

            return (
              <g key={code} style={{ opacity: stationFade, transition: 'opacity 0.25s ease' }}>
                {/* Vertical pillar spanning all lanes */}
                <line
                  x1={x}
                  y1={CENTER_Y - DEPARTMENTAL_OFFSET - 16}
                  x2={x}
                  y2={CENTER_Y + DEPARTMENTAL_OFFSET + 16}
                  stroke="#243154"
                  strokeWidth={1.5}
                />

                {/* Platform utilisation strip */}
                <rect
                  x={x - 16}
                  y={PAD_T + 4}
                  width={32}
                  height={6}
                  rx={3}
                  fill="#1A2540"
                />
                <rect
                  x={x - 16}
                  y={PAD_T + 4}
                  width={32 * utilPct}
                  height={6}
                  rx={3}
                  fill={utilPct > 0.8 ? '#FF5757' : utilPct > 0.5 ? '#FFB547' : '#20D97C'}
                />

                {/* Station node */}
                <circle cx={x} cy={CENTER_Y} r={10} fill="#10192E" stroke="#4E7CFF" strokeWidth={1.5} />
                <circle cx={x} cy={CENTER_Y} r={4} fill="#4E7CFF" />

                {/* Station code (above) */}
                <text
                  x={x}
                  y={PAD_T - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#E8EBF5"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="700"
                >
                  {code}
                </text>

                {/* Station full name (below code) */}
                <text
                  x={x}
                  y={PAD_T + 8}
                  textAnchor="middle"
                  fontSize={6.5}
                  fill="#6B7A9E"
                  fontFamily="Inter, sans-serif"
                >
                  {STATION_NAMES[code]}
                </text>

                {/* Km marker */}
                <text
                  x={x}
                  y={SVG_H - 16}
                  textAnchor="middle"
                  fontSize={7}
                  fill="#6B7A9E"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {STATION_KM[code]}km
                </text>
              </g>
            )
          })}

          {/* ── Signal indicators ──────────────────────────────────────── */}
          {BLOCKS.map((block) => {
            const midX = (stationX(block.from, spacing) + stationX(block.to, spacing)) / 2
            const signalKey = Object.keys(signalStates).find((k) => k.includes(block.from) || k.includes(block.id))
            const signalState = signalKey ? signalStates[signalKey] : 'green'
            const sigColor = getSignalColor(signalState)

            return (
              <g key={`sig-${block.id}`}>
                <rect x={midX - 4} y={CENTER_Y - 20} width={8} height={14} rx={2} fill="#0B1328" stroke="#243154" strokeWidth={1} />
                <circle cx={midX} cy={CENTER_Y - 15} r={3} fill={sigColor} opacity={0.9} />
              </g>
            )
          })}

          {/* ── Train markers (grouped) ────────────────────────────────── */}
          {trainGroups.map((group) => {
            const isConflict = group.trains.some((t) => conflictTrainIds.has(t.id))
            const isFocused = focusedConflict
              ? group.trains.some((t) => focusedTrainIds.has(t.id))
              : false

            return (
              <TrainGroupMarker
                key={`${group.lane}-${group.x.toFixed(0)}`}
                group={group}
                isConflict={isConflict}
                focusMode={focusModeActive}
                isFocused={isFocused}
              />
            )
          })}

          {/* ── Block state key (bottom right) ───────────────────────── */}
          <g>
            {[
              { color: '#20D97C', label: 'Free' },
              { color: '#4E7CFF', label: 'Occupied' },
              { color: '#FF5757', label: 'Conflict' },
            ].map(({ color, label }, i) => (
              <g key={label} transform={`translate(${W - PAD_R - 120 + i * 40}, ${SVG_H - 10})`}>
                <line x1={0} y1={0} x2={14} y2={0} stroke={color} strokeWidth={3} strokeLinecap="round" />
                <text x={18} y={4} fontSize={7} fill="#6B7A9E" fontFamily="IBM Plex Mono, monospace">
                  {label}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Lane legend */}
      <div
        className="flex flex-wrap gap-4 px-4 py-3 border-t text-xs"
        style={{ borderColor: 'var(--border)' }}
      >
        {LANES.map((lane) => (
          <div key={lane.type} className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-1.5 rounded" style={{ background: TRAIN_TYPE_COLORS[lane.type] }} />
            <span style={{ color: 'var(--text-muted)' }}>{lane.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-1.5 rounded" style={{ background: TRAIN_TYPE_COLORS['departmental'] }} />
          <span style={{ color: 'var(--text-muted)' }}>Departmental</span>
        </div>
        {focusModeActive && (
          <span className="ml-auto text-xs" style={{ color: 'var(--warning)', fontFamily: 'var(--font-mono)' }}>
            Focus Mode — press ESC to exit
          </span>
        )}
      </div>

      <style>{`
        @keyframes track-flow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -28; }
        }
        @keyframes pulse-ring {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
      `}</style>
    </div>
  )
}