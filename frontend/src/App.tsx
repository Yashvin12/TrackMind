import { useEffect, useCallback, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useStore } from './store/index'
import { useWebSocket } from './hooks/useWebSocket'
import { simulationAPI, healthAPI, kpiAPI } from './services/api'

// Zone components — always mounted
import { NetworkMap } from './components/NetworkMap'
import { ConflictAlert } from './components/ConflictAlert'
import { KPIDashboard } from './components/KPIDashboard'
import { TrainRegister } from './components/TrainRegister'

// Drawer content components — lazy rendered in overlay
import { TimeSpaceDiagram } from './components/TimeSpaceDiagram'
import { WhatIfPanel } from './components/WhatIfPanel'
import { AuditLog } from './components/AuditLog'
import { PredictionPanel } from './components/PredictionPanel'

// Drawer shell
import { DrawerOverlay, DrawerView } from './components/DrawerOverlay'

// ── Minimal TrackMind logo (generic rail network icon) ────────────────────────
function NCCLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      {/* Icon */}
      <div style={{
        width: 30, height: 30, borderRadius: 4,
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} style={{ width: 16, height: 16 }}>
          {/* Stylized track schematic */}
          <path d="M2 12h20M2 8h20M6 4v16M12 4v16M18 4v16" strokeLinecap="round" />
        </svg>
      </div>
      {/* Text */}
      <div>
        <div style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: '1rem',
          color: 'white',
          lineHeight: 1.1,
          letterSpacing: '0.04em',
        }}>
          TrackMind
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.55rem',
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>
          Network Control Centre
        </div>
      </div>
    </div>
  )
}

// ── Sim control icons ─────────────────────────────────────────────────────────
const PlayIcon  = () => <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 12, height: 12 }}><path d="M8 5v14l11-7z"/></svg>
const PauseIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 12, height: 12 }}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
const ResetIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 12, height: 12 }}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>

