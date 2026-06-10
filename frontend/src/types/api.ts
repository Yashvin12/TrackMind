import { Train } from './train'
import { Conflict } from './conflict'
import { Recommendation } from './recommendation'

export interface SimulationState {
  session_id?: string
  simulation_time: string
  sim_elapsed_sec?: number
  trains: Record<string, Train>
  block_occupancy: Record<string, string[]>
  station_state?: Record<string, unknown>
  signal_states?: Record<string, string>
  active_conflicts: Conflict[]
  completed_trains: string[]
  running: boolean
  sim_speed: number
  kpis?: KPIMetrics
}

export interface ConflictDetectionResponse {
  conflicts: Conflict[]
  count: number
  execution_time_ms: number
  lookahead_min?: number
}

export interface OptimizeSolveResponse {
  recommendation: Recommendation
  solutions: unknown[]
  conflicts: Conflict[]
  execution_time_ms: number
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error'
  version: string
  app: string
  db?: string
  redis?: string
  simulation?: {
    running: boolean
    session_id: string
    trains: number
    ws_clients: number
  }
  timestamp: string
}

export interface ApiError {
  error: string
  detail?: string
  request_id?: string
}

export interface KPIMetrics {
  total_trains?: number
  active_trains?: number
  completed_trains?: number
  active_conflicts: number
  avg_delay_min: number
  throughput_pct: number
  recommendations_accepted: number
  recommendations_overridden: number
  delay_reduction_pct: number
  block_utilization_pct?: number
  trains_on_time?: number
  trains_delayed?: number
}
