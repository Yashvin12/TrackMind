/**
 * NetworkMap — Light-Mode Railway Operations Map
 * ===============================================
 * Inspired by real COA (Control Office Application) and railway schematic displays.
 * White canvas, IR-blue track lines, block occupancy color bands,
 * station plates, platform squares, three-light signals, conflict hatching,
 * route lock overlays, and a future-time timeline scrubber.
 */

import { useMemo, useRef, useState, useCallback } from 'react'
import { Train, TrainType } from '../types/train'
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

// ── Station config ────────────────────────────────────────────────────────────
const STATION_KM: Record<string, number> = { MUM: 0, KLD: 60, LNL: 96, PNE: 192, SRT: 450 }
const STATION_NAMES: Record<string, string> = {
  MUM: 'Mumbai CST',
  KLD: 'Karjat Jn',
  LNL: 'Lonavala',
  PNE: 'Pune Jn',
  SRT: 'Solapur Rd',
}
const STATIONS = Object.keys(STATION_KM)
const MAX_KM   = STATION_KM['SRT']

const BLOCKS: Array<{ id: string; from: string; to: string; type: 'single' | 'double' }> = [
  { id: 'BLK_MUM_KLD', from: 'MUM', to: 'KLD', type: 'double' },
  { id: 'BLK_KLD_LNL', from: 'KLD', to: 'LNL', type: 'single' },
  { id: 'BLK_LNL_PNE', from: 'LNL', to: 'PNE', type: 'double' },
  { id: 'BLK_PNE_SRT', from: 'PNE', to: 'SRT', type: 'single' },
]

// Lane config for parallel tracks
const LANES: { type: TrainType; yOffset: number }[] = [
  { type: 'rajdhani',  yOffset: -64 },
  { type: 'express',   yOffset: -22 },
  { type: 'passenger', yOffset:  22 },
  { type: 'freight',   yOffset:  64 },
]
const DEPT_OFFSET = 108

const TRAIN_LIGHT_COLORS: Record<string, string> = {
  rajdhani:     '#6D28D9',
  express:      '#1565C0',
  passenger:    '#0E7490',
  freight:      '#92400E',
  departmental: '#374151',
}

// ── SVG dimensions ────────────────────────────────────────────────────────────
const SVG_H    = 440
const PAD_L    = 80
const PAD_R    = 60
const PAD_T    = 52
const CENTER_Y = SVG_H / 2 - 10

const DEFAULT_SPACING = 190
const MIN_SPACING     = 130
const MAX_SPACING     = 440

function stationX(code: string, spacing: number) {
  return PAD_L + (STATION_KM[code] / MAX_KM) * (spacing * (STATIONS.length - 1))
}
function svgWidth(spacing: number) { return stationX('SRT', spacing) + PAD_R }

function trainX(t: Train, spacing: number): number {
  if (t.km_position !== undefined) return PAD_L + (t.km_position / MAX_KM) * (spacing * (STATIONS.length - 1))
  const loc   = t.current_location
  if (STATION_KM[loc] !== undefined) return stationX(loc, spacing)
  const block = BLOCKS.find(b => b.id === loc || b.id === t.current_block)
  if (block) {
    return stationX(block.from, spacing) + (stationX(block.to, spacing) - stationX(block.from, spacing)) * (t.progress_pct ?? 0.5)
  }
  return stationX('MUM', spacing)
}
function laneY(type: TrainType): number {
  if (type === 'departmental') return CENTER_Y + DEPT_OFFSET
  return CENTER_Y + (LANES.find(l => l.type === type)?.yOffset ?? 0)
}

