export type TrainType = 'rajdhani' | 'express' | 'passenger' | 'freight' | 'departmental'
export type PriorityClass = 1 | 2 | 3 | 4 | 5 | 6
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
  platform?: number | null          // current occupied platform
  eta_next_station?: string         // HH:MM string
  next_station?: string

  // Performance
  current_delay_min: number
  priority_class: PriorityClass
  load_tonnes?: number
  loco_power_kw?: number
}

export const PRIORITY_LABELS: Record<number, string> = {
  1: 'Emergency',
  2: 'VVIP/Special',
  3: 'Rajdhani/VB',
  4: 'Express/Mail',
  5: 'Passenger',
  6: 'Freight',
}

// Light-mode train type colors
export const TRAIN_TYPE_COLORS: Record<TrainType, string> = {
  rajdhani:     '#6D28D9',
  express:      '#1565C0',
  passenger:    '#0E7490',
  freight:      '#92400E',
  departmental: '#374151',
}
