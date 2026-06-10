export type TrainType = 'rajdhani' | 'express' | 'passenger' | 'freight' | 'departmental'

export type PriorityClass = 5 | 3 | 2 | 1 | 0

export interface Train {
  id: string
  type: TrainType
  current_location: string
  speed_kmh: number
  scheduled_path: string[]
  scheduled_arrival_terminal: string // ISO-8601
  current_delay_min: number
  priority_class: PriorityClass
  load_tonnes: number
  loco_power_kw: number
  created_at?: string
  updated_at?: string
}

export const PRIORITY_LABELS: Record<PriorityClass, string> = {
  5: 'Rajdhani',
  3: 'Express',
  2: 'Passenger',
  1: 'Freight',
  0: 'Departmental',
}

export const TRAIN_TYPE_COLORS: Record<TrainType, string> = {
  rajdhani: '#818cf8',
  express: '#34d399',
  passenger: '#60a5fa',
  freight: '#f59e0b',
  departmental: '#94a3b8',
}
