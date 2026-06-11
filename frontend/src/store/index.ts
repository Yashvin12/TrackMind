import { create } from 'zustand'
import { Train } from '../types/train'
import { Conflict } from '../types/conflict'
import { Recommendation, AuditLog } from '../types/recommendation'
import { KPIMetrics } from '../types/api'

export type ViewId =
  | 'network'
  | 'timeline'
  | 'conflicts'
  | 'recommendations'
  | 'whatif'
  | 'audit'
  | 'predictions'

// Conflict lifecycle state machine
export type ConflictLifecycle = 'DETECTED' | 'ACTIVE' | 'RESOLVING' | 'RESOLVED' | 'ARCHIVED'

// Enriched conflict record tracked in the UI
export interface LiveConflict extends Conflict {
  lifecycle: ConflictLifecycle
  detectedAt: number   // epoch ms
  resolvedAt?: number  // epoch ms
}

// Recent event for the history feed
export interface HistoryEvent {
  id: string
  timestamp: number // epoch ms
  message: string
  type: 'conflict_detected' | 'conflict_resolved' | 'signal_delay' | 'train_held' | 'recommendation_applied'
}

export interface WhatIfResult {
  disruption_type: string
  disruption_params: Record<string, unknown>
  before: KPIMetrics
  after: KPIMetrics
  delta: Record<string, number>
  affected_trains: string[]
  narrative: string
  execution_time_ms: number
}

export interface PredictionEntry {
  train_id: string
  future_delay_min: number
  conflict_probability: number
  congestion_level: number
  confidence: number
  shap_values: Record<string, number>
}

export interface StationState {
  id: string
  name: string
  code: string
  num_platforms: number
  platform_occupants: Record<string, string | null>
  blocked_platforms: number[]
  available_platforms: number
  km_from_origin: number
  latitude: number
  longitude: number
}

interface AppState {
  // Simulation
  trains: Record<string, Train>
  conflicts: Conflict[]
  liveConflicts: LiveConflict[]      // enriched, lifecycle-managed conflicts
  conflictHistory: HistoryEvent[]    // recent events feed
  stations: string[]
  stationState: Record<string, StationState>
  blockOccupancy: Record<string, string[]>
  signalStates: Record<string, string>
  simulationRunning: boolean
  sessionId: string
  simElapsedSec: number

  // UI State
  activeView: ViewId
  wsConnected: boolean
  selectedTrainId: string | null
  selectedConflictId: string | null  // Focus Mode target
  focusModeActive: boolean

  // Data
  kpis: KPIMetrics | null
  smoothedKpis: KPIMetrics | null    // debounced display values
  kpisLastUpdated: number            // epoch ms of last smoothedKpis update
  activeRecommendation: Recommendation | null
  auditLogs: AuditLog[]
  whatIfResult: WhatIfResult | null
  predictions: PredictionEntry[]

  // WS throttling
  _pendingWSPayload: Parameters<AppState['applyWSUpdate']>[0] | null
  _lastWSFlush: number

  // UI Actions
  setActiveView: (activeView: ViewId) => void
  setWsConnected: (wsConnected: boolean) => void
  setSelectedTrain: (selectedTrainId: string | null) => void
  setSelectedConflict: (id: string | null) => void
  exitFocusMode: () => void

  // Data Actions
  setKpis: (kpis: KPIMetrics) => void
  setActiveRecommendation: (activeRecommendation: Recommendation | null) => void
  addAuditLog: (log: AuditLog) => void
  setAuditLogs: (auditLogs: AuditLog[]) => void
  setWhatIfResult: (whatIfResult: WhatIfResult | null) => void
  setPredictions: (predictions: PredictionEntry[]) => void
  addHistoryEvent: (event: HistoryEvent) => void

  // Conflict lifecycle tick (call every 500ms)
  tickConflictLifecycles: () => void

  // Aggregated WS Update (throttled to 2Hz)
  applyWSUpdate: (payload: {
    trains?: Record<string, Train>
    conflicts?: Conflict[]
    station_state?: Record<string, StationState>
    block_occupancy?: Record<string, string[]>
    signal_states?: Record<string, string>
    kpis?: KPIMetrics
    running?: boolean
    session_id?: string
    sim_elapsed_sec?: number
  }) => void
}