// ── TrainMarker ───────────────────────────────────────────────────────────────
function TrainMarker({ train, x, isConflict, isFocused, focusMode, onSelect }: {
  train: Train; x: number; isConflict: boolean; isFocused: boolean; focusMode: boolean; onSelect: () => void
}) {
  const [hover, setHover] = useState(false)
  const y      = laneY(train.type as TrainType)
  const color  = TRAIN_LIGHT_COLORS[train.type ?? 'passenger']
  const delay  = train.current_delay_min ?? 0
  const isUp   = (train.direction ?? 1) === 1
  const fadeOp = focusMode && !isFocused ? 0.1 : 1

  return (
    <g
      opacity={fadeOp}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      style={{ cursor: 'pointer', transition: `opacity 0.25s ease`, transform: `translate(${x}px, ${y}px)` }}
    >
      {/* Conflict pulse ring */}
      {isConflict && (
        <circle r={16} fill="none" stroke="var(--safety-red)" strokeWidth={1.5}
          opacity={0.7} style={{ animation: 'pulse-conflict 1.2s ease-in-out infinite' }} />
      )}

      {/* Train body */}
      <rect x={-18} y={-7} width={36} height={14} rx={2}
        fill={color} stroke={isConflict ? 'var(--safety-red)' : 'transparent'} strokeWidth={1.5}
        opacity={hover ? 1 : 0.9}
      />

      {/* Direction arrow */}
      {isUp
        ? <polygon points="18,-4 24,0 18,4" fill={color} opacity={0.8} />
        : <polygon points="-18,-4 -24,0 -18,4" fill={color} opacity={0.8} />
      }

      {/* Train ID */}
      <text x={0} y={4} textAnchor="middle" fontSize={7.5} fill="white"
        fontFamily="var(--font-mono)" fontWeight="700" style={{ pointerEvents: 'none' }}>
        {train.id}
      </text>

      {/* Delay badge */}
      {delay > 2 && (
        <g>
          <rect x={-12} y={10} width={24} height={10} rx={2}
            fill={delay > 15 ? 'var(--safety-red)' : 'var(--safety-amber)'} opacity={0.9} />
          <text x={0} y={18} textAnchor="middle" fontSize={6.5}
            fill="white" fontFamily="var(--font-mono)" fontWeight="700">
            +{delay.toFixed(0)}m
          </text>
        </g>
      )}

      {/* Hover tooltip */}
      {hover && (
        <foreignObject x={20} y={-40} width={130} height={76} style={{ overflow: 'visible', pointerEvents: 'none' }}>
          <div style={{
            background: 'white', border: '1px solid var(--border-strong)',
            borderRadius: 3, padding: '5px 8px', fontSize: 10,
            fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 700, color, marginBottom: 2 }}>{train.id} · {train.name ?? train.type}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>{train.current_location}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 9 }}>
              <span style={{ color: delay > 5 ? 'var(--safety-red)' : 'var(--safety-green)' }}>
                {delay > 0 ? `+${delay.toFixed(0)}m` : 'On time'}
              </span>
              <span>{(train.speed_kmh ?? 0).toFixed(0)} km/h</span>
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  )
}