// Drawer view config
const DRAWER_META: Record<NonNullable<DrawerView>, { label: string; title: string; subtitle: string }> = {
  timeline:    { label: 'Time-Space', title: 'TIME-SPACE DIAGRAM',      subtitle: 'Train trajectories & conflict crossing points' },
  whatif:      { label: 'What-If',   title: 'SCENARIO LAB',             subtitle: 'Simulate disruptions before they occur' },
  predictions: { label: 'Forecast',  title: 'DELAY FORECAST',           subtitle: 'ML-predicted delays & risk scores' },
  audit:       { label: 'Audit Log', title: 'CONTROLLER AUDIT LOG',     subtitle: 'Timestamped decision record' },
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const {
    trains, conflicts, liveConflicts, conflictHistory, stationState, blockOccupancy, signalStates,
    simulationRunning, sessionId, simElapsedSec,
    kpis, auditLogs, predictions, whatIfResult, activeRecommendation,
    setActiveView, setWsConnected, setKpis, applyWSUpdate, addAuditLog,
    setPredictions, setActiveRecommendation, exitFocusMode, tickConflictLifecycles,
    setSelectedTrain, selectedTrainId,
  } = useStore()

  const [drawerView, setDrawerView]               = useState<DrawerView>(null)
  const [registerCollapsed, setRegisterCollapsed]   = useState(false)
  const [darkMode, setDarkMode]                     = useState(() => {
    return localStorage.getItem('trackmind-theme') === 'dark'
  })

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('trackmind-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const queryClient = useQueryClient()
  const { connected, status: wsStatus, subscribe } = useWebSocket('/ws/live')

  useEffect(() => { setWsConnected(connected) }, [connected, setWsConnected])

  useEffect(() => {
    const off       = subscribe('state_update',        (msg) => applyWSUpdate(msg.payload as Parameters<typeof applyWSUpdate>[0]))
    const offConf   = subscribe('conflict_alert',      (msg) => applyWSUpdate(msg.payload as Parameters<typeof applyWSUpdate>[0]))
    const offRec    = subscribe('recommendation_ready',(msg) => {
      const payload = msg.payload as { recommendation?: typeof activeRecommendation }
      if (payload?.recommendation) setActiveRecommendation(payload.recommendation)
    })
    return () => { off(); offConf(); offRec() }
  }, [subscribe, applyWSUpdate, setActiveRecommendation])

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

  const startMutation  = useMutation({ mutationFn: () => simulationAPI.start('demo_5stn').then(r => r.data), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kpis'] }) })
  const pauseMutation  = useMutation({ mutationFn: () => simulationAPI.pause().then(r => r.data) })
  const resetMutation  = useMutation({ mutationFn: () => simulationAPI.reset().then(r => r.data), onSuccess: () => queryClient.invalidateQueries() })

  useEffect(() => {
    const id = setInterval(() => tickConflictLifecycles(), 500)
    return () => clearInterval(id)
  }, [tickConflictLifecycles])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') { exitFocusMode(); setDrawerView(null) }
      if (e.key === '2') setDrawerView(v => v === 'timeline' ? null : 'timeline')
      if (e.key === '5') setDrawerView(v => v === 'whatif' ? null : 'whatif')
      if (e.key === '6') setDrawerView(v => v === 'predictions' ? null : 'predictions')
      if (e.key === '7') setDrawerView(v => v === 'audit' ? null : 'audit')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [exitFocusMode, setActiveView])

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

  const formatClock = (sec: number) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg-app)',
    }}>

      {/* ── HEADER BAR ────────────────────────────────────────────────────── */}
      <header className="ncc-header" style={{ padding: '0 12px', gap: 0 }}>
        {/* Logo */}
        <NCCLogo />

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)', margin: '0 12px' }} />

        {/* Section ID */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.78rem', color: 'rgba(255,255,255,0.9)', letterSpacing: '0.04em' }}>
            MUM–SRT SECTION
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>
            WESTERN DIVISION · CRS ZONE
          </div>
        </div>

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)', margin: '0 12px' }} />

        {/* Live + Sim clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="status-dot live" style={{ width: 7, height: 7 }} />
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700,
              color: wsStatus === 'connected' ? '#4ADE80' : wsStatus === 'reconnecting' ? '#FBBF24' : '#F87171',
            }}>
              {wsStatus === 'connected' ? 'LIVE' : wsStatus === 'reconnecting' ? 'RECONNECTING' : 'OFFLINE'}
            </span>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700,
            color: 'rgba(255,255,255,0.85)', letterSpacing: '0.05em',
            background: 'rgba(0,0,0,0.25)', padding: '2px 8px', borderRadius: 3,
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            {formatClock(simElapsedSec)}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
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

        {/* KPI Strip inline */}
        {kpis && <KPIDashboard metrics={kpis} trains={trains} />}

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)', margin: '0 12px' }} />

        {/* Sim controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {!simulationRunning ? (
            <button
              id="btn-start-sim"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 12px', borderRadius: 3, fontSize: '0.72rem', fontWeight: 700,
                background: 'var(--safety-green)', color: '#fff', border: 'none',
                cursor: 'pointer', fontFamily: 'var(--font-heading)', letterSpacing: '0.04em',
                opacity: startMutation.isPending ? 0.6 : 1, transition: 'opacity 100ms',
              }}
            >
              <PlayIcon /> START
            </button>
          ) : (
            <button
              id="btn-pause-sim"
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 12px', borderRadius: 3, fontSize: '0.72rem', fontWeight: 700,
                background: 'rgba(251,191,36,0.18)', color: '#FBBF24',
                border: '1px solid rgba(251,191,36,0.4)', cursor: 'pointer',
                fontFamily: 'var(--font-heading)', letterSpacing: '0.04em',
              }}
            >
              <PauseIcon /> PAUSE
            </button>
          )}
          <button
            id="btn-reset-sim"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            title="Reset simulation"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 3,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
              transition: 'all 100ms',
            }}
          >
            <ResetIcon />
          </button>
        </div>

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)', margin: '0 10px' }} />

        {/* Dark / Light mode toggle */}
        <button
          id="btn-toggle-theme"
          onClick={() => setDarkMode(d => !d)}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 3, flexShrink: 0,
            background: darkMode ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${darkMode ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.15)'}`,
            color: darkMode ? '#FBBF24' : 'rgba(255,255,255,0.7)',
            cursor: 'pointer', transition: 'all 150ms ease',
            fontSize: '0.7rem', fontFamily: 'var(--font-mono)', fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          {darkMode ? (
            /* Sun icon */
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 13, height: 13 }}>
              <circle cx="12" cy="12" r="5"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          ) : (
            /* Moon icon */
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 13, height: 13 }}>
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
            </svg>
          )}
          {darkMode ? 'LIGHT' : 'DARK'}
        </button>

        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)', margin: '0 10px' }} />

        {/* Controller ID */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '4px 10px', borderRadius: 3,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: 12,
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700, color: 'white',
          }}>C</div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'white', fontWeight: 600 }}>CTR-01</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>SECTION CONTROLLER</div>
          </div>
        </div>
      </header>

      {/* ── SUB-HEADER: Secondary view toggles ───────────────────────────────── */}
      <div className="ncc-subheader" style={{ padding: '0 12px', gap: 2 }}>
        {/* Active view indicator */}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', marginRight: 8, letterSpacing: '0.06em' }}>
          VIEWS:
        </span>

        {/* Network map (always active) */}
        <div style={{
          padding: '2px 12px', fontSize: '0.68rem', fontWeight: 700,
          fontFamily: 'var(--font-heading)', letterSpacing: '0.04em',
          color: 'white',
          borderBottom: '2px solid rgba(255,255,255,0.7)',
          cursor: 'default',
        }}>
          Network Map
        </div>

        {/* Drawer toggles */}
        {(Object.entries(DRAWER_META) as [NonNullable<DrawerView>, typeof DRAWER_META[NonNullable<DrawerView>]][]).map(([view, meta]) => {
          const isActive = drawerView === view
          return (
            <button
              key={view}
              id={`nav-drawer-${view}`}
              onClick={() => setDrawerView(isActive ? null : view)}
              style={{
                padding: '2px 12px', fontSize: '0.68rem', fontWeight: 600,
                fontFamily: 'var(--font-heading)', letterSpacing: '0.04em',
                background: 'transparent', border: 'none',
                color: isActive ? 'white' : 'rgba(255,255,255,0.45)',
                borderBottom: isActive ? '2px solid rgba(255,255,255,0.7)' : '2px solid transparent',
                cursor: 'pointer', transition: 'all 120ms ease',
              }}
            >
              {meta.label}
            </button>
          )
        })}

        <div style={{ flex: 1 }} />

        {/* Conflict count quick status */}
        {conflictCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '1px 10px', borderRadius: 2,
            background: 'rgba(204,34,0,0.2)',
            border: '1px solid rgba(204,34,0,0.5)',
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700,
            color: '#FCA5A5',
            animation: 'blink-live 2s ease-in-out infinite',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#FCA5A5', animation: 'blink-live 1s ease-in-out infinite' }} />
            {conflictCount} CONFLICT{conflictCount > 1 ? 'S' : ''} ACTIVE
          </div>
        )}

        {/* Session ID */}
        {sessionId && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'rgba(255,255,255,0.25)', marginLeft: 8 }}>
            SID:{sessionId.slice(0, 8)}
          </span>
        )}
      </div>

      {/* ── MAIN CONTENT AREA (flex col, fills remaining height) ─────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', position: 'relative' }}>

        {/* 70/30 grid */}
        <div className="ncc-main-grid" style={{ flex: 1, minHeight: 0 }}>

          {/* ── Network Map (70%) ──────────────────────────────────────────── */}
          <div className="ncc-map-area" style={{ position: 'relative', overflow: 'hidden' }}>
            <NetworkMap
              trains={trains}
              stationState={stationState}
              blockOccupancy={blockOccupancy}
              signalStates={signalStates}
              conflicts={conflicts}
            />
          </div>

          {/* ── Action Queue (30%) ─────────────────────────────────────────── */}
          <div className="ncc-action-queue" style={{ position: 'relative', overflow: 'hidden' }}>
            <ConflictAlert
              liveConflicts={liveConflicts}
              conflictHistory={conflictHistory}
              recommendation={activeRecommendation}
              onAccept={handleAccept}
              onOverride={handleOverride}
              predictions={predictions}
            />

            {/* Slide-over drawer — overlays action queue */}
            {drawerView && (
              <DrawerOverlay
                view={drawerView}
                onClose={() => setDrawerView(null)}
                title={DRAWER_META[drawerView].title}
                subtitle={DRAWER_META[drawerView].subtitle}
              >
                {drawerView === 'timeline' && (
                  <TimeSpaceDiagram
                    trains={trains}
                    conflicts={conflicts}
                    stations={['MUM', 'KLD', 'LNL', 'PNE', 'SRT']}
                  />
                )}
                {drawerView === 'whatif' && <WhatIfPanel result={whatIfResult} />}
                {drawerView === 'predictions' && <PredictionPanel predictions={predictions} trains={trains} />}
                {drawerView === 'audit' && <AuditLog logs={auditLogs} sessionId={sessionId} />}
              </DrawerOverlay>
            )}
          </div>
        </div>

        {/* ── Train Register (bottom, collapsible) ──────────────────────────── */}
        <TrainRegister
          trains={trains}
          onSelectTrain={(id) => setSelectedTrain(id)}
          selectedTrainId={selectedTrainId}
          collapsed={registerCollapsed}
          onToggleCollapse={() => setRegisterCollapsed(v => !v)}
        />
      </div>

      {/* Recommendation cards modal (when activeRecommendation exists but no conflict selected) */}
      {/* Handled inline inside ConflictAlert now */}
    </div>
  )
}