import { useEffect, useCallback, useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useStore } from './store/index'
import { useWebSocket } from './hooks/useWebSocket'
import { simulationAPI, healthAPI, kpiAPI } from './services/api'
import { ViewId } from './store/index'

// ── Core components (always mounted, full workspace) ──────────────────────
import { NetworkMap } from './components/NetworkMap'
import { ConflictAlert } from './components/ConflictAlert'
import { KPIDashboard } from './components/KPIDashboard'
import { TrainRegister } from './components/TrainRegister'
import { TimeSpaceDiagram } from './components/TimeSpaceDiagram'
import { WhatIfPanel } from './components/WhatIfPanel'
import { AuditLog } from './components/AuditLog'
import { PredictionPanel } from './components/PredictionPanel'

// ── NCC Architecture components ────────────────────────────────────────────
import { NavRail } from './components/NavRail'
import { AIInspectorPanel } from './components/AIInspectorPanel'

// ── Sim control icons ─────────────────────────────────────────────────────
const PlayIcon  = () => <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 11, height: 11 }}><path d="M8 5v14l11-7z"/></svg>
const PauseIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 11, height: 11 }}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
const ResetIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 11, height: 11 }}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>

// Workspace view title map
const VIEW_META: Record<ViewId, { title: string; subtitle: string }> = {
  network:         { title: 'Network Map', subtitle: 'Live train positions, block occupancy & signals' },
  timeline:        { title: 'Time-Space Diagram', subtitle: 'Train trajectories & conflict crossing points' },
  conflicts:       { title: 'Action Queue', subtitle: 'Active conflicts ranked by severity & urgency' },
  whatif:          { title: 'Scenario Lab', subtitle: 'Simulate disruptions & evaluate alternatives' },
  predictions:     { title: 'Delay Forecast', subtitle: 'ML-predicted delays & risk scores' },
  recommendations: { title: 'AI Recommendations', subtitle: 'Pending controller decisions' },
  audit:           { title: 'Audit Log', subtitle: 'Timestamped controller decision record' },
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  console.count("App render")
  const trains = useStore(s => s.trains)
  const conflicts = useStore(s => s.conflicts)
  const liveConflicts = useStore(s => s.liveConflicts)
  const conflictHistory = useStore(s => s.conflictHistory)
  const stationState = useStore(s => s.stationState)
  const blockOccupancy = useStore(s => s.blockOccupancy)
  const signalStates = useStore(s => s.signalStates)
  const simulationRunning = useStore(s => s.simulationRunning)
  const sessionId = useStore(s => s.sessionId)
  const simElapsedSec = useStore(s => s.simElapsedSec)
  const kpis = useStore(s => s.kpis)
  const auditLogs = useStore(s => s.auditLogs)
  const predictions = useStore(s => s.predictions)
  const whatIfResult = useStore(s => s.whatIfResult)
  const activeRecommendation = useStore(s => s.activeRecommendation)
  const activeView = useStore(s => s.activeView)
  const selectedTrainId = useStore(s => s.selectedTrainId)
  const selectedConflictId = useStore(s => s.selectedConflictId)

  const setActiveView = useStore(s => s.setActiveView)
  const setWsConnected = useStore(s => s.setWsConnected)
  const setKpis = useStore(s => s.setKpis)
  const applyWSUpdate = useStore(s => s.applyWSUpdate)
  const addAuditLog = useStore(s => s.addAuditLog)
  const setPredictions = useStore(s => s.setPredictions)
  const setActiveRecommendation = useStore(s => s.setActiveRecommendation)
  const exitFocusMode = useStore(s => s.exitFocusMode)
  const tickConflictLifecycles = useStore(s => s.tickConflictLifecycles)
  const setSelectedTrain = useStore(s => s.setSelectedTrain)
  const setSelectedConflict = useStore(s => s.setSelectedConflict)

  // ── Register resize (drag) ─────────────────────────────────────────────
  const [registerH, setRegisterH] = useState(200)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: registerH }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      const newH = Math.min(420, Math.max(36, dragRef.current.startH + delta))
      setRegisterH(newH)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [registerH])

  // ── Theme ──────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('trackmind-theme') === 'dark')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('trackmind-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const queryClient = useQueryClient()
  const { connected, status: wsStatus, subscribe } = useWebSocket('/ws/live')

  useEffect(() => { setWsConnected(connected) }, [connected, setWsConnected])

  // WS subscriptions
  useEffect(() => {
    const off     = subscribe('state_update',        (msg) => applyWSUpdate(msg.payload as Parameters<typeof applyWSUpdate>[0]))
    const offConf = subscribe('conflict_alert',      (msg) => applyWSUpdate(msg.payload as Parameters<typeof applyWSUpdate>[0]))
    const offRec  = subscribe('recommendation_ready',(msg) => {
      const payload = msg.payload as { recommendation?: typeof activeRecommendation }
      if (payload?.recommendation) setActiveRecommendation(payload.recommendation)
    })
    return () => { off(); offConf(); offRec() }
  }, [subscribe, applyWSUpdate, setActiveRecommendation])

  // Polling
  useQuery({ queryKey: ['health'], queryFn: () => healthAPI.check().then(r => r.data), refetchInterval: 10_000 })

  const { data: kpiData } = useQuery({
    queryKey: ['kpis'],
    queryFn: () => kpiAPI.get().then(r => r.data as NonNullable<typeof kpis>),
    refetchInterval: 5_000,
  })
  useEffect(() => { if (kpiData) setKpis(kpiData) }, [kpiData, setKpis])

  const { data: predData } = useQuery({
    queryKey: ['predictions'],
    queryFn: () => kpiAPI.predictions().then(r => r.data),
    refetchInterval: 3_000,
  })
  useEffect(() => {
    if (predData && 'predictions' in predData) setPredictions(predData.predictions as typeof predictions)
  }, [predData, setPredictions])

  // Sim mutations
  const startMutation  = useMutation({ mutationFn: () => simulationAPI.start('demo_5stn').then(r => r.data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpis'] }) })
  const pauseMutation  = useMutation({ mutationFn: () => simulationAPI.pause().then(r => r.data) })
  const resetMutation  = useMutation({ mutationFn: () => simulationAPI.reset().then(r => r.data), onSuccess: () => queryClient.invalidateQueries() })

  // Conflict lifecycle ticker
  useEffect(() => {
    const id = setInterval(() => tickConflictLifecycles(), 500)
    return () => clearInterval(id)
  }, [tickConflictLifecycles])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') { exitFocusMode() }
      if (e.key === '1') setActiveView('network')
      if (e.key === '2') setActiveView('timeline')
      if (e.key === '3') setActiveView('conflicts')
      if (e.key === '4') setActiveView('whatif')
      if (e.key === '5') setActiveView('predictions')
      if (e.key === '6') setActiveView('recommendations')
      if (e.key === '7') setActiveView('audit')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [exitFocusMode, setActiveView])

  // Recommendation accept / override
  const handleAccept = useCallback(async (recId: string, _optionRank?: number) => {
    try {
      const { recommendAPI } = await import('./services/api')
      await recommendAPI.accept(recId)
      addAuditLog({
        id: `al_${Date.now()}`,
        timestamp: new Date().toISOString(),
        event_type: 'recommendation_accepted',
        train_ids: activeRecommendation?.options[0]?.actions.map(a => a.train_id) ?? [],
        recommendation_id: recId,
        controller_decision: 'accepted',
        section_id: 'main',
        controller_id: 'CTR-01',
        system_version: '2.0.0',
      })
      setActiveRecommendation(null)
    } catch (e) { console.error('Accept failed', e) }
  }, [activeRecommendation, addAuditLog, setActiveRecommendation])

  const handleOverride = useCallback(async (recId: string, reason: string) => {
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
    } catch (e) { console.error('Override failed', e) }
  }, [addAuditLog, setActiveRecommendation])

  // Derived
  const conflictCount = liveConflicts.filter(c => c.lifecycle !== 'RESOLVED' && c.lifecycle !== 'ARCHIVED').length
  const trainList     = Object.values(trains)
  const selectedTrain = selectedTrainId ? trains[selectedTrainId] ?? null : null
  const selectedConflict = selectedConflictId ? liveConflicts.find(c => c.id === selectedConflictId) ?? null : null
  const selectedPrediction = selectedTrainId ? predictions.find(p => p.train_id === selectedTrainId) ?? null : null
  const recCount = activeRecommendation ? 1 : 0

  const formatClock = (sec: number) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
  }

  const viewMeta = VIEW_META[activeView]

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="ncc-layout" style={{ '--register-h': `${registerH}px` } as React.CSSProperties}>

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 1 — OPERATIONS HEADER
         ═══════════════════════════════════════════════════════════════════ */}
      <header className="ncc-header">
        {/* Logo + Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 4,
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} style={{ width: 14, height: 14 }}>
              <path d="M2 12h20M2 8h20M6 4v16M12 4v16M18 4v16" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'white', lineHeight: 1.1, letterSpacing: '0.04em' }}>
              TrackMind
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Network Control Centre
            </div>
          </div>
        </div>

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)', margin: '0 10px' }} />

        {/* Section ID */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.04em' }}>
            MUM–SRT SECTION
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>
            WESTERN DIVISION · CRS ZONE
          </div>
        </div>

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)', margin: '0 10px' }} />

        {/* WS Status + Sim clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: wsStatus === 'connected' ? '#4ADE80' : wsStatus === 'reconnecting' ? '#FBBF24' : '#F87171',
              animation: wsStatus === 'connected' ? 'blink-live 1.5s ease-in-out infinite' : undefined,
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              color: wsStatus === 'connected' ? '#4ADE80' : wsStatus === 'reconnecting' ? '#FBBF24' : '#F87171',
            }}>
              {wsStatus === 'connected' ? 'LIVE' : wsStatus === 'reconnecting' ? 'RECONNECTING' : 'OFFLINE'}
            </span>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
            color: 'rgba(255,255,255,0.9)', letterSpacing: '0.05em',
            background: 'rgba(0,0,0,0.25)', padding: '2px 8px', borderRadius: 3,
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            {formatClock(simElapsedSec)}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--font-mono)', fontSize: 11,
            padding: '2px 8px', borderRadius: 3,
            background: simulationRunning ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${simulationRunning ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.12)'}`,
            color: simulationRunning ? '#4ADE80' : 'rgba(255,255,255,0.4)',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: simulationRunning ? '#4ADE80' : 'rgba(255,255,255,0.3)',
              animation: simulationRunning ? 'blink-live 1.5s ease-in-out infinite' : undefined,
            }} />
            {simulationRunning ? 'SIM RUNNING' : 'SIM PAUSED'}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* KPI strip */}
        {kpis && <KPIDashboard metrics={kpis} trains={trains} />}

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)', margin: '0 10px' }} />

        {/* Sim controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {!simulationRunning ? (
            <button id="btn-start-sim" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 3, fontSize: 12, fontWeight: 700,
                background: 'var(--safety-green)', color: '#fff', border: 'none',
                cursor: 'pointer', fontFamily: 'var(--font-heading)', letterSpacing: '0.04em',
                opacity: startMutation.isPending ? 0.6 : 1, transition: 'opacity 100ms',
              }}>
              <PlayIcon /> START
            </button>
          ) : (
            <button id="btn-pause-sim" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 3, fontSize: 12, fontWeight: 700,
                background: 'rgba(251,191,36,0.18)', color: '#FBBF24',
                border: '1px solid rgba(251,191,36,0.4)', cursor: 'pointer',
                fontFamily: 'var(--font-heading)', letterSpacing: '0.04em',
              }}>
              <PauseIcon /> PAUSE
            </button>
          )}
          <button id="btn-reset-sim" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}
            title="Reset simulation"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 3,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'all 100ms',
            }}>
            <ResetIcon />
          </button>
        </div>

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)', margin: '0 8px' }} />

        {/* Theme toggle */}
        <button id="btn-toggle-theme" onClick={() => setDarkMode(d => !d)}
          title={darkMode ? 'Light Mode' : 'Dark Mode'}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 3, flexShrink: 0,
            background: darkMode ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${darkMode ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.15)'}`,
            color: darkMode ? '#FBBF24' : 'rgba(255,255,255,0.7)',
            cursor: 'pointer', transition: 'all 150ms ease',
            fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.04em',
          }}>
          {darkMode ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 12, height: 12 }}>
              <circle cx="12" cy="12" r="5"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 12, height: 12 }}>
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
            </svg>
          )}
          {darkMode ? 'LIGHT' : 'DARK'}
        </button>

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)', margin: '0 8px' }} />

        {/* Controller ID */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 3, flexShrink: 0,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 11,
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: 'white',
          }}>C</div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'white', fontWeight: 600 }}>CTR-01</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>SEC. CONTROLLER</div>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 2 — LEFT NAVIGATION RAIL
         ═══════════════════════════════════════════════════════════════════ */}
      <NavRail
        activeView={activeView}
        onNavigate={setActiveView}
        conflictCount={conflictCount}
        recCount={recCount}
      />

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 3 — MAIN WORKSPACE
         ═══════════════════════════════════════════════════════════════════ */}
      <main className="ncc-workspace">
        {/* Workspace header strip */}
        <div className="workspace-header">
          <span className="workspace-title">{viewMeta.title}</span>
          <span style={{ color: 'var(--border-strong)' }}>·</span>
          <span className="workspace-subtitle">{viewMeta.subtitle}</span>
          <div style={{ flex: 1 }} />
          {conflictCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 2,
              background: 'var(--safety-red-light)', border: '1px solid var(--safety-red-border)',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--safety-red)',
              animation: 'blink-live 2s ease-in-out infinite', cursor: 'pointer',
            }} onClick={() => setActiveView('conflicts')}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--safety-red)' }} />
              {conflictCount} CONFLICT{conflictCount > 1 ? 'S' : ''} ACTIVE
            </div>
          )}
          {sessionId && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', marginLeft: 8 }}>
              SID:{sessionId.slice(0, 8)}
            </span>
          )}
        </div>

        {/* Full-workspace views */}
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' }}>
          {activeView === 'network' && (
            <NetworkMap
              trains={trains}
              stationState={stationState}
              blockOccupancy={blockOccupancy}
              signalStates={signalStates}
              conflicts={conflicts}
            />
          )}
          {activeView === 'timeline' && (
            <TimeSpaceDiagram
              trains={trains}
              conflicts={conflicts}
              stations={['MUM', 'KLD', 'LNL', 'PNE', 'SRT']}
            />
          )}
          {activeView === 'conflicts' && (
            <ConflictAlert
              liveConflicts={liveConflicts}
              conflictHistory={conflictHistory}
              recommendation={activeRecommendation}
              onAccept={handleAccept}
              onOverride={handleOverride}
              predictions={predictions}
            />
          )}
          {activeView === 'whatif' && <WhatIfPanel result={whatIfResult} />}
          {activeView === 'predictions' && <PredictionPanel predictions={predictions} trains={trains} />}
          {activeView === 'recommendations' && (
            <ConflictAlert
              liveConflicts={liveConflicts}
              conflictHistory={conflictHistory}
              recommendation={activeRecommendation}
              onAccept={handleAccept}
              onOverride={handleOverride}
              predictions={predictions}
            />
          )}
          {activeView === 'audit' && <AuditLog logs={auditLogs} sessionId={sessionId} />}
        </div>
      </main>

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 4 — RIGHT AI INSPECTOR
         ═══════════════════════════════════════════════════════════════════ */}
      <AIInspectorPanel
        selectedTrain={selectedTrain}
        selectedConflict={selectedConflict}
        prediction={selectedPrediction}
        recommendation={activeRecommendation}
        conflictCount={conflictCount}
        trainCount={trainList.length}
        avgDelay={kpis?.avg_delay_min ?? 0}
        onAccept={handleAccept}
        onOverride={handleOverride}
        onSimulate={() => {}} // no-op for now
      />

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 5 — RESIZABLE TRAIN REGISTER
         ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="ncc-register"
        style={{ height: registerH === 36 ? 36 : registerH }}
      >
        {/* Drag handle */}
        <div
          className="ncc-register-drag-handle"
          onMouseDown={onDragStart}
          title="Drag to resize"
        />
        <TrainRegister
          trains={trains}
          onSelectTrain={(id) => {
            setSelectedTrain(id)
            // Also clear conflict selection when train selected
            setSelectedConflict(null)
          }}
          selectedTrainId={selectedTrainId}
          collapsed={registerH <= 36}
          onToggleCollapse={() => setRegisterH(h => h <= 36 ? 200 : 36)}
        />
      </div>
    </div>
  )
}