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

export function TimeSpaceDiagram({ trains, conflicts, stations }: Props) {
  const trainList = Object.values(trains)

  const W = 720
  const H = 360
  const PAD = { left: 90, right: 20, top: 24, bottom: 40 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  // Use known km positions or evenly space if not known
  const stationKms = useMemo(() => {
    return stations.map((s) => STATION_KM[s] ?? 0)
  }, [stations])

  const maxKm = Math.max(...stationKms, 1)

  const kmToY = (km: number) => PAD.top + (km / maxKm) * chartH

  // Time window: 90 minutes centered on now
  const now = Date.now()
  const windowMs = 90 * 60 * 1000
  const timeStart = now - 5 * 60 * 1000
  const timeToX = (t: number) => PAD.left + ((t - timeStart) / windowMs) * chartW

  // Build train trajectory segments
  const trajectories = useMemo(() => {
    return trainList
      .filter((t) => t.km_position !== undefined || STATION_KM[t.current_location] !== undefined)
      .map((train) => {
        const km = train.km_position ?? STATION_KM[train.current_location] ?? 0
        const color = TRAIN_TYPE_COLORS[train.type] ?? '#94a3b8'
        const x = timeToX(now)
        const y = kmToY(km)
        // Estimate past and future positions based on speed
        const speedKmMin = train.speed_kmh / 60
        const pastKm = Math.max(0, km - speedKmMin * 15)
        const futureKm = Math.min(maxKm, km + speedKmMin * 45)

        return {
          train,
          color,
          points: [
            { x: timeToX(now - 15 * 60 * 1000), y: kmToY(pastKm) },
            { x, y },
            { x: timeToX(now + 45 * 60 * 1000), y: kmToY(futureKm) },
          ],
        }
      })
  }, [trainList, now, maxKm])

  // Conflict markers
  const conflictMarkers = useMemo(() => {
    return conflicts
      .filter((c) => !c.resolved)
      .map((c) => {
        const blockId = c.block_section
        // Try to find km from block name
        const parts = blockId.replace('BLK_', '').split('_')
        const fromKm = STATION_KM[parts[0]] ?? 0
        const toKm   = STATION_KM[parts[1]] ?? fromKm + 50
        const midKm  = (fromKm + toKm) / 2
        const conflictTimeMs = now + c.time_to_conflict_min * 60 * 1000
        return {
          conflict: c,
          x: timeToX(conflictTimeMs),
          y: kmToY(midKm),
        }
      })
      .filter((m) => m.x >= PAD.left && m.x <= W - PAD.right)
  }, [conflicts, now])

  // Time labels
  const timeLabels = [-15, 0, 15, 30, 45, 60].map((offsetMin) => ({
    label: offsetMin === 0 ? 'NOW' : `${offsetMin > 0 ? '+' : ''}${offsetMin}m`,
    x: timeToX(now + offsetMin * 60 * 1000),
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
          <h2
            className="font-heading font-semibold text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            Time-Space Diagram
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Train trajectories &bull; Next 60 min
          </p>
        </div>
        <div className="flex gap-2">
          {conflicts.filter((c) => !c.resolved).length > 0 && (
            <span
              className="text-xs px-2 py-1 rounded"
              style={{
                background: 'var(--danger)18',
                border: '1px solid var(--danger)44',
                color: 'var(--danger)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {conflicts.filter((c) => !c.resolved).length} conflicts
            </span>
          )}
        </div>
      </div>

      {/* SVG */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ minWidth: 500, display: 'block' }}
          role="img"
          aria-label="Time-space diagram showing train trajectories"
        >
          <defs>
            <filter id="ts-glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={chartW}
            height={chartH}
            fill="var(--bg-surface)"
            rx={4}
          />

          {/* Station grid lines */}
          {stations.map((s, i) => {
            const km = stationKms[i]
            const y  = kmToY(km)
            return (
              <g key={s}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={W - PAD.right}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                {/* Station label */}
                <text
                  x={PAD.left - 6}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={8}
                  fill="var(--secondary)"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="600"
                >
                  {s}
                </text>
                <text
                  x={PAD.left - 6}
                  y={y + 14}
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
          {timeLabels.map(({ label, x }) => {
            if (x < PAD.left || x > W - PAD.right) return null
            const isNow = label === 'NOW'
            return (
              <g key={label}>
                <line
                  x1={x}
                  y1={PAD.top}
                  x2={x}
                  y2={H - PAD.bottom}
                  stroke={isNow ? 'var(--accent)' : 'var(--border)'}
                  strokeWidth={isNow ? 1.5 : 1}
                  strokeDasharray={isNow ? undefined : '4 4'}
                  opacity={isNow ? 0.8 : 0.5}
                />
                <text
                  x={x}
                  y={H - PAD.bottom + 14}
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

          {/* Train trajectories */}
          {trajectories.map(({ train, color, points }) => {
            const d = points
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(' ')

            return (
              <g key={train.id}>
                {/* Shadow/glow for high-delay trains */}
                {train.current_delay_min > 10 && (
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={4}
                    opacity={0.15}
                    filter="url(#ts-glow)"
                  />
                )}
                {/* Main line */}
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  opacity={0.85}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Current position dot */}
                <circle
                  cx={points[1].x}
                  cy={points[1].y}
                  r={3.5}
                  fill={color}
                  opacity={0.95}
                />
                {/* Train ID label */}
                <text
                  x={points[1].x + 5}
                  y={points[1].y - 5}
                  fontSize={7}
                  fill={color}
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="600"
                >
                  {train.id}
                </text>
              </g>
            )
          })}

          {/* Conflict markers */}
          {conflictMarkers.map(({ conflict, x, y }) => (
            <g key={conflict.id} filter="url(#ts-glow)">
              <circle cx={x} cy={y} r={8} fill="none" stroke="#ef4444" strokeWidth={1} opacity={0.4} />
              <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke="#ef4444" strokeWidth={1.5} />
              <line x1={x + 5} y1={y - 5} x2={x - 5} y2={y + 5} stroke="#ef4444" strokeWidth={1.5} />
              <text
                x={x}
                y={y - 12}
                textAnchor="middle"
                fontSize={7}
                fill="#ef4444"
                fontFamily="IBM Plex Mono, monospace"
              >
                T-{conflict.time_to_conflict_min.toFixed(0)}m
              </text>
            </g>
          ))}

          {/* Empty state */}
          {trainList.length === 0 && (
            <text
              x={W / 2}
              y={H / 2}
              textAnchor="middle"
              fontSize={11}
              fill="var(--text-muted)"
              fontFamily="Inter, sans-serif"
            >
              No trains active — start a simulation
            </text>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div
        className="flex flex-wrap gap-4 px-4 py-3 border-t text-xs"
        style={{ borderColor: 'var(--border)' }}
      >
        {(['rajdhani', 'express', 'passenger', 'freight'] as const).map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded" style={{ background: TRAIN_TYPE_COLORS[type] }} />
            <span style={{ color: 'var(--text-muted)' }} className="capitalize">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444', opacity: 0.6 }} />
          <span style={{ color: 'var(--text-muted)' }}>Conflict</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded" style={{ background: 'var(--accent)', opacity: 0.6 }} />
          <span style={{ color: 'var(--text-muted)' }}>Now line</span>
        </div>
      </div>
    </div>
  )
}