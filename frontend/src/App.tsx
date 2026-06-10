import { useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from './store/index'
import { useWebSocket } from './hooks/useWebSocket'
import { simulationAPI, healthAPI, kpiAPI } from './services/api'

// View components
import { NetworkMap } from './components/NetworkMap'
import { TimeSpaceDiagram } from './components/TimeSpaceDiagram'
import { ConflictAlert } from './components/ConflictAlert'
import { RecommendationCards } from './components/RecommendationCards'
import { ControllerButtons } from './components/ControllerButtons'
import { KPIDashboard } from './components/KPIDashboard'
import { WhatIfPanel } from './components/WhatIfPanel'
import { AuditLog } from './components/AuditLog'
import { PredictionPanel } from './components/PredictionPanel'
import { ViewId } from './store/index'

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = {
  network: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
    </svg>
  ),
  timeline: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path d="M3 12h18M3 6l9-3 9 3M3 18l9 3 9-3" />
    </svg>
  ),
  conflicts: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  recommendations: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  whatif: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  predictions: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  ),
  audit: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  play: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  pause: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  ),
  reset: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  signal: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3 h-3">
      <path d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
    </svg>
  ),
}

// ── Nav items ──────────────────────────────────────────────────────────────────
interface NavItem {
  id: ViewId
  label: string
  icon: () => JSX.Element
  shortcut: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'network',         label: 'Network Map',       icon: Icon.network,         shortcut: '1' },
  { id: 'timeline',        label: 'Time-Space',        icon: Icon.timeline,        shortcut: '2' },
  { id: 'conflicts',       label: 'Conflicts',         icon: Icon.conflicts,       shortcut: '3' },
  { id: 'recommendations', label: 'Decisions',         icon: Icon.recommendations, shortcut: '4' },
  { id: 'whatif',          label: 'Scenario Lab',      icon: Icon.whatif,          shortcut: '5' },
  { id: 'predictions',     label: 'Forecast',          icon: Icon.predictions,     shortcut: '6' },
  { id: 'audit',           label: 'Audit Log',         icon: Icon.audit,           shortcut: '7' },
]

