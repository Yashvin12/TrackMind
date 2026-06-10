export type ActionType = 'hold' | 'proceed' | 'reroute' | 'loop'
export type Confidence = 'High' | 'Medium' | 'Low'

export interface RecommendationAction {
  action_type: ActionType
  train_id: string
  duration_min?: number
  target_loop_id?: string
  reason: string
}

export interface RecommendationOption {
  rank: number
  actions: RecommendationAction[]
  predicted_delays: Record<string, number>
  total_weighted_delay: number
  confidence: Confidence
  explanation: string
  acceptance_probability: number
  shap_explanation?: Record<string, number>
}

export interface Recommendation {
  id: string
  conflict_id: string
  generated_time: string
  generated_by: string
  options: RecommendationOption[]
}

export interface AuditLog {
  id: string
  timestamp: string
  event_type: string
  train_ids: string[]
  conflict_id?: string
  recommendation_id?: string
  recommended_action?: string
  predicted_delay_min?: number
  controller_decision?: string
  controller_override_reason?: string
  actual_delay_min?: number
  outcome_deviation?: number
  section_id: string
  controller_id: string
  system_version: string
}
