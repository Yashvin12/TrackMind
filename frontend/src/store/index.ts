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
  selectedConflictId: string | null

  // Data
  kpis: KPIMetrics | null
  activeRecommendation: Recommendation | null
  auditLogs: AuditLog[]
  whatIfResult: WhatIfResult | null
  predictions: PredictionEntry[]

  // UI Actions
  setActiveView: (activeView: ViewId) => void
  setWsConnected: (wsConnected: boolean) => void
  setSelectedTrain: (selectedTrainId: string | null) => void
  setSelectedConflict: (selectedConflictId: string | null) => void

  // Data Actions
  setKpis: (kpis: KPIMetrics) => void
  setActiveRecommendation: (activeRecommendation: Recommendation | null) => void
  addAuditLog: (log: AuditLog) => void
  setAuditLogs: (auditLogs: AuditLog[]) => void
  setWhatIfResult: (whatIfResult: WhatIfResult | null) => void
  setPredictions: (predictions: PredictionEntry[]) => void

  // Aggregated WS Update
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

export const useStore = create<AppState>((set) => ({
  // ── Simulation defaults ──────────────────────────────────────────────────────
  trains: {},
  conflicts: [],
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

  // ── Data defaults ────────────────────────────────────────────────────────────
  kpis: null,
  activeRecommendation: null,
  auditLogs: [],
  whatIfResult: null,
  predictions: [],

  // ── UI Actions ───────────────────────────────────────────────────────────────
  setActiveView: (activeView) => set({ activeView }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setSelectedTrain: (selectedTrainId) => set({ selectedTrainId }),
  setSelectedConflict: (selectedConflictId) => set({ selectedConflictId }),

  // ── Data Actions ─────────────────────────────────────────────────────────────
  setKpis: (kpis) => set({ kpis }),
  setActiveRecommendation: (activeRecommendation) => set({ activeRecommendation }),
  addAuditLog: (log) => set((s) => ({ auditLogs: [log, ...s.auditLogs].slice(0, 200) })),
  setAuditLogs: (auditLogs) => set({ auditLogs }),
  setWhatIfResult: (whatIfResult) => set({ whatIfResult }),
  setPredictions: (predictions) => set({ predictions }),

  // ── Aggregated WS Update ─────────────────────────────────────────────────────
  applyWSUpdate: (payload) =>
    set((s) => ({
      trains:            payload.trains          ?? s.trains,
      conflicts:         payload.conflicts        ?? s.conflicts,
      stationState:      payload.station_state    ?? s.stationState,
      blockOccupancy:    payload.block_occupancy  ?? s.blockOccupancy,
      signalStates:      payload.signal_states    ?? s.signalStates,
      kpis:              payload.kpis             ?? s.kpis,
      simulationRunning: payload.running          ?? s.simulationRunning,
      sessionId:         payload.session_id       ?? s.sessionId,
      simElapsedSec:     payload.sim_elapsed_sec  ?? s.simElapsedSec,
    })),
}))