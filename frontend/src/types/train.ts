export type TrainType = 'rajdhani' | 'express' | 'passenger' | 'freight' | 'departmental'
export type PriorityClass = 5 | 3 | 2 | 1 | 0
export type TrainStatus = 'waiting' | 'running' | 'dwelling' | 'stopped' | 'completed'

export interface Train {
  // Identity
  id: string
  number?: string
  name?: string
  type: TrainType
  train_type?: TrainType           // alias used by some backend responses

  // Scheduling
  scheduled_path: string[]
  path_index?: number
  direction?: number               // 1 = up, -1 = down
  scheduled_arrival_terminal?: string

  // Live state
  status?: TrainStatus
  current_location: string
  current_block?: string | null
  progress_pct?: number            // 0..1 through current block
  km_position?: number
  speed_kmh: number
  max_speed_kmh?: number
  dwell_remaining_sec?: number
  assigned_platform?: number | null

  // Performance
  current_delay_min: number
  priority_class: PriorityClass
  load_tonnes?: number
  loco_power_kw?: number
}

export const PRIORITY_LABELS: Record<PriorityClass, string> = {
  5: 'Rajdhani',
  3: 'Express',
  2: 'Passenger',
  1: 'Freight',
  0: 'Departmental',
}

export const TRAIN_TYPE_COLORS: Record<TrainType, string> = {
  rajdhani:     '#818cf8',
  express:      '#34d399',
  passenger:    '#60a5fa',
  freight:      '#fbbf24',
  departmental: '#94a3b8',
}
