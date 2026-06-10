import { useMemo } from 'react'
import { Train, TRAIN_TYPE_COLORS } from '../types/train'
import { Conflict } from '../types/conflict'

interface Props {
  trains: Record<string, Train>
  conflicts: Conflict[]
  stations: string[]
}

// We render a simple SVG-based time-space diagram in Phase 1
// Full Plotly implementation comes in Phase 8
export function TimeSpaceDiagram({ trains, conflicts, stations }: Props) {
  const trainList = Object.values(trains)
  const conflictBlocks = new Set(conflicts.map((c) => c.block_section))

  const stationIndex = useMemo(
    () => Object.fromEntries(stations.map((s, i) => [s, i])),
    [stations]
  )

  const W = 640
  const H = 300
  const PAD = { left: 80, right: 20, top: 20, bottom: 32 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const stationY = (name: string) => {
    const idx = stationIndex[name] ?? 0
    return PAD.top + (idx / Math.max(stations.length - 1, 1)) * chartH
  }

  // Simple time window: now to now + 90 min
  const now = Date.now()
  const windowMs = 90 * 60 * 1000
  const timeToX = (t: number) => PAD.left + ((t - now) / windowMs) * chartW

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-200 text-sm">Time–Space Diagram</h2>
        <span className="text-xs text-slate-500">Next 90 min</span>
      </div>

      <div className="overflow-x-auto">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="rounded-lg bg-slate-900/80"
          style={{ fontFamily: 'monospace' }}
        >
          {/* Station grid lines */}
          {stations.map((stn) => {
            const y = stationY(stn)
            return (
              <g key={stn}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={W - PAD.right}
                  y2={y}
                  stroke="#334155"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <text
                  x={PAD.left - 6}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={9}
                  fill="#64748b"
                >
                  {stn.replace('Stn_', '')}
                </text>
              </g>
            )
          })}

          {/* Time axis ticks */}
          {Array.from({ length: 7 }).map((_, i) => {
            const t = now + (i * 15 * 60 * 1000)
            const x = timeToX(t)
            const label = `+${i * 15}m`
            return (
              <g key={i}>
                <line x1={x} y1={PAD.top} x2={x} y2={H - PAD.bottom} stroke="#1e293b" strokeWidth={1} />
                <text x={x} y={H - PAD.bottom + 12} textAnchor="middle" fontSize={9} fill="#475569">
                  {label}
                </text>
              </g>
            )
          })}

          {/* Train paths */}
          {trainList.map((train) => {
            const color = TRAIN_TYPE_COLORS[train.type]
            const path = train.scheduled_path.filter((p) => stations.includes(p))

            if (path.length < 2) return null

            // Estimate arrival time at each station
            const points = path.map((stn, idx) => {
              const estimatedArrival = now + idx * (20 * 60 * 1000)
              return {
                x: timeToX(estimatedArrival),
                y: stationY(stn),
              }
            })

            const pathD = points
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`)
              .join(' ')

            return (
              <g key={train.id}>
                <path
                  d={pathD}
                  stroke={color}
                  strokeWidth={2}
                  fill="none"
                  opacity={0.8}
                  strokeLinecap="round"
                />
                <text
                  x={points[0].x + 4}
                  y={points[0].y - 4}
                  fontSize={8}
                  fill={color}
                  opacity={0.9}
                >
                  {train.id}
                </text>
              </g>
            )
          })}

          {/* Conflict markers */}
          {conflicts.map((conflict) => {
            const x = timeToX(now + conflict.time_to_conflict_min * 60 * 1000)
            const y = H / 2
            return (
              <g key={conflict.id}>
                <circle cx={x} cy={y} r={6} fill="#ef4444" opacity={0.6} />
                <line
                  x1={x - 5}
                  y1={y - 5}
                  x2={x + 5}
                  y2={y + 5}
                  stroke="#fca5a5"
                  strokeWidth={2}
                />
                <line
                  x1={x + 5}
                  y1={y - 5}
                  x2={x - 5}
                  y2={y + 5}
                  stroke="#fca5a5"
                  strokeWidth={2}
                />
              </g>
            )
          })}

          {/* Now line */}
          <line
            x1={PAD.left}
            y1={PAD.top}
            x2={PAD.left}
            y2={H - PAD.bottom}
            stroke="#6366f1"
            strokeWidth={2}
            strokeDasharray="6 3"
          />
          <text x={PAD.left + 4} y={PAD.top + 10} fontSize={9} fill="#818cf8">
            NOW
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 text-xs">
        {(['rajdhani', 'express', 'passenger', 'freight'] as const).map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className="w-4 h-0.5 rounded"
              style={{ backgroundColor: TRAIN_TYPE_COLORS[type] }}
            />
            <span className="text-slate-400 capitalize">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/60" />
          <span className="text-slate-400">Conflict</span>
        </div>
      </div>
    </div>
  )
}
