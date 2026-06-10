import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { KPIDashboard } from './components/KPIDashboard'
import { ConflictAlert } from './components/ConflictAlert'
import { RecommendationCards } from './components/RecommendationCards'
import { ControllerButtons } from './components/ControllerButtons'
import { TimeSpaceDiagram } from './components/TimeSpaceDiagram'
import { useSimulation } from './hooks/useSimulation'
import { useOptimizer } from './hooks/useOptimizer'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore } from './services/store'
import { healthAPI } from './services/api'
import { KPIMetrics } from './types/api'
import clsx from 'clsx'

const DEMO_KPIS: KPIMetrics = {
  total_trains: 12,
  active_conflicts: 0,
  avg_delay_min: 4.2,
  throughput_pct: 96.1,
  recommendations_accepted: 3,
  recommendations_overridden: 1,
  delay_reduction_pct: 34,
}

export default function App() {
  const { state, running, start, reset, isStarting, isResetting } = useSimulation()
  const { accept, override } = useOptimizer()
  const { connected: wsConnected, subscribe } = useWebSocket('/ws/live')

  const {
    trains,
    conflicts,
    activeRecommendation,
    stations,
    kpis,
    setTrains,
    setConflicts,
    setSimulationState,
    setWsConnected,
    setKpis,
  } = useStore()

  // Health check
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthAPI.check().then((r) => r.data),
    refetchInterval: 30_000,
  })

  // Subscribe to WebSocket updates
  useEffect(() => {
    const off = subscribe('state_update', (msg) => {
      const payload = msg.payload as {
        trains?: typeof trains
        conflicts?: typeof conflicts
        state?: typeof state
      }
      if (payload.trains) setTrains(payload.trains)
      if (payload.conflicts) setConflicts(payload.conflicts)
      if (payload.state) setSimulationState(payload.state)
    })
    return off
  }, [subscribe, setTrains, setConflicts, setSimulationState])

  // Sync WS connected state
  useEffect(() => {
    setWsConnected(wsConnected)
  }, [wsConnected, setWsConnected])

  // Seed demo KPIs
  useEffect(() => {
    setKpis(DEMO_KPIS)
  }, [setKpis])

  // Sync state from polling
  useEffect(() => {
    if (state?.trains) setTrains(state.trains)
    if (state?.active_conflicts) setConflicts(state.active_conflicts)
  }, [state, setTrains, setConflicts])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-100">TrackMind</h1>
              <p className="text-xs text-slate-500">Railway Traffic Controller Decision Support</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* API status */}
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={clsx(
                  'w-1.5 h-1.5 rounded-full',
                  health?.status === 'ok' ? 'bg-emerald-400' : 'bg-red-400'
                )}
              />
              <span className="text-slate-500">API</span>
            </div>

            {/* WS status */}
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={clsx(
                  'w-1.5 h-1.5 rounded-full',
                  wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                )}
              />
              <span className="text-slate-500">Live</span>
            </div>

            <span className="text-xs font-mono text-slate-600">v{health?.version ?? '—'}</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-screen-2xl mx-auto px-4 py-5 flex flex-col gap-5">
        {/* KPI row */}
        <motion.section
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <KPIDashboard metrics={kpis} />
        </motion.section>

        {/* Main grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Left: diagram + conflicts */}
          <div className="xl:col-span-2 flex flex-col gap-5">
            <TimeSpaceDiagram trains={trains} conflicts={conflicts} stations={stations} />
            <ConflictAlert conflicts={conflicts} />
          </div>

          {/* Right: controls + recommendations */}
          <div className="flex flex-col gap-5">
            <ControllerButtons
              running={running}
              onStart={() => start('demo_5stn')}
              onReset={reset}
              isStarting={isStarting}
              isResetting={isResetting}
            />
            <RecommendationCards
              recommendation={activeRecommendation}
              onAccept={(id) => accept({ recommendationId: id })}
              onOverride={(id, reason) => override({ id, reason })}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
