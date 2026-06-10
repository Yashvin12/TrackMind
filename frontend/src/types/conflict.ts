export type ConflictType =
  | 'block_occupancy'
  | 'opposing_movement'
  | 'platform_contention'
  | 'loop_capacity'
  | 'headway_violation'
  | 'overtaking_conflict'
  | 'signal_violation'
  | string   // allow unknown types from backend gracefully

export interface Conflict {
  id: string
  detected_time?: string
  time_to_conflict_min: number
  /** Backend sends affected_trains — trains_involved kept as alias for backwards compat */
  affected_trains: string[]
  trains_involved?: string[]        // alias, same data
  block_section: string
  conflict_type: ConflictType
  severity: number                  // 0–1
  predicted_delay_min?: number
  resolution_options?: string[]
  resolved?: boolean
  resolution_action?: string | null
}

export function severityLabel(severity: number): 'low' | 'medium' | 'high' | 'critical' {
  if (severity >= 0.9) return 'critical'
  if (severity >= 0.65) return 'high'
  if (severity >= 0.35) return 'medium'
  return 'low'
}

export function conflictTypeLabel(t: string): string {
  const labels: Record<string, string> = {
    block_occupancy:    'Block Occupancy',
    opposing_movement:  'Opposing Movement',
    platform_contention:'Platform Contention',
    loop_capacity:      'Loop Capacity',
    headway_violation:  'Headway Violation',
    overtaking_conflict:'Overtaking Conflict',
    signal_violation:   'Signal Violation',
  }
  return labels[t] ?? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