// ── Page transition variant ────────────────────────────────────────────────────
const PAGE_VARIANT = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -4, transition: { duration: 0.12, ease: 'easeIn' } },
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const {
    trains, conflicts, stationState, blockOccupancy, signalStates,
    simulationRunning, sessionId, simElapsedSec,
    kpis, activeView, wsConnected, auditLogs, predictions, whatIfResult, activeRecommendation,
    setActiveView, setWsConnected, setKpis, applyWSUpdate, addAuditLog,
    setPredictions, setActiveRecommendation,
  } = useStore()

  const queryClient = useQueryClient()
  const { connected, subscribe } = useWebSocket('/ws/live')

  // ── Sync WS connection status ──────────────────────────────────────────────
  useEffect(() => {
    setWsConnected(connected)
  }, [connected, setWsConnected])

  // ── Handle WS messages ─────────────────────────────────────────────────────
  useEffect(() => {
    const off = subscribe('state_update', (msg) => {
      applyWSUpdate(msg.payload as Parameters<typeof applyWSUpdate>[0])
    })
    const offConflict = subscribe('conflict_alert', (msg) => {
      applyWSUpdate(msg.payload as Parameters<typeof applyWSUpdate>[0])
    })
    const offRec = subscribe('recommendation_ready', (msg) => {
      const payload = msg.payload as { recommendation?: typeof activeRecommendation }
      if (payload?.recommendation) {
        setActiveRecommendation(payload.recommendation)
      }
    })
    return () => { off(); offConflict(); offRec() }
  }, [subscribe, applyWSUpdate, setActiveRecommendation])

  // ── Health poll ────────────────────────────────────────────────────────────
  useQuery({
    queryKey: ['health'],
    queryFn: () => healthAPI.check().then((r) => r.data),
    refetchInterval: 10_000,
  })

  // ── KPI poll ───────────────────────────────────────────────────────────────
  const { data: kpiData } = useQuery({
    queryKey: ['kpis'],
    queryFn: () => kpiAPI.get().then((r) => r.data as NonNullable<typeof kpis>),
    refetchInterval: 5_000,
  })
  useEffect(() => {
    if (kpiData) setKpis(kpiData)
  }, [kpiData, setKpis])

  // ── Predictions poll ───────────────────────────────────────────────────────
  const { data: predData } = useQuery({
    queryKey: ['predictions'],
    queryFn: () => kpiAPI.predictions().then((r) => r.data),
    refetchInterval: 3_000,
  })
  useEffect(() => {
    if (predData && 'predictions' in predData) {
      setPredictions(predData.predictions as typeof predictions)
    }
  }, [predData, setPredictions])

  // ── Simulation controls ────────────────────────────────────────────────────
  const startMutation = useMutation({
    mutationFn: () => simulationAPI.start('default').then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpis'] }),
  })

  const pauseMutation = useMutation({
    mutationFn: () => simulationAPI.pause().then((r) => r.data),
  })

  const resumeMutation = useMutation({
    mutationFn: () => simulationAPI.resume().then((r) => r.data),
  })

  const resetMutation = useMutation({
    mutationFn: () => simulationAPI.reset().then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const item = NAV_ITEMS.find((n) => n.shortcut === e.key)
      if (item) setActiveView(item.id)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setActiveView])

  // ── Accept recommendation ──────────────────────────────────────────────────
  const handleAccept = useCallback(
    async (recId: string, _optionRank?: number) => {
      try {
        const { recommendAPI } = await import('./services/api')
        await recommendAPI.accept(recId)
        addAuditLog({
          id: `al_${Date.now()}`,
          timestamp: new Date().toISOString(),
          event_type: 'recommendation_accepted',
          train_ids: activeRecommendation?.options[0]?.actions.map((a) => a.train_id) ?? [],
          recommendation_id: recId,
          controller_decision: 'accepted',
          section_id: 'main',
          controller_id: 'CTR-01',
          system_version: '2.0.0',
        })
        setActiveRecommendation(null)
      } catch (e) {
        console.error('Accept failed', e)
      }
    },
    [activeRecommendation, addAuditLog, setActiveRecommendation]
  )

  const handleOverride = useCallback(
    async (recId: string, reason: string) => {
      try {
        const { recommendAPI } = await import('./services/api')
        await recommendAPI.override(recId, reason)
        addAuditLog({
          id: `al_${Date.now()}`,
          timestamp: new Date().toISOString(),
          event_type: 'recommendation_overridden',
          train_ids: [],
          recommendation_id: recId,
          controller_decision: 'overridden',
          controller_override_reason: reason,
          section_id: 'main',
          controller_id: 'CTR-01',
          system_version: '2.0.0',
        })
        setActiveRecommendation(null)
      } catch (e) {
        console.error('Override failed', e)
      }
    },
    [addAuditLog, setActiveRecommendation]
  )

  // ── Derived values ─────────────────────────────────────────────────────────
  const conflictCount = conflicts.filter((c) => !c.resolved).length

  const formatElapsed = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      {/* ── Command Bar (Top) ──────────────────────────────────────────────── */}
      <header
        className="flex-shrink-0 border-b z-40 sticky top-0"
        style={{
          background: 'var(--surface-1)',
          borderColor: 'var(--border)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Top row: logo + sim controls + status */}
        <div className="flex items-center gap-4 px-4 py-2">
          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent)', boxShadow: '0 0 12px var(--accent)44' }}
            >
              <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
              </svg>
            </div>
            <div>
              <div className="font-heading font-bold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
                TrackMind
              </div>
              <div className="text-xs leading-tight" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Rail Control System
              </div>
            </div>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-1.5 ml-2">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${wsConnected ? 'animate-pulse' : ''}`}
              style={{ background: wsConnected ? 'var(--success)' : 'var(--danger)' }}
            />
            <span
              className="text-xs"
              style={{ color: wsConnected ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-mono)' }}
            >
              {wsConnected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>

          {/* Elapsed time */}
          <div
            className="flex items-center gap-1 px-2 py-1 rounded"
            style={{ background: 'var(--surface-2)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--secondary)' }}
          >
            <span>{formatElapsed(simElapsedSec)}</span>
          </div>

          {/* Session ID */}
          {sessionId && (
            <div
              className="hidden md:flex items-center gap-1 text-xs rounded px-1.5 py-0.5"
              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
            >
              <span>SID:</span>
              <span>{sessionId.slice(0, 8)}&hellip;</span>
            </div>
          )}

          <div className="flex-1" />

          {/* Simulation state badge */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded text-xs"
            style={{
              background: simulationRunning ? 'var(--success)18' : 'var(--surface-2)',
              border: `1px solid ${simulationRunning ? 'var(--success)44' : 'var(--border)'}`,
              color: simulationRunning ? 'var(--success)' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${simulationRunning ? 'animate-pulse' : ''}`}
              style={{ background: simulationRunning ? 'var(--success)' : 'var(--text-muted)' }}
            />
            {simulationRunning ? 'SIM RUNNING' : 'SIM PAUSED'}
          </div>

          {/* Sim controls */}
          <div className="flex items-center gap-1.5">
            {!simulationRunning ? (
              <button
                id="btn-start-sim"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  opacity: startMutation.isPending ? 0.6 : 1,
                  transitionDuration: 'var(--transition-hover)',
                }}
              >
                <Icon.play />
                Start
              </button>
            ) : (
              <button
                id="btn-pause-sim"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
                style={{
                  background: 'var(--warning)22',
                  border: '1px solid var(--warning)44',
                  color: 'var(--warning)',
                  transitionDuration: 'var(--transition-hover)',
                }}
              >
                <Icon.pause />
                Pause
              </button>
            )}
            <button
              id="btn-reset-sim"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-all"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                transitionDuration: 'var(--transition-hover)',
              }}
            >
              <Icon.reset />
            </button>
          </div>

          {/* Controller profile */}
          <div
            className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              C
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>CTR-01</span>
          </div>
        </div>

        {/* KPI Bar */}
        <div
          className="px-4 py-2 border-t overflow-x-auto"
          style={{ borderColor: 'var(--border)' }}
        >
          {kpis && (
            <KPIDashboard
              metrics={kpis}
              trains={trains}
            />
          )}
        </div>

        {/* Nav Tabs */}
        <nav
          className="flex items-end px-4 border-t overflow-x-auto"
          style={{ borderColor: 'var(--border)' }}
        >
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.id
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => setActiveView(item.id)}
                className="relative flex items-center gap-2 px-3 py-2.5 text-xs font-medium transition-all flex-shrink-0"
                style={{
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  transitionDuration: 'var(--transition-hover)',
                }}
              >
                <item.icon />
                <span className="hidden sm:inline">{item.label}</span>
                {item.id === 'conflicts' && conflictCount > 0 && (
                  <span
                    className="ml-1 px-1.5 py-0.5 rounded-full text-white"
                    style={{
                      background: 'var(--danger)',
                      fontSize: '0.6rem',
                      lineHeight: 1,
                    }}
                  >
                    {conflictCount}
                  </span>
                )}
                <kbd
                  className="hidden lg:inline-flex items-center justify-center rounded px-1"
                  style={{
                    fontSize: '0.55rem',
                    background: 'var(--surface-2)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    lineHeight: 1.4,
                    minWidth: '1rem',
                  }}
                >
                  {item.shortcut}
                </kbd>
              </button>
            )
          })}
        </nav>
      </header>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto p-4 md:p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            variants={PAGE_VARIANT}
            initial="initial"
            animate="animate"
            exit="exit"
            className="h-full"
          >
            {/* Network Map */}
            {activeView === 'network' && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2">
                  <NetworkMap
                    trains={trains}
                    stationState={stationState}
                    blockOccupancy={blockOccupancy}
                    signalStates={signalStates}
                    conflicts={conflicts}
                  />
                </div>
                <div className="flex flex-col gap-4">
                  <ConflictAlert conflicts={conflicts} />
                  <ControllerButtons
                    trains={trains}
                    simulationRunning={simulationRunning}
                    onStart={() => startMutation.mutate()}
                    onPause={() => pauseMutation.mutate()}
                    onResume={() => resumeMutation.mutate()}
                    onReset={() => resetMutation.mutate()}
                  />
                </div>
              </div>
            )}

            {/* Time-Space Diagram */}
            {activeView === 'timeline' && (
              <TimeSpaceDiagram
                trains={trains}
                conflicts={conflicts}
                stations={['MUM', 'KLD', 'LNL', 'PNE', 'SRT']}
              />
            )}

            {/* Conflicts */}
            {activeView === 'conflicts' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <ConflictAlert conflicts={conflicts} expanded />
                {activeRecommendation && (
                  <RecommendationCards
                    recommendation={activeRecommendation}
                    onAccept={handleAccept}
                    onOverride={handleOverride}
                  />
                )}
              </div>
            )}

            {/* Recommendations / Decisions */}
            {activeView === 'recommendations' && (
              <RecommendationCards
                recommendation={activeRecommendation}
                onAccept={handleAccept}
                onOverride={handleOverride}
                fullWidth
              />
            )}

            {/* Scenario Lab */}
            {activeView === 'whatif' && (
              <WhatIfPanel result={whatIfResult} />
            )}

            {/* Forecast / Predictions */}
            {activeView === 'predictions' && (
              <PredictionPanel predictions={predictions} trains={trains} />
            )}

            {/* Audit */}
            {activeView === 'audit' && (
              <AuditLog logs={auditLogs} sessionId={sessionId} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 border-t z-50 flex"
        style={{
          background: 'var(--surface-1)',
          backdropFilter: 'blur(20px)',
          borderColor: 'var(--border)',
        }}
      >
        {NAV_ITEMS.slice(0, 5).map((item) => (
          <button
            key={item.id}
            id={`mobile-nav-${item.id}`}
            onClick={() => setActiveView(item.id)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs relative transition-all"
            style={{
              color: activeView === item.id ? 'var(--accent)' : 'var(--text-muted)',
              transitionDuration: 'var(--transition-hover)',
            }}
          >
            <item.icon />
            <span style={{ fontSize: '0.6rem' }}>{item.label.split(' ')[0]}</span>
            {item.id === 'conflicts' && conflictCount > 0 && (
              <span
                className="absolute top-1 right-1/4 w-3.5 h-3.5 rounded-full text-white flex items-center justify-center"
                style={{ background: 'var(--danger)', fontSize: '0.55rem' }}
              >
                {conflictCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}