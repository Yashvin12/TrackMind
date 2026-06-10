import { Train } from './train'
import { Conflict } from './conflict'
import { Recommendation, AuditLog } from './recommendation'

export interface SimulationState {
  simulation_time: string
  trains: Record<string, Train>
  block_occupancy: Record<string, string | null>
  active_conflicts: Conflict[]
  completed_trains: string[]
  running: boolean
  sim_speed: number
}

export interface ConflictDetectionResponse {
  conflicts: Conflict[]
  generated_at: string
  count: number
  execution_time_ms: number
  request_id: string
}

export interface OptimizeSolveResponse {
  solution: Record<string, number>
  generated_at: string
  execution_time_ms: number
  solver_status: string
  objective_value: number
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error'
  version: string
  app: string
  db?: string
  redis?: string
  timestamp: string
}

export interface ApiError {
  error: string
  request_id: string
  details?: Record<string, unknown>
}

export interface KPIMetrics {
  total_trains: number
  active_conflicts: number
  avg_delay_min: number
  throughput_pct: number
  recommendations_accepted: number
  recommendations_overridden: number
  delay_reduction_pct: number
}
