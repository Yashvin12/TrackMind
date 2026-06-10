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
  baseURL: '/api/v1',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach request IDs to every outgoing request
api.interceptors.request.use((config) => {
  const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  config.headers['x-request-id'] = id
  return config
})

// Global error logging (not swallowing — just logging)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('[TrackMind API]', err.response?.data ?? err.message)
    return Promise.reject(err)
  }
)

// ── Health ─────────────────────────────────────────────────────────────────
export const healthAPI = {
  check: (): Promise<AxiosResponse<HealthResponse>> => api.get('/health'),
}

// ── Simulation ─────────────────────────────────────────────────────────────
export const simulationAPI = {
  start: (scenarioId: string): Promise<AxiosResponse<{ status: string }>> =>
    api.post('/simulate/start', { scenario_id: scenarioId }),

  reset: (): Promise<AxiosResponse<{ status: string }>> => api.post('/simulate/reset'),

  getState: (): Promise<AxiosResponse<SimulationState>> => api.get('/simulate/state'),
}

// ── Conflicts ─────────────────────────────────────────────────────────────
export const conflictAPI = {
  detect: (
    trains: Record<string, Train>,
    section: unknown,
    lookaheadMin = 60
  ): Promise<AxiosResponse<ConflictDetectionResponse>> =>
    api.post('/conflicts/detect', { trains, section, lookahead_min: lookaheadMin }),

  list: (): Promise<AxiosResponse<{ conflicts: Conflict[]; count: number }>> =>
    api.get('/conflicts/'),
}

// ── Optimization ──────────────────────────────────────────────────────────
export const optimizeAPI = {
  solve: (
    trains: Record<string, Train>,
    conflicts: Conflict[],
    timeoutSec = 5
  ): Promise<AxiosResponse<OptimizeSolveResponse>> =>
    api.post('/optimize/solve', { trains, conflicts, timeout_sec: timeoutSec }),
}

// ── Recommendations ──────────────────────────────────────────────────────
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
}

// ── Audit ─────────────────────────────────────────────────────────────────
export const auditAPI = {
  list: (
    sectionId?: string,
    limit = 100
  ): Promise<AxiosResponse<{ logs: AuditLog[]; count: number }>> =>
    api.get('/audit/', { params: { section_id: sectionId, limit } }),
}

export default api
