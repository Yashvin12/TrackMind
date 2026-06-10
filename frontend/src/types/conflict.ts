export type ConflictType =
  | 'block_occupancy'
  | 'opposing_movement'
  | 'platform_contention'
  | 'loop_capacity'

export interface Conflict {
  id: string
  detected_time: string
  time_to_conflict_min: number
  trains_involved: string[]
  block_section: string
  conflict_type: ConflictType
  severity: number // 0–1
  resolved?: boolean
  resolution_action?: string | null
}

export function severityLabel(severity: number): 'low' | 'medium' | 'high' | 'critical' {
  if (severity >= 0.8) return 'critical'
  if (severity >= 0.6) return 'high'
  if (severity >= 0.3) return 'medium'
  return 'low'
}

export function conflictTypeLabel(t: ConflictType): string {
  const labels: Record<ConflictType, string> = {
    block_occupancy: 'Block Occupancy',
    opposing_movement: 'Opposing Movement',
    platform_contention: 'Platform Contention',
    loop_capacity: 'Loop Capacity',
  }
  return labels[t]
}
