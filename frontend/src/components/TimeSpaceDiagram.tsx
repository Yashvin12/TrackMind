/**
 * TimeSpaceDiagram — Operator-grade Stringline Diagram
 * ======================================================
 * Render layers (back → front):
 *   1. Actual paths    (solid, full opacity)
 *   2. Forecast paths  (dashed, 40% opacity for non-selected)
 *   3. Conflict markers (sized by severity, glow on hover only)
 *   4. Selected train  (2× width, full labels)
 *
 * Features:
 *  - Label collision avoidance (nearest-open-slot)
 *  - Train grouping by type (parallel slot offset)
 *  - Smart opacity: non-selected trains fade to 25%
 *  - Hover reveal: hovering a train brings it to full opacity + label
 *  - Conflict declustering: stagger overlapping markers
 *  - Crossing nodes replace diamonds
 *  - Conflict sizes: minor 8px · major 12px · critical 18px
 */

import { useMemo, useState, useCallback, useRef } from 'react'
import { Train, TRAIN_TYPE_COLORS } from '../types/train'
import { Conflict } from '../types/conflict'

interface Props {
  trains: Record<string, Train>
  conflicts: Conflict[]
  stations: string[]
}

// Km markers for the Mumbai-Pune corridor
const STATION_KM: Record<string, number> = {
  MUM: 0,
  KLD: 60,
  LNL: 96,
  PNE: 192,
  SRT: 450,
}

const STATION_FULL: Record<string, string> = {
  MUM: 'Mumbai CST',
  KLD: 'Karjat',
  LNL: 'Lonavala',
  PNE: 'Pune Jn',
  SRT: 'Solapur Rd',
}

interface Point { x: number; y: number }

function lineIntersect(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-10) return null
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: p1.x + t * d1x, y: p1.y + t * d1y }
}

// Conflict severity helpers
function conflictSeverityTier(severity: number): 'minor' | 'major' | 'critical' {
  if (severity >= 0.75) return 'critical'
  if (severity >= 0.40) return 'major'
  return 'minor'
}

function conflictRadius(tier: 'minor' | 'major' | 'critical'): number {
  return tier === 'critical' ? 9 : tier === 'major' ? 6 : 4
}

function conflictColor(tier: 'minor' | 'major' | 'critical'): string {
  return tier === 'critical' ? '#FF5757' : tier === 'major' ? '#FFB547' : '#60a5fa'
}

// Label collision avoidance — returns a y offset that avoids placed labels
function findFreeY(
  placed: Array<{ x: number; y: number; w: number; h: number }>,
  x: number,
  y: number,
  w: number,
  h: number,
  boundsTop: number,
  boundsBot: number
): number {
  const candidates = [y - h - 2, y + 4, y - h * 2 - 4, y + h + 6]
  for (const cy of candidates) {
    if (cy < boundsTop || cy + h > boundsBot) continue
    const overlap = placed.some((r) =>
      Math.abs(r.x - x) < (r.w + w) / 2 + 2 && Math.abs(r.y - cy) < (r.h + h) / 2 + 1
    )
    if (!overlap) return cy
  }
  // fallback: stack upward
  return Math.max(boundsTop, y - h - 2)
}

export function TimeSpaceDiagram({ trains, conflicts, stations }: Props) {
  const trainList = useMemo(() => Object.values(trains), [trains])

  const [hoveredTrainId, setHoveredTrainId] = useState<string | null>(null)
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null)
  const [hoveredConflictId, setHoveredConflictId] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const W = 780
  const H = 420
  const PAD = { left: 100, right: 28, top: 32, bottom: 48 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const stationKms = useMemo(() => stations.map((s) => STATION_KM[s] ?? 0), [stations])
  const maxKm = Math.max(...stationKms, 1)

  const kmToY = useCallback((km: number) => PAD.top + (km / maxKm) * chartH, [maxKm])

  const now = useMemo(() => Date.now(), [])
  const pastMs = 15 * 60 * 1000
  const futureMs = 60 * 60 * 1000
  const windowMs = pastMs + futureMs
  const timeStart = now - pastMs
  const timeToX = useCallback(
    (t: number) => PAD.left + ((t - timeStart) / windowMs) * chartW,
    [timeStart, windowMs, chartW]
  )
  const nowX = useMemo(() => timeToX(now), [timeToX, now])

  // Build trajectories
  const trajectories = useMemo(() => {
    return trainList
      .filter((t) => t.km_position !== undefined || STATION_KM[t.current_location] !== undefined)
      .map((train) => {
        const km = train.km_position ?? STATION_KM[train.current_location] ?? 0
        const color = TRAIN_TYPE_COLORS[train.type] ?? '#94a3b8'
        const speedKmMin = train.speed_kmh / 60
        const delay = train.current_delay_min

        const pastKm = Math.max(0, km - speedKmMin * 15)
        const futureKm = Math.min(maxKm, km + speedKmMin * 60)
        const futureKmDelayed = Math.min(maxKm, km + speedKmMin * 45)

        const pNow:   Point = { x: nowX,                          y: kmToY(km) }
        const pPast:  Point = { x: timeToX(now - 15 * 60 * 1000), y: kmToY(pastKm) }
        const pFuture:Point = { x: timeToX(now + 60 * 60 * 1000), y: kmToY(delay > 10 ? futureKmDelayed : futureKm) }

        const forecastColor = delay > 15 ? '#FF5757' : delay > 5 ? '#FFB547' : color

        return { train, color, forecastColor, pPast, pNow, pFuture, delay }
      })
  }, [trainList, now, maxKm, nowX, kmToY, timeToX])

  // Crossings
  const crossings = useMemo(() => {
    const points: Array<{ pt: Point; trainA: string; trainB: string }> = []
    for (let i = 0; i < trajectories.length; i++) {
      for (let j = i + 1; j < trajectories.length; j++) {
        const a = trajectories[i]
        const b = trajectories[j]
        const segs = [
          [a.pPast, a.pNow, b.pPast, b.pNow],
          [a.pPast, a.pNow, b.pNow, b.pFuture],
          [a.pNow, a.pFuture, b.pPast, b.pNow],
          [a.pNow, a.pFuture, b.pNow, b.pFuture],
        ] as const
        for (const [p1, p2, p3, p4] of segs) {
          const pt = lineIntersect(p1, p2, p3, p4)
          if (pt && pt.x >= PAD.left && pt.x <= W - PAD.right) {
            points.push({ pt, trainA: a.train.id, trainB: b.train.id })
          }
        }
      }
    }
    return points
  }, [trajectories])

  // Conflict markers with declustering
  const conflictMarkers = useMemo(() => {
    const raw = conflicts
      .filter((c) => !c.resolved)
      .map((c) => {
        const parts = c.block_section.replace('BLK_', '').split('_')
        const fromKm = STATION_KM[parts[0]] ?? 0
        const toKm   = STATION_KM[parts[1]] ?? fromKm + 50
        const midKm  = (fromKm + toKm) / 2
        const conflictTimeMs = now + c.time_to_conflict_min * 60 * 1000
        const tier = conflictSeverityTier(c.severity)
        return {
          conflict: c,
          x: timeToX(conflictTimeMs),
          y: kmToY(midKm),
          tier,
          r: conflictRadius(tier),
          color: conflictColor(tier),
        }
      })
      .filter((m) => m.x >= PAD.left && m.x <= W - PAD.right)

    // Decluster: push overlapping markers apart
    const CLUSTER_DIST = 22
    for (let i = 0; i < raw.length; i++) {
      for (let j = i + 1; j < raw.length; j++) {
        const dx = raw[j].x - raw[i].x
        const dy = raw[j].y - raw[i].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < CLUSTER_DIST && dist > 0) {
          const push = (CLUSTER_DIST - dist) / 2
          const nx = dx / dist, ny = dy / dist
          raw[i].x -= nx * push * 0.5
          raw[i].y -= ny * push * 0.5
          raw[j].x += nx * push * 0.5
          raw[j].y += ny * push * 0.5
        }
      }
    }
    return raw
  }, [conflicts, now, timeToX, kmToY])

  // Time axis
  const timeLabels = [-15, 0, 15, 30, 45, 60].map((offset) => ({
    label: offset === 0 ? 'NOW' : `${offset > 0 ? '+' : ''}${offset}m`,
    x: timeToX(now + offset * 60 * 1000),
    isNow: offset === 0,
  }))

  // Label placement — computed only for visible/selected trains
  const labelSlots = useMemo(() => {
    const placed: Array<{ x: number; y: number; w: number; h: number }> = []
    const LH = 10, LW = 40
    const result: Array<{ id: string; lx: number; ly: number }> = []

    // Process selected first so it gets priority
    const ordered = [...trajectories].sort((a, b) => {
      const aS = a.train.id === selectedTrainId ? -1 : 0
      const bS = b.train.id === selectedTrainId ? -1 : 0
      return aS - bS
    })

    for (const { train, pNow } of ordered) {
      const isSelected = train.id === selectedTrainId
      const isHovered  = train.id === hoveredTrainId
      if (!isSelected && !isHovered) {
        result.push({ id: train.id, lx: 0, ly: 0 })
        continue
      }
      const lx = pNow.x + 6
      const ly = findFreeY(placed, lx, pNow.y, LW, LH, PAD.top, H - PAD.bottom)
      placed.push({ x: lx, y: ly, w: LW, h: LH })
      result.push({ id: train.id, lx, ly })
    }
    return result
  }, [trajectories, selectedTrainId, hoveredTrainId])

  const getLabelSlot = (id: string) => labelSlots.find((s) => s.id === id)

  const handleTrainClick = useCallback((id: string) => {
    setSelectedTrainId((prev) => (prev === id ? null : id))
  }, [])

  const activeTrainId = selectedTrainId ?? hoveredTrainId

  // Sort trajectories: selected/hovered on top
  const sortedTraj = useMemo(() => {
    return [...trajectories].sort((a, b) => {
      const aScore = a.train.id === activeTrainId ? 2 : a.train.id === hoveredTrainId ? 1 : 0
      const bScore = b.train.id === activeTrainId ? 2 : b.train.id === hoveredTrainId ? 1 : 0
      return aScore - bScore
    })
  }, [trajectories, activeTrainId, hoveredTrainId])

  const conflictCount = conflictMarkers.length

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <h2 className="font-heading font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            Time-Space Diagram
          </h2>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--secondary)', borderRadius: 1 }} />
              actual
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 14, height: 0, borderTop: '2px dashed var(--secondary)' }} />
              forecast
            </span>
          </div>
          {selectedTrainId && (
            <span
              className="text-xs px-2 py-0.5 rounded"
              style={{ background: 'var(--accent)18', border: '1px solid var(--accent)44', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
            >
              {selectedTrainId} selected
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center">
          {conflictCount > 0 && (
            <span
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--danger)18', border: '1px solid var(--danger)44', color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}
            >
              {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
            </span>
          )}
          {crossings.length > 0 && (
            <span
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--warning)18', border: '1px solid var(--warning)44', color: 'var(--warning)', fontFamily: 'var(--font-mono)' }}
            >
              {crossings.length} crossing{crossings.length !== 1 ? 's' : ''}
            </span>
          )}
          {selectedTrainId && (
            <button
              onClick={() => setSelectedTrainId(null)}
              style={{
                fontSize: '0.65rem',
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                background: 'var(--surface-2)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* SVG Stringline */}
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ minWidth: 560, display: 'block', cursor: 'default' }}
          role="img"
          aria-label="Time-space diagram showing train trajectories"
        >
          <defs>
            {/* Glow for hover/selected — only applied on demand */}
            <filter id="ts-glow-sel" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="ts-glow-conflict" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="ts-glow-cross" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>

            {/* Delay heat gradient */}
            <linearGradient id="delay-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#FFB547" stopOpacity="0" />
              <stop offset="60%"  stopColor="#FF5757" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#FF5757" stopOpacity="0.22" />
            </linearGradient>

            {/* Clip to chart area */}
            <clipPath id="ts-clip">
              <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} />
            </clipPath>
          </defs>

          {/* ── Background ─────────────────────────────────────────────────── */}
          <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} fill="var(--bg-surface)" rx={4} />

          {/* Past shading */}
          <rect
            x={PAD.left} y={PAD.top}
            width={Math.max(0, nowX - PAD.left)} height={chartH}
            fill="rgba(14,22,48,0.45)"
          />

          {/* ── Grid: station horizontal lines ─────────────────────────────── */}
          {stations.map((s, i) => {
            const km = stationKms[i]
            const y  = kmToY(km)
            return (
              <g key={s}>
                <line
                  x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                  stroke="var(--border)" strokeWidth={1} strokeDasharray="3 5" opacity={0.55}
                />
                <text
                  x={PAD.left - 6} y={y + 4}
                  textAnchor="end" fontSize={8}
                  fill="var(--secondary)"
                  fontFamily="IBM Plex Mono, monospace" fontWeight="600"
                >
                  {s}
                </text>
                <text
                  x={PAD.left - 6} y={y + 14}
                  textAnchor="end" fontSize={5.5}
                  fill="var(--text-muted)"
                  fontFamily="Inter, sans-serif"
                >
                  {STATION_FULL[s] ?? s}
                </text>
              </g>
            )
          })}

          {/* ── Grid: time vertical lines ───────────────────────────────────── */}
          {timeLabels.map(({ label, x, isNow }) => {
            if (x < PAD.left || x > W - PAD.right) return null
            return (
              <g key={label}>
                <line
                  x1={x} y1={PAD.top} x2={x} y2={H - PAD.bottom}
                  stroke={isNow ? 'var(--accent)' : 'var(--border)'}
                  strokeWidth={isNow ? 1.5 : 0.75}
                  strokeDasharray={isNow ? undefined : '3 5'}
                  opacity={isNow ? 0.85 : 0.4}
                />
                <text
                  x={x} y={H - PAD.bottom + 13}
                  textAnchor="middle" fontSize={7.5}
                  fill={isNow ? 'var(--accent)' : 'var(--text-muted)'}
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight={isNow ? '700' : '400'}
                >
                  {label}
                </text>
              </g>
            )
          })}

          {/* ── LAYER 1: Delay heat band ─────────────────────────────────────── */}
          <g clipPath="url(#ts-clip)">
            {trajectories.filter((t) => t.delay > 5).map(({ train, pNow, pFuture }) => (
              <rect
                key={`heat-${train.id}`}
                x={nowX}
                y={Math.min(pNow.y, pFuture.y) - 5}
                width={Math.max(0, pFuture.x - nowX)}
                height={Math.abs(pFuture.y - pNow.y) + 10}
                fill="url(#delay-grad)"
                rx={2}
                opacity={Math.min(0.9, (train.current_delay_min - 5) / 25)}
              />
            ))}
          </g>

          {/* ── LAYER 2: Train trajectories (actual + forecast) ─────────────── */}
          <g clipPath="url(#ts-clip)">
            {sortedTraj.map(({ train, color, forecastColor, pPast, pNow, pFuture, delay }) => {
              const isSelected = train.id === selectedTrainId
              const isHovered  = train.id === hoveredTrainId
              const isActive   = isSelected || isHovered
              const hasFocus   = activeTrainId !== null
              const opacity    = !hasFocus ? 1 : isActive ? 1 : 0.18

              const strokeActual  = isSelected ? 3.2 : isHovered ? 2.4 : 1.6
              const strokeFcast   = isSelected ? 2.4 : isHovered ? 1.8 : 1.2
              const dotR          = isSelected ? 4.5 : isHovered ? 3.5 : 2.8

              const actualD   = `M${pPast.x.toFixed(1)},${pPast.y.toFixed(1)} L${pNow.x.toFixed(1)},${pNow.y.toFixed(1)}`
              const forecastD = `M${pNow.x.toFixed(1)},${pNow.y.toFixed(1)} L${pFuture.x.toFixed(1)},${pFuture.y.toFixed(1)}`

              const slot = getLabelSlot(train.id)

              return (
                <g
                  key={train.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleTrainClick(train.id)}
                  onMouseEnter={() => setHoveredTrainId(train.id)}
                  onMouseLeave={() => setHoveredTrainId(null)}
                >
                  {/* Hit area */}
                  <path d={`${actualD} ${forecastD}`} fill="none" stroke="transparent" strokeWidth={14} />

                  {/* Selected glow underlay */}
                  {isSelected && (
                    <>
                      <path d={actualD}   fill="none" stroke={color}        strokeWidth={7} opacity={0.12} filter="url(#ts-glow-sel)" />
                      <path d={forecastD} fill="none" stroke={forecastColor} strokeWidth={7} opacity={0.12} filter="url(#ts-glow-sel)" />
                    </>
                  )}

                  {/* Actual path — solid */}
                  <path
                    d={actualD}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeActual}
                    opacity={opacity}
                    strokeLinecap="round"
                  />

                  {/* Forecast path — dashed, 40% base opacity for non-selected */}
                  <path
                    d={forecastD}
                    fill="none"
                    stroke={forecastColor}
                    strokeWidth={strokeFcast}
                    opacity={isActive ? 0.85 : opacity * 0.4}
                    strokeDasharray="6 5"
                    strokeLinecap="round"
                  />

                  {/* NOW dot */}
                  <circle
                    cx={pNow.x} cy={pNow.y} r={dotR}
                    fill={color}
                    opacity={isActive ? 1 : opacity * 0.85}
                  />

                  {/* Labels — only selected or hovered */}
                  {isActive && slot && slot.lx > 0 && (
                    <>
                      {/* Train ID label */}
                      <text
                        x={slot.lx} y={slot.ly}
                        fontSize={isSelected ? 8.5 : 7.5}
                        fill={color}
                        fontFamily="IBM Plex Mono, monospace"
                        fontWeight="700"
                        style={{ pointerEvents: 'none' }}
                      >
                        {train.id}
                      </text>
                      {/* Speed label */}
                      <text
                        x={slot.lx} y={slot.ly + 9}
                        fontSize={6}
                        fill="var(--text-muted)"
                        fontFamily="IBM Plex Mono, monospace"
                        style={{ pointerEvents: 'none' }}
                      >
                        {train.speed_kmh.toFixed(0)} km/h
                      </text>
                      {/* Delay badge */}
                      {delay > 2 && (
                        <text
                          x={slot.lx} y={slot.ly + 18}
                          fontSize={6}
                          fill={forecastColor}
                          fontFamily="IBM Plex Mono, monospace"
                          style={{ pointerEvents: 'none' }}
                        >
                          +{delay.toFixed(0)}m delay
                        </text>
                      )}
                    </>
                  )}
                </g>
              )
            })}
          </g>

          {/* ── LAYER 3: Crossing nodes (replace diamonds) ──────────────────── */}
          <g clipPath="url(#ts-clip)">
            {crossings.map(({ pt, trainA, trainB }, i) => {
              const isRelated = activeTrainId === trainA || activeTrainId === trainB
              const crossingTimeMs = timeStart + ((pt.x - PAD.left) / chartW) * windowMs
              const minsFromNow = ((crossingTimeMs - now) / 60000).toFixed(0)
              const label = `×${parseInt(minsFromNow) > 0 ? '+' : ''}${minsFromNow}m`
              return (
                <g key={`cross-${i}`} opacity={isRelated ? 1 : 0.35}>
                  {/* Outer ring */}
                  <circle
                    cx={pt.x} cy={pt.y} r={5}
                    fill="none"
                    stroke="#FFB547"
                    strokeWidth={1.2}
                    filter={isRelated ? 'url(#ts-glow-cross)' : undefined}
                  />
                  {/* Center dot */}
                  <circle cx={pt.x} cy={pt.y} r={2} fill="#FFB547" />
                  {/* Crossing time label — only when related */}
                  {isRelated && (
                    <text
                      x={pt.x} y={pt.y - 8}
                      textAnchor="middle"
                      fontSize={6}
                      fill="#FFB547"
                      fontFamily="IBM Plex Mono, monospace"
                      style={{ pointerEvents: 'none' }}
                    >
                      {label}
                    </text>
                  )}
                </g>
              )
            })}
          </g>

          {/* ── LAYER 4: Conflict markers ────────────────────────────────────── */}
          {conflictMarkers.map(({ conflict, x, y, tier, r, color }) => {
            const isHov = hoveredConflictId === conflict.id
            return (
              <g
                key={conflict.id}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredConflictId(conflict.id)}
                onMouseLeave={() => setHoveredConflictId(null)}
              >
                {/* Hit area */}
                <circle cx={x} cy={y} r={r + 8} fill="transparent" />

                {/* Glow — hover only */}
                {isHov && (
                  <circle
                    cx={x} cy={y} r={r + 4}
                    fill="none" stroke={color}
                    strokeWidth={6} opacity={0.25}
                    filter="url(#ts-glow-conflict)"
                  />
                )}

                {/* Outer ring */}
                <circle
                  cx={x} cy={y} r={r}
                  fill={`${color}22`}
                  stroke={color}
                  strokeWidth={tier === 'critical' ? 1.8 : 1.2}
                  opacity={isHov ? 1 : 0.75}
                />

                {/* Inner marker */}
                {tier === 'critical' ? (
                  <>
                    <line x1={x - r * 0.45} y1={y - r * 0.45} x2={x + r * 0.45} y2={y + r * 0.45}
                      stroke={color} strokeWidth={1.8} />
                    <line x1={x + r * 0.45} y1={y - r * 0.45} x2={x - r * 0.45} y2={y + r * 0.45}
                      stroke={color} strokeWidth={1.8} />
                  </>
                ) : tier === 'major' ? (
                  <circle cx={x} cy={y} r={r * 0.38} fill={color} />
                ) : (
                  <circle cx={x} cy={y} r={r * 0.5} fill={color} opacity={0.7} />
                )}

                {/* Hover tooltip */}
                {isHov && (
                  <g>
                    <rect
                      x={x + r + 4} y={y - 18}
                      width={62} height={22}
                      rx={3}
                      fill="var(--surface-2)"
                      stroke={color}
                      strokeWidth={0.8}
                      opacity={0.95}
                    />
                    <text
                      x={x + r + 7} y={y - 8}
                      fontSize={6.5}
                      fill={color}
                      fontFamily="IBM Plex Mono, monospace"
                      fontWeight="700"
                    >
                      {tier.toUpperCase()} T−{conflict.time_to_conflict_min.toFixed(0)}m
                    </text>
                    <text
                      x={x + r + 7} y={y + 1}
                      fontSize={5.5}
                      fill="var(--text-muted)"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {conflict.block_section}
                    </text>
                  </g>
                )}

                {/* Static time label (only critical) */}
                {tier === 'critical' && !isHov && (
                  <text
                    x={x} y={y - r - 4}
                    textAnchor="middle"
                    fontSize={6}
                    fill={color}
                    fontFamily="IBM Plex Mono, monospace"
                    opacity={0.8}
                  >
                    T−{conflict.time_to_conflict_min.toFixed(0)}m
                  </text>
                )}
              </g>
            )
          })}

          {/* ── Empty state ─────────────────────────────────────────────────── */}
          {trainList.length === 0 && (
            <text
              x={W / 2} y={H / 2}
              textAnchor="middle" fontSize={11}
              fill="var(--text-muted)"
              fontFamily="Inter, sans-serif"
            >
              No trains active — start a simulation
            </text>
          )}

          {/* ── Legend ─────────────────────────────────────────────────────── */}
          <g transform={`translate(${PAD.left}, ${H - PAD.bottom + 26})`}>
            {[
              { color: 'var(--secondary)', dash: '',     label: 'Actual', symbol: 'line' },
              { color: 'var(--secondary)', dash: '5 4',  label: 'Forecast', symbol: 'line' },
              { color: '#FFB547',          dash: '',     label: 'Crossing', symbol: 'cross' },
              { color: '#60a5fa',          dash: '',     label: 'Minor', symbol: 'circle-sm' },
              { color: '#FFB547',          dash: '',     label: 'Major', symbol: 'circle-md' },
              { color: '#FF5757',          dash: '',     label: 'Critical', symbol: 'circle-lg' },
            ].map(({ color, dash, label, symbol }, i) => (
              <g key={label} transform={`translate(${i * 84}, 0)`}>
                {symbol === 'line' ? (
                  <line x1={0} y1={0} x2={12} y2={0} stroke={color} strokeWidth={dash ? 1.5 : 2} strokeDasharray={dash} opacity={0.8} />
                ) : symbol === 'cross' ? (
                  <g>
                    <circle cx={6} cy={0} r={4} fill="none" stroke={color} strokeWidth={1} opacity={0.8} />
                    <circle cx={6} cy={0} r={1.5} fill={color} opacity={0.8} />
                  </g>
                ) : symbol === 'circle-sm' ? (
                  <circle cx={6} cy={0} r={4}  fill={`${color}22`} stroke={color} strokeWidth={1} opacity={0.8} />
                ) : symbol === 'circle-md' ? (
                  <circle cx={6} cy={0} r={6}  fill={`${color}22`} stroke={color} strokeWidth={1.2} opacity={0.8} />
                ) : (
                  <circle cx={6} cy={0} r={9}  fill={`${color}22`} stroke={color} strokeWidth={1.8} opacity={0.8} />
                )}
                <text x={symbol === 'line' ? 16 : 14} y={4} fontSize={6.5} fill="var(--text-muted)" fontFamily="IBM Plex Mono, monospace">
                  {label}
                </text>
              </g>
            ))}
          </g>

          {/* Hint text */}
          <text
            x={W - PAD.right} y={H - PAD.bottom + 30}
            textAnchor="end" fontSize={6}
            fill="var(--text-muted)" fontFamily="Inter, sans-serif" opacity={0.5}
          >
            Click train to select · Hover for details
          </text>
        </svg>
      </div>
    </div>
  )
}