// Merge incoming raw conflicts with existing LiveConflicts, preserving lifecycle state.
// Returns a tuple of { merged, newEvents } so callers can commit everything
// in ONE atomic set() — no nested set() calls that cause render cascades.
function mergeConflicts(
  existing: LiveConflict[],
  incoming: Conflict[],
): { merged: LiveConflict[]; newEvents: HistoryEvent[] } {
  const now = Date.now()
  const incomingMap = new Map(incoming.map((c) => [c.id, c]))
  const existingMap = new Map(existing.map((c) => [c.id, c]))

  const merged: LiveConflict[] = []
  const newEvents: HistoryEvent[] = []

  // Process all incoming conflicts — upsert by id
  for (const raw of incoming) {
    const prev = existingMap.get(raw.id)
    if (!prev) {
      // NEW conflict: append once
      merged.push({ ...raw, lifecycle: 'DETECTED', detectedAt: now })
      newEvents.push({
        id: `evt_${now}_${raw.id}`,
        timestamp: now,
        message: `Block conflict detected — ${raw.block_section}`,
        type: 'conflict_detected',
      })
    } else {
      // EXISTING conflict: update if any key field changed, otherwise reuse reference (no re-render)
      const lifecycle =
        prev.lifecycle === 'DETECTED' || prev.lifecycle === 'ACTIVE'
          ? prev.lifecycle
          : prev.lifecycle
      const sameEnough =
        prev.severity === raw.severity &&
        prev.time_to_conflict_min === raw.time_to_conflict_min &&
        prev.conflict_type === raw.conflict_type &&
        prev.block_section === raw.block_section &&
        prev.lifecycle === lifecycle

      merged.push(
        sameEnough
          ? prev  // reuse exact reference → React bails out of re-render
          : { ...raw, lifecycle, detectedAt: prev.detectedAt, resolvedAt: prev.resolvedAt }
      )
    }
  }

  // Transition vanished conflicts to RESOLVED (10 s grace window before ARCHIVED)
  for (const lc of existing) {
    if (!incomingMap.has(lc.id) && lc.lifecycle !== 'ARCHIVED') {
      if (lc.lifecycle !== 'RESOLVED' && lc.lifecycle !== 'RESOLVING') {
        merged.push({ ...lc, lifecycle: 'RESOLVED', resolvedAt: now, resolved: true })
        newEvents.push({
          id: `evt_${now}_res_${lc.id}`,
          timestamp: now,
          message: `Block conflict resolved — ${lc.block_section}`,
          type: 'conflict_resolved',
        })
      } else {
        merged.push(lc)
      }
    }
  }

  return { merged, newEvents }
}

const WS_THROTTLE_MS = 500 // 2Hz