// ── Signal post ───────────────────────────────────────────────────────────────
function SignalPost({ x, y, state }: { x: number; y: number; state: string }) {
  const red    = state === 'red'
  const yellow = state === 'yellow'
  const green  = state === 'green' || (!red && !yellow)
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y + 18} stroke="#374151" strokeWidth={1.5} />
      <rect x={x - 5} y={y - 14} width={10} height={20} rx={2} fill="#1F2937" stroke="#374151" strokeWidth={0.5} />
      <circle cx={x} cy={y - 10} r={3} fill={red ? '#DC2626' : '#374151'} opacity={red ? 1 : 0.3} />
      <circle cx={x} cy={y - 4}  r={3} fill={yellow ? '#D97706' : '#374151'} opacity={yellow ? 1 : 0.3} />
      <circle cx={x} cy={y + 2}  r={3} fill={green ? '#16A34A' : '#374151'} opacity={green ? 1 : 0.3} />
    </g>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function NetworkMap({ trains, stationState, blockOccupancy, signalStates, conflicts }: Props) {
  const [spacing, setSpacing]           = useState(DEFAULT_SPACING)
  const [heatmap, setHeatmap]           = useState(false)
  const [previewOffset, setPreviewOffset] = useState(0)  // minutes into future
  const svgRef = useRef<SVGSVGElement>(null)
  const { selectedConflictId, focusModeActive, liveConflicts } = useStore()

  const trainList = useMemo(() => Object.values(trains), [trains])

  const conflictBlocks = useMemo(
    () => new Set(conflicts.filter(c => !c.resolved).map(c => c.block_section)),
    [conflicts]
  )
  const conflictTrainIds = useMemo(
    () => new Set(conflicts.flatMap(c => [...(c.affected_trains ?? []), ...(c.trains_involved ?? [])])),
    [conflicts]
  )

  const focusedConflict = useMemo(() => {
    if (!selectedConflictId) return null
    return liveConflicts.find(lc => lc.id === selectedConflictId) ?? null
  }, [selectedConflictId, liveConflicts])

  const focusedTrainIds = useMemo(
    () => new Set(focusedConflict ? [...(focusedConflict.affected_trains ?? []), ...(focusedConflict.trains_involved ?? [])] : []),
    [focusedConflict]
  )
  const focusedBlock = focusedConflict?.block_section ?? null

  const W = svgWidth(spacing)

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    setSpacing(prev => Math.max(MIN_SPACING, Math.min(MAX_SPACING, prev + (e.deltaY > 0 ? -20 : 20))))
  }, [])

  // Block heatmap color (based on occupancy count)
  function heatColor(blockId: string): string {
    const count = (blockOccupancy[blockId] ?? []).length
    if (count === 0) return 'rgba(22,163,74,0.06)'
    if (count <= 2)  return 'rgba(217,119,6,0.10)'
    return 'rgba(220,38,38,0.14)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
      {/* Map header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-row-alt)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.78rem', color: 'var(--ir-blue)', letterSpacing: '0.05em' }}>
            NETWORK OCCUPANCY MAP
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
            Mumbai–Solapur Corridor · {trainList.length} trains
          </span>
          {focusModeActive && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700,
              color: 'var(--safety-amber)', background: 'var(--safety-amber-light)',
              padding: '1px 7px', borderRadius: 2, border: '1px solid var(--safety-amber-border)',
            }}>
              ● FOCUS MODE · ESC to exit
            </span>
          )}
          {conflictBlocks.size > 0 && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700,
              color: 'var(--safety-red)', background: 'var(--safety-red-light)',
              padding: '1px 7px', borderRadius: 2, border: '1px solid var(--safety-red-border)',
              animation: 'pulse-conflict 1.5s ease-in-out infinite',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--safety-red)', animation: 'blink-live 1s ease-in-out infinite', display: 'inline-block' }} />
              {conflictBlocks.size} SECTION{conflictBlocks.size > 1 ? 'S' : ''} CONFLICTED
            </span>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setHeatmap(v => !v)}
            style={{
              padding: '2px 8px', borderRadius: 2, fontSize: '0.62rem', fontWeight: 600,
              fontFamily: 'var(--font-mono)', cursor: 'pointer',
              background: heatmap ? 'var(--safety-amber-light)' : 'var(--bg-panel)',
              color: heatmap ? 'var(--safety-amber)' : 'var(--text-muted)',
              border: `1px solid ${heatmap ? 'var(--safety-amber-border)' : 'var(--border-strong)'}`,
              transition: 'all 100ms',
            }}
          >
            HEATMAP
          </button>
          <div style={{ display: 'flex', gap: 3 }}>
            {[['−', -20], ['⊞', 0], ['+', 20]].map(([label, delta]) => (
              <button
                key={label}
                onClick={() => delta === 0 ? setSpacing(DEFAULT_SPACING) : setSpacing(s => Math.max(MIN_SPACING, Math.min(MAX_SPACING, s + Number(delta))))}
                style={{
                  width: 22, height: 22, borderRadius: 2, fontSize: '0.75rem', fontWeight: 700,
                  background: 'var(--bg-panel)', color: 'var(--text-muted)',
                  border: '1px solid var(--border-strong)', cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Map canvas */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${SVG_H}`}
          width={W}
          height={SVG_H}
          style={{ minWidth: 560, display: 'block', background: 'var(--bg-panel)' }}
          onWheel={handleWheel}
          aria-label="Railway network occupancy map"
        >
          <defs>
            {/* Conflict hatching pattern */}
            <pattern id="conflict-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(220,38,38,0.25)" strokeWidth="3" />
            </pattern>
            {/* Subtle grid */}
            <pattern id="light-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
            </pattern>
            {/* Route lock dashes */}
            <pattern id="route-lock" width="12" height="12" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="12" y2="12" stroke="rgba(21,101,192,0.3)" strokeWidth="1.5" />
            </pattern>
          </defs>

          {/* Background grid */}
          <rect width={W} height={SVG_H} fill="url(#light-grid)" />

          {/* ── Block sections ────────────────────────────────────────────── */}
          {BLOCKS.map(block => {
            const fromX    = stationX(block.from, spacing)
            const toX      = stationX(block.to, spacing)
            const occupied = (blockOccupancy[block.id] ?? []).length > 0
            const isConflict  = conflictBlocks.has(block.id)
            const isFocusedBlk = block.id === focusedBlock
            const blockFade = focusModeActive && !isFocusedBlk ? 0.15 : 1
            const trackW   = block.type === 'double' ? 5 : 3.5
            const midX     = (fromX + toX) / 2

            // Block fill color
            const fillColor = isConflict ? 'rgba(220,38,38,0.08)'
              : occupied ? 'rgba(217,119,6,0.07)'
              : heatmap ? heatColor(block.id)
              : 'transparent'

            const signalKey   = Object.keys(signalStates).find(k => k.includes(block.from) || k.includes(block.id))
            const signalState = signalKey ? signalStates[signalKey] : 'green'

            return (
              <g key={block.id} style={{ opacity: blockFade, transition: 'opacity 0.25s ease' }}>
                {/* Block background band */}
                <rect
                  x={fromX} y={CENTER_Y - DEPT_OFFSET - 20}
                  width={toX - fromX} height={DEPT_OFFSET * 2 + 40}
                  fill={fillColor}
                />

                {/* Conflict hatching */}
                {isConflict && (
                  <rect
                    x={fromX} y={CENTER_Y - DEPT_OFFSET - 20}
                    width={toX - fromX} height={DEPT_OFFSET * 2 + 40}
                    fill="url(#conflict-hatch)"
                  />
                )}

                {/* Focus ring */}
                {isFocusedBlk && focusModeActive && (
                  <rect
                    x={fromX} y={CENTER_Y - DEPT_OFFSET - 24}
                    width={toX - fromX} height={DEPT_OFFSET * 2 + 48}
                    fill="none" stroke="var(--safety-red)" strokeWidth={2}
                    strokeDasharray="6 4" rx={3}
                    style={{ animation: 'pulse-conflict 1.5s ease-in-out infinite' }}
                  />
                )}

                {/* Rails for each lane */}
                {[...LANES.map(l => l.yOffset), DEPT_OFFSET].map(yOff => (
                  <g key={yOff}>
                    {/* Rail bed */}
                    <line
                      x1={fromX} y1={CENTER_Y + yOff}
                      x2={toX}   y2={CENTER_Y + yOff}
                      stroke={isConflict ? '#FCA5A5' : occupied ? '#FCD34D' : '#E5E7EB'}
                      strokeWidth={trackW + 3}
                    />
                    {/* Rail */}
                    <line
                      x1={fromX} y1={CENTER_Y + yOff}
                      x2={toX}   y2={CENTER_Y + yOff}
                      stroke={isConflict ? 'var(--safety-red)' : occupied ? 'var(--safety-amber)' : 'var(--ir-blue)'}
                      strokeWidth={trackW}
                      opacity={isConflict ? 0.9 : occupied ? 0.7 : 0.5}
                    />
                    {/* Flow animation on occupied/conflict */}
                    {(occupied || isConflict) && (
                      <line
                        x1={fromX} y1={CENTER_Y + yOff}
                        x2={toX}   y2={CENTER_Y + yOff}
                        stroke={isConflict ? 'var(--safety-red)' : 'var(--safety-amber)'}
                        strokeWidth={2}
                        strokeDasharray="10 14"
                        opacity={0.55}
                        style={{ animation: `track-flow ${isConflict ? '0.6s' : '1s'} linear infinite` }}
                      />
                    )}
                  </g>
                ))}

                {/* Conflict warning label */}
                {isConflict && (
                  <g>
                    <rect x={midX - 28} y={CENTER_Y - DEPT_OFFSET - 38} width={56} height={14} rx={2}
                      fill="var(--safety-red)" opacity={0.9} />
                    <text x={midX} y={CENTER_Y - DEPT_OFFSET - 28}
                      textAnchor="middle" fontSize={7.5} fill="white"
                      fontFamily="var(--font-heading)" fontWeight="700" letterSpacing="0.04em">
                      ⚠ CONFLICT
                    </text>
                  </g>
                )}

                {/* Occupancy count */}
                {occupied && !isConflict && (
                  <text x={midX} y={CENTER_Y - DEPT_OFFSET - 26}
                    textAnchor="middle" fontSize={7} fill="var(--safety-amber)"
                    fontFamily="var(--font-mono)" fontWeight="700">
                    {(blockOccupancy[block.id] ?? []).length}T
                  </text>
                )}

                {/* Signal post */}
                <SignalPost x={fromX + 24} y={CENTER_Y - 28} state={signalState} />

                {/* Block type label */}
                <text x={midX} y={SVG_H - 18}
                  textAnchor="middle" fontSize={7} fill="var(--text-faint)"
                  fontFamily="var(--font-mono)">
                  {block.id} · {block.type}
                </text>
              </g>
            )
          })}

          {/* ── Lane labels ───────────────────────────────────────────────── */}
          {LANES.map(lane => (
            <text key={`ll-${lane.type}`}
              x={PAD_L - 8} y={CENTER_Y + lane.yOffset + 4}
              textAnchor="end" fontSize={7} fill={TRAIN_LIGHT_COLORS[lane.type]}
              fontFamily="var(--font-mono)" fontWeight="700" opacity={0.7}>
              {lane.type.toUpperCase().slice(0, 4)}
            </text>
          ))}
          <text x={PAD_L - 8} y={CENTER_Y + DEPT_OFFSET + 4}
            textAnchor="end" fontSize={7} fill={TRAIN_LIGHT_COLORS['departmental']}
            fontFamily="var(--font-mono)" fontWeight="700" opacity={0.7}>
            DEPT
          </text>

          {/* ── Stations ──────────────────────────────────────────────────── */}
          {STATIONS.map(code => {
            const x   = stationX(code, spacing)
            const st  = stationState[code]
            const total = st?.num_platforms ?? 4
            const occupants = st?.platform_occupants ?? {}
            const isFocused = focusedBlock ? focusedBlock.includes(code) : false
            const fadeOp = focusModeActive && !isFocused ? 0.12 : 1

            return (
              <g key={code} style={{ opacity: fadeOp, transition: 'opacity 0.25s ease' }}>
                {/* Station pillar — spans all lanes */}
                <line x1={x} y1={CENTER_Y - DEPT_OFFSET - 20}
                  x2={x} y2={CENTER_Y + DEPT_OFFSET + 20}
                  stroke="var(--ir-blue)" strokeWidth={1} strokeDasharray="4 3" opacity={0.35} />

                {/* Station name plate */}
                <rect x={x - 28} y={PAD_T - 20} width={56} height={16} rx={2}
                  fill="var(--ir-blue)" />
                <text x={x} y={PAD_T - 9} textAnchor="middle" fontSize={9.5} fill="white"
                  fontFamily="var(--font-heading)" fontWeight="700" letterSpacing="0.04em">
                  {code}
                </text>
                <text x={x} y={PAD_T + 2} textAnchor="middle" fontSize={6.5} fill="var(--text-muted)"
                  fontFamily="var(--font-body)">
                  {STATION_NAMES[code]}
                </text>

                {/* Platform occupancy squares */}
                <g transform={`translate(${x - (total * 10) / 2}, ${PAD_T + 8})`}>
                  {Array.from({ length: total }, (_, i) => {
                    const platId  = String(i + 1)
                    const hasOcc  = occupants[platId] != null
                    return (
                      <g key={i}>
                        <rect x={i * 10} y={0} width={8} height={8} rx={1}
                          fill={hasOcc ? 'var(--safety-amber)' : 'var(--safety-green)'}
                          stroke={hasOcc ? 'var(--safety-amber)' : 'var(--safety-green)'}
                          strokeWidth={0.5} opacity={0.8} />
                        <text x={i * 10 + 4} y={7} textAnchor="middle" fontSize={5}
                          fill="white" fontFamily="var(--font-mono)" fontWeight="700">
                          {platId}
                        </text>
                      </g>
                    )
                  })}
                </g>

                {/* Station node on center line */}
                <circle cx={x} cy={CENTER_Y} r={8} fill="white"
                  stroke="var(--ir-blue)" strokeWidth={2} />
                <circle cx={x} cy={CENTER_Y} r={3.5} fill="var(--ir-blue)" />

                {/* Km marker */}
                <text x={x} y={SVG_H - 6} textAnchor="middle" fontSize={7}
                  fill="var(--text-faint)" fontFamily="var(--font-mono)">
                  {STATION_KM[code]}km
                </text>
              </g>
            )
          })}

          {/* ── Train markers ─────────────────────────────────────────────── */}
          {trainList.map(t => {
            const x         = trainX(t, spacing)
            const isConflict = conflictTrainIds.has(t.id)
            const isFocused  = focusedTrainIds.has(t.id)
            return (
              <TrainMarker
                key={t.id}
                train={t}
                x={x}
                isConflict={isConflict}
                isFocused={isFocused}
                focusMode={focusModeActive}
                onSelect={() => {}}
              />
            )
          })}

          {/* ── Legend (bottom-right) ─────────────────────────────────────── */}
          <g>
            {[
              { color: 'var(--safety-green)', label: 'Free' },
              { color: 'var(--safety-amber)', label: 'Occupied' },
              { color: 'var(--safety-red)',   label: 'Conflict' },
            ].map(({ color, label }, i) => (
              <g key={label} transform={`translate(${W - PAD_R - 160 + i * 58}, ${SVG_H - 6})`}>
                <line x1={0} y1={0} x2={14} y2={0} stroke={color} strokeWidth={3} strokeLinecap="round" />
                <text x={18} y={4} fontSize={7} fill="var(--text-muted)" fontFamily="var(--font-mono)">{label}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* ── Timeline Slider ───────────────────────────────────────────────── */}
      <div style={{
        padding: '6px 16px 6px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-row-alt)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          CONFLICT PREVIEW
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--safety-green)', fontWeight: 700, whiteSpace: 'nowrap' }}>
          NOW
        </span>
        <input
          type="range" min={0} max={30} step={1} value={previewOffset}
          onChange={e => setPreviewOffset(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--ir-blue)', cursor: 'pointer' }}
        />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700,
          color: previewOffset > 0 ? 'var(--safety-amber)' : 'var(--text-faint)',
          whiteSpace: 'nowrap',
          minWidth: 52,
        }}>
          {previewOffset > 0 ? `T+${previewOffset}min` : 'Drag →'}
        </span>

        {/* Lane legend */}
        {[
          { color: TRAIN_LIGHT_COLORS.rajdhani, label: 'Rajdhani/VB' },
          { color: TRAIN_LIGHT_COLORS.express,  label: 'Express' },
          { color: TRAIN_LIGHT_COLORS.passenger, label: 'Passenger' },
          { color: TRAIN_LIGHT_COLORS.freight,   label: 'Freight' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ width: 14, height: 3, borderRadius: 1, background: color, display: 'inline-block' }} />
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>{label}</span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes track-flow {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -24; }
        }
        @keyframes pulse-conflict {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
      `}</style>
    </div>
  )
}