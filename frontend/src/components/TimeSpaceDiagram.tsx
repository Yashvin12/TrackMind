/**
 * TimeSpaceDiagram — Stringline Diagram
 * ======================================
 * Shows train trajectories on a km (Y) vs time (X) canvas.
 *
 * Each train has:
 *  - Solid line  : actual path (past 15 min → NOW)
 *  - Dashed line : forecast path (NOW → +45 min)
 *  - Delay coloring: yellow/red forecast if delay is high
 *
 * Special overlays:
 *  - Conflict markers at the predicted conflict position/time
 *  - Crossing diamonds where two train paths intersect
 *  - Delay propagation heat shading on conflicted forecast segments
 */

import { useMemo } from 'react'
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

// ── Line-segment intersection ────────────────────────────────────────────────
interface Point { x: number; y: number }

function lineIntersect(
  p1: Point, p2: Point,
  p3: Point, p4: Point
): Point | null {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-10) return null
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: p1.x + t * d1x, y: p1.y + t * d1y }
}

export function TimeSpaceDiagram({ trains, conflicts, stations }: Props) {
  const trainList = Object.values(trains)

  const W = 760
  const H = 400
  const PAD = { left: 96, right: 24, top: 28, bottom: 44 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const stationKms = useMemo(() => stations.map((s) => STATION_KM[s] ?? 0), [stations])
  const maxKm = Math.max(...stationKms, 1)

  const kmToY = (km: number) => PAD.top + (km / maxKm) * chartH

  // Time window: NOW ± context
  const now = Date.now()
  const pastMs = 15 * 60 * 1000
  const futureMs = 60 * 60 * 1000
  const windowMs = pastMs + futureMs
  const timeStart = now - pastMs
  const timeToX = (t: number) => PAD.left + ((t - timeStart) / windowMs) * chartW
  const nowX = timeToX(now)

  // Build train trajectory point arrays
  const trajectories = useMemo(() => {
    return trainList
      .filter((t) => t.km_position !== undefined || STATION_KM[t.current_location] !== undefined)
      .map((train) => {
        const km = train.km_position ?? STATION_KM[train.current_location] ?? 0
        const color = TRAIN_TYPE_COLORS[train.type] ?? '#94a3b8'
        const speedKmMin = train.speed_kmh / 60
        const delay = train.current_delay_min

        // Past point (15 min ago)
        const pastKm = Math.max(0, km - speedKmMin * 15)
        // Future point (+60 min)
        const futureKm = Math.min(maxKm, km + speedKmMin * 60)
        const futureKmDelayed = Math.min(maxKm, km + speedKmMin * 45) // shorter if delayed

        const pNow   : Point = { x: nowX,                           y: kmToY(km) }
        const pPast  : Point = { x: timeToX(now - 15 * 60 * 1000),  y: kmToY(pastKm) }
        const pFuture: Point = { x: timeToX(now + 60 * 60 * 1000),  y: kmToY(delay > 10 ? futureKmDelayed : futureKm) }

        // Forecast color based on delay
        const forecastColor = delay > 15 ? '#FF5757' : delay > 5 ? '#FFB547' : color

        return { train, color, forecastColor, pPast, pNow, pFuture, delay }
      })
  }, [trainList, now, maxKm, nowX])

  // Find crossings between all pairs of forecast segments
  const crossings = useMemo(() => {
    const points: Point[] = []
    for (let i = 0; i < trajectories.length; i++) {
      for (let j = i + 1; j < trajectories.length; j++) {
        const a = trajectories[i]
        const b = trajectories[j]
        // Check all segment pair combinations
        const segs = [
          [a.pPast, a.pNow, b.pPast, b.pNow],
          [a.pPast, a.pNow, b.pNow, b.pFuture],
          [a.pNow, a.pFuture, b.pPast, b.pNow],
          [a.pNow, a.pFuture, b.pNow, b.pFuture],
        ] as const
        for (const [p1, p2, p3, p4] of segs) {
          const pt = lineIntersect(p1, p2, p3, p4)
          if (pt && pt.x >= PAD.left && pt.x <= W - PAD.right) {
            points.push(pt)
          }
        }
      }
    }
    return points
  }, [trajectories])

  // Conflict markers
  const conflictMarkers = useMemo(() => {
    return conflicts
      .filter((c) => !c.resolved)
      .map((c) => {
        const parts = c.block_section.replace('BLK_', '').split('_')
        const fromKm = STATION_KM[parts[0]] ?? 0
        const toKm   = STATION_KM[parts[1]] ?? fromKm + 50
        const midKm  = (fromKm + toKm) / 2
        const conflictTimeMs = now + c.time_to_conflict_min * 60 * 1000
        return { conflict: c, x: timeToX(conflictTimeMs), y: kmToY(midKm) }
      })
      .filter((m) => m.x >= PAD.left && m.x <= W - PAD.right)
  }, [conflicts, now])

  // Time axis labels
  const timeLabels = [-15, 0, 15, 30, 45, 60].map((offset) => ({
    label: offset === 0 ? 'NOW' : `${offset > 0 ? '+' : ''}${offset}m`,
    x: timeToX(now + offset * 60 * 1000),
    isNow: offset === 0,
  }))

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
            Time-Space Diagram
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Stringline — actual&nbsp;
            <span style={{ borderBottom: '2px solid var(--secondary)', paddingBottom: 1 }}>────</span>
            &nbsp;forecast&nbsp;
            <span style={{ borderBottom: '2px dashed var(--secondary)', paddingBottom: 1 }}>- - -</span>
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {conflicts.filter((c) => !c.resolved).length > 0 && (
            <span
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--danger)18', border: '1px solid var(--danger)44', color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}
            >
              {conflicts.filter((c) => !c.resolved).length} conflicts
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
        </div>
      </div>

      {/* SVG Stringline */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ minWidth: 560, display: 'block' }}
          role="img"
          aria-label="Time-space diagram showing train trajectories"
        >
          <defs>
            <filter id="ts-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {/* Delay propagation gradient */}
            <linearGradient id="delay-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFB547" stopOpacity="0" />
              <stop offset="60%" stopColor="#FF5757" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#FF5757" stopOpacity="0.25" />
            </linearGradient>
          </defs>

          {/* Chart area background */}
          <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} fill="var(--bg-surface)" rx={4} />

          {/* Past-area shading */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={nowX - PAD.left}
            height={chartH}
            fill="rgba(14,22,48,0.5)"
            rx={2}
          />

          {/* Station horizontal grid lines */}
          {stations.map((s, i) => {
            const km = stationKms[i]
            const y  = kmToY(km)
            return (
              <g key={s}>
                <line
                  x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <text
                  x={PAD.left - 6} y={y + 4}
                  textAnchor="end"
                  fontSize={8.5}
                  fill="var(--secondary)"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="600"
                >
                  {s}
                </text>
                <text
                  x={PAD.left - 6} y={y + 15}
                  textAnchor="end"
                  fontSize={6}
                  fill="var(--text-muted)"
                  fontFamily="Inter, sans-serif"
                >
                  {STATION_FULL[s] ?? s}
                </text>
              </g>
            )
          })}

          {/* Time vertical lines */}
          {timeLabels.map(({ label, x, isNow }) => {
            if (x < PAD.left || x > W - PAD.right) return null
            return (
              <g key={label}>
                <line
                  x1={x} y1={PAD.top} x2={x} y2={H - PAD.bottom}
                  stroke={isNow ? 'var(--accent)' : 'var(--border)'}
                  strokeWidth={isNow ? 2 : 1}
                  strokeDasharray={isNow ? undefined : '4 4'}
                  opacity={isNow ? 0.9 : 0.5}
                />
                <text
                  x={x} y={H - PAD.bottom + 14}
                  textAnchor="middle"
                  fontSize={8}
                  fill={isNow ? 'var(--accent)' : 'var(--text-muted)'}
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight={isNow ? '700' : '400'}
                >
                  {label}
                </text>
              </g>
            )
          })}

          {/* Delay propagation heat band (forecast area for delayed trains) */}
          {trajectories.filter((t) => t.delay > 5).map(({ train, pNow, pFuture }) => (
            <rect
              key={`heat-${train.id}`}
              x={nowX}
              y={Math.min(pNow.y, pFuture.y) - 6}
              width={Math.max(0, pFuture.x - nowX)}
              height={Math.abs(pFuture.y - pNow.y) + 12}
              fill="url(#delay-gradient)"
              rx={3}
              opacity={Math.min(1, (train.current_delay_min - 5) / 20)}
            />
          ))}

          {/* Train trajectories */}
          {trajectories.map(({ train, color, forecastColor, pPast, pNow, pFuture, delay }) => {
            const actualD  = `M${pPast.x.toFixed(1)},${pPast.y.toFixed(1)} L${pNow.x.toFixed(1)},${pNow.y.toFixed(1)}`
            const forecastD = `M${pNow.x.toFixed(1)},${pNow.y.toFixed(1)} L${pFuture.x.toFixed(1)},${pFuture.y.toFixed(1)}`

            return (
              <g key={train.id}>
                {/* Glow for high-delay trains */}
                {delay > 10 && (
                  <path
                    d={forecastD}
                    fill="none"
                    stroke={forecastColor}
                    strokeWidth={5}
                    opacity={0.12}
                    filter="url(#ts-glow)"
                  />
                )}

                {/* Actual path — solid */}
                <path
                  d={actualD}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.8}
                  opacity={0.9}
                  strokeLinecap="round"
                />

                {/* Forecast path — dashed, delay-colored */}
                <path
                  d={forecastD}
                  fill="none"
                  stroke={forecastColor}
                  strokeWidth={1.5}
                  opacity={0.75}
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                />

                {/* NOW dot */}
                <circle cx={pNow.x} cy={pNow.y} r={3.5} fill={color} opacity={0.95} />

                {/* Train ID label */}
                <text
                  x={pNow.x + 6}
                  y={pNow.y - 5}
                  fontSize={7}
                  fill={color}
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="600"
                >
                  {train.id}
                </text>

                {/* Delay badge on forecast */}
                {delay > 2 && (
                  <text
                    x={(pNow.x + pFuture.x) / 2}
                    y={pNow.y - 10}
                    textAnchor="middle"
                    fontSize={6.5}
                    fill={forecastColor}
                    fontFamily="IBM Plex Mono, monospace"
                    opacity={0.8}
                  >
                    +{delay.toFixed(0)}m
                  </text>
                )}
              </g>
            )
          })}

          {/* Crossing diamonds */}
          {crossings.map((pt, i) => (
            <g key={`cross-${i}`} filter="url(#ts-glow)">
              <polygon
                points={`${pt.x},${pt.y - 7} ${pt.x + 7},${pt.y} ${pt.x},${pt.y + 7} ${pt.x - 7},${pt.y}`}
                fill="none"
                stroke="#FFB547"
                strokeWidth={1.5}
                opacity={0.7}
              />
              <circle cx={pt.x} cy={pt.y} r={1.5} fill="#FFB547" opacity={0.9} />
            </g>
          ))}

          {/* Conflict markers */}
          {conflictMarkers.map(({ conflict, x, y }) => (
            <g key={conflict.id} filter="url(#ts-glow)">
              <circle cx={x} cy={y} r={9} fill="none" stroke="#FF5757" strokeWidth={1.5} opacity={0.5} />
              <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke="#FF5757" strokeWidth={1.8} />
              <line x1={x + 5} y1={y - 5} x2={x - 5} y2={y + 5} stroke="#FF5757" strokeWidth={1.8} />
              <text
                x={x} y={y - 13}
                textAnchor="middle"
                fontSize={7}
                fill="#FF5757"
                fontFamily="IBM Plex Mono, monospace"
              >
                T-{conflict.time_to_conflict_min.toFixed(0)}m
              </text>
            </g>
          ))}

          {/* Empty state */}
          {trainList.length === 0 && (
            <text
              x={W / 2} y={H / 2}
              textAnchor="middle"
              fontSize={11}
              fill="var(--text-muted)"
              fontFamily="Inter, sans-serif"
            >
              No trains active — start a simulation
            </text>
          )}

          {/* Legend */}
          <g transform={`translate(${PAD.left}, ${H - PAD.bottom + 26})`}>
            {[
              { color: 'var(--secondary)', dash: '',     label: 'Actual path' },
              { color: 'var(--secondary)', dash: '5 4',  label: 'Forecast' },
              { color: '#FFB547',          dash: '',     label: 'Crossing' },
              { color: '#FF5757',          dash: '',     label: 'Conflict' },
            ].map(({ color, dash, label }, i) => (
              <g key={label} transform={`translate(${i * 110}, 0)`}>
                {label === 'Crossing' ? (
                  <polygon
                    points="5,-4 9,0 5,4 1,0"
                    fill="none"
                    stroke={color}
                    strokeWidth={1.2}
                    opacity={0.8}
                  />
                ) : (
                  <line x1={0} y1={0} x2={14} y2={0} stroke={color} strokeWidth={dash ? 1.5 : 2} strokeDasharray={dash} opacity={0.8} />
                )}
                <text x={label === 'Crossing' ? 14 : 18} y={4} fontSize={7} fill="var(--text-muted)" fontFamily="IBM Plex Mono, monospace">
                  {label}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}