export const useStore = create<AppState>((set, get) => ({
  // ── Simulation defaults ──────────────────────────────────────────────────────
  trains: {},
  conflicts: [],
  liveConflicts: [],
  conflictHistory: [],
  stations: ['MUM', 'KLD', 'LNL', 'PNE', 'SRT'],
  stationState: {},
  blockOccupancy: {},
  signalStates: {},
  simulationRunning: false,
  sessionId: '',
  simElapsedSec: 0,

  // ── UI defaults ─────────────────────────────────────────────────────────────
  activeView: 'network',
  wsConnected: false,
  selectedTrainId: null,
  selectedConflictId: null,
  focusModeActive: false,

  // ── Data defaults ────────────────────────────────────────────────────────────
  kpis: null,
  smoothedKpis: null,
  kpisLastUpdated: 0,
  activeRecommendation: null,
  auditLogs: [],
  whatIfResult: null,
  predictions: [],
  _pendingWSPayload: null,
  _lastWSFlush: 0,

  // ── UI Actions ───────────────────────────────────────────────────────────────
  setActiveView: (activeView) => set({ activeView }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setSelectedTrain: (selectedTrainId) => set({ selectedTrainId }),
  setSelectedConflict: (id) => set({
    selectedConflictId: id,
    focusModeActive: id !== null,
  }),
  exitFocusMode: () => set({ selectedConflictId: null, focusModeActive: false }),

  // ── Data Actions ─────────────────────────────────────────────────────────────
  setKpis: (kpis) => {
    const now = Date.now()
    const prev = get().kpisLastUpdated
    const prevSmoothed = get().smoothedKpis
    // Significant event: conflict count changed
    const isSignificant =
      !prevSmoothed ||
      prevSmoothed.active_conflicts !== kpis.active_conflicts ||
      now - prev > 5000

    if (isSignificant) {
      set({ kpis, smoothedKpis: kpis, kpisLastUpdated: now })
    } else {
      set({ kpis })
    }
  },
  setActiveRecommendation: (activeRecommendation) => set({ activeRecommendation }),
  addAuditLog: (log) => set((s) => ({ auditLogs: [log, ...s.auditLogs].slice(0, 200) })),
  setAuditLogs: (auditLogs) => set({ auditLogs }),
  setWhatIfResult: (whatIfResult) => set({ whatIfResult }),
  setPredictions: (predictions) => set({ predictions }),
  addHistoryEvent: (event) =>
    set((s) => ({ conflictHistory: [event, ...s.conflictHistory].slice(0, 50) })),

  // ── Conflict lifecycle tick ───────────────────────────────────────────────────
  tickConflictLifecycles: () =>
    set((s) => {
      const now = Date.now()
      const updated = s.liveConflicts
        .map((lc): LiveConflict => {
          if (lc.lifecycle === 'DETECTED' && now - lc.detectedAt > 1000) {
            return { ...lc, lifecycle: 'ACTIVE' }
          }
          if (lc.lifecycle === 'RESOLVED' && lc.resolvedAt && now - lc.resolvedAt > 10000) {
            return { ...lc, lifecycle: 'ARCHIVED' }
          }
          return lc
        })
        .filter((lc) => lc.lifecycle !== 'ARCHIVED')
      return { liveConflicts: updated }
    }),

  // ── Throttled WS Update (2Hz) ─────────────────────────────────────────────────
  applyWSUpdate: (payload) => {
    const now = Date.now()
    const { _lastWSFlush } = get()
    const elapsed = now - _lastWSFlush

    if (elapsed >= WS_THROTTLE_MS) {
      // Flush immediately — ONE atomic set(), no nested set() calls
      set((s) => {
        const rawConflicts = payload.conflicts ?? s.conflicts
        let updatedLive = s.liveConflicts
        let appendedEvents: HistoryEvent[] = []

        if (payload.conflicts) {
          // mergeConflicts now returns a plain data tuple — no side-effects
          const { merged, newEvents } = mergeConflicts(s.liveConflicts, rawConflicts)

          // Reuse existing array if every element is reference-equal (nothing changed)
          const isIdentical =
            merged.length === s.liveConflicts.length &&
            merged.every((lc, i) => lc === s.liveConflicts[i])
          updatedLive = isIdentical ? s.liveConflicts : merged
          appendedEvents = newEvents
        }

        const newKpis = payload.kpis ?? s.kpis
        const kpisLastUpdated = newKpis && newKpis !== s.kpis ? now : s.kpisLastUpdated
        const smoothedKpis =
          newKpis &&
          (now - s.kpisLastUpdated > 5000 ||
            !s.smoothedKpis ||
            s.smoothedKpis.active_conflicts !== newKpis.active_conflicts)
            ? newKpis
            : s.smoothedKpis

        // Merge new history events into existing history in this same set() call
        const updatedHistory =
          appendedEvents.length > 0
            ? [...appendedEvents, ...s.conflictHistory].slice(0, 50)
            : s.conflictHistory

        return {
          trains:            payload.trains          ?? s.trains,
          conflicts:         rawConflicts,
          liveConflicts:     updatedLive,
          conflictHistory:   updatedHistory,
          stationState:      payload.station_state   ?? s.stationState,
          blockOccupancy:    payload.block_occupancy ?? s.blockOccupancy,
          signalStates:      payload.signal_states   ?? s.signalStates,
          kpis:              newKpis,
          smoothedKpis,
          kpisLastUpdated,
          simulationRunning: payload.running         ?? s.simulationRunning,
          sessionId:         payload.session_id      ?? s.sessionId,
          simElapsedSec:     payload.sim_elapsed_sec ?? s.simElapsedSec,
          _lastWSFlush:      now,
          _pendingWSPayload: null,
        }
      })
    } else {
      // Queue for next flush — only keep the latest payload (last-write-wins)
      set({ _pendingWSPayload: payload })
      const delay = WS_THROTTLE_MS - elapsed
      setTimeout(() => {
        const pending = get()._pendingWSPayload
        if (pending) {
          get().applyWSUpdate(pending)
        }
      }, delay)
    }
  },
}))