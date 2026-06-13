import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { Train } from '../types/train'
import { Conflict } from '../types/conflict'
import {
  ConflictDetectionResponse,
  OptimizeSolveResponse,
  HealthResponse,
  SimulationState,
} from '../types/api'
import { Recommendation, AuditLog } from '../types/recommendation'

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Request IDs
api.interceptors.request.use((config) => {
  config.headers['x-request-id'] = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  return config
})

// Error logging
api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('[TrackMind API]', err.response?.data ?? err.message)
    return Promise.reject(err)
  }
)

// ── Health ──────────────────────────────────────────────────────────────────
export const healthAPI = {
  check: (): Promise<AxiosResponse<HealthResponse>> => api.get('/health'),
}

// ── Simulation ──────────────────────────────────────────────────────────────
export const simulationAPI = {
  start: (scenarioId: string): Promise<AxiosResponse<{ status: string; session_id: string }>> =>
    api.post('/simulate/start', { scenario_id: scenarioId }),

  reset: (): Promise<AxiosResponse<{ status: string }>> =>
    api.post('/simulate/reset'),

  pause: (): Promise<AxiosResponse<{ status: string }>> =>
    api.post('/simulate/pause'),

  resume: (): Promise<AxiosResponse<{ status: string }>> =>
    api.post('/simulate/resume'),

  getState: (): Promise<AxiosResponse<SimulationState>> =>
    api.get('/simulate/state'),

  disruption: (
    disruption_type: string,
    params: Record<string, unknown>
  ): Promise<AxiosResponse<{ applied: boolean; message: string }>> =>
    api.post('/simulate/disruption', { disruption_type, params }),

  holdTrain: (train_id: string): Promise<AxiosResponse<{ status: string }>> =>
    api.post('/simulate/hold', { train_id }),

  releaseTrain: (train_id: string): Promise<AxiosResponse<{ status: string }>> =>
    api.post('/simulate/release', { train_id }),
}

// ── Conflicts ───────────────────────────────────────────────────────────────
export const conflictAPI = {
  detect: (lookahead_min = 60): Promise<AxiosResponse<ConflictDetectionResponse>> =>
    api.post('/conflicts/detect', null, { params: { lookahead_min } }),

  list: (): Promise<AxiosResponse<{ conflicts: Conflict[]; count: number }>> =>
    api.get('/conflicts/'),
}

// ── Optimization ────────────────────────────────────────────────────────────
export const optimizeAPI = {
  solve: (
    _trains: Record<string, Train>,
    _conflicts: Conflict[],
    timeoutSec = 5
  ): Promise<AxiosResponse<OptimizeSolveResponse>> =>
    api.post('/optimize/solve', { timeout_sec: timeoutSec }),

  solutions: (): Promise<AxiosResponse<{ solutions: unknown[]; conflicts: Conflict[] }>> =>
    api.get('/optimize/solutions'),
}

// ── Recommendations ─────────────────────────────────────────────────────────
export const recommendAPI = {
  get: (conflictId: string): Promise<AxiosResponse<Recommendation>> =>
    api.get(`/recommendations/${conflictId}`),

  accept: (id: string): Promise<AxiosResponse<{ status: string; audit_log_id: string }>> =>
    api.post(`/recommendations/${id}/accept`),

  override: (
    id: string,
    reason: string
  ): Promise<AxiosResponse<{ status: string; audit_log_id: string }>> =>
    api.post(`/recommendations/${id}/override`, { reason }),

  list: (): Promise<AxiosResponse<{ recommendations: Recommendation[]; count: number }>> =>
    api.get('/recommendations/'),
}

// ── What-If ─────────────────────────────────────────────────────────────────
export const whatifAPI = {
  simulate: (
    disruption_type: string,
    params: Record<string, unknown>
  ): Promise<AxiosResponse<unknown>> =>
    api.post('/whatif/simulate', { disruption_type, params }),
}

// ── KPI ─────────────────────────────────────────────────────────────────────
export const kpiAPI = {
  get: (): Promise<AxiosResponse<unknown>> =>
    api.get('/kpi/'),

  predictions: (): Promise<AxiosResponse<{ predictions: unknown[] }>> =>
    api.get('/kpi/predictions'),
}

// ── Audit ───────────────────────────────────────────────────────────────────
export const auditAPI = {
  list: (
    sessionId?: string,
    limit = 100
  ): Promise<AxiosResponse<{ logs: AuditLog[]; count: number; total: number }>> =>
    api.get('/audit/', { params: { session_id: sessionId, limit } }),
}

export default api
