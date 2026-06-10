import { create } from 'zustand'
import { Train } from '../types/train'
import { Conflict } from '../types/conflict'
import { Recommendation } from '../types/recommendation'
import { KPIMetrics, SimulationState } from '../types/api'

interface TrackMindStore {
  // Simulation state
  simulationState: SimulationState | null
  setSimulationState: (state: SimulationState) => void

  // Trains
  trains: Record<string, Train>
  setTrains: (trains: Record<string, Train>) => void

  // Conflicts
  conflicts: Conflict[]
  setConflicts: (conflicts: Conflict[]) => void

  // Recommendations
  activeRecommendation: Recommendation | null
  setActiveRecommendation: (rec: Recommendation | null) => void

  // KPIs
  kpis: KPIMetrics | null
  setKpis: (kpis: KPIMetrics) => void

  // Stations in section
  stations: string[]
  setStations: (stations: string[]) => void

  // WebSocket status
  wsConnected: boolean
  setWsConnected: (connected: boolean) => void
}

export const useStore = create<TrackMindStore>((set) => ({
  simulationState: null,
  setSimulationState: (state) => set({ simulationState: state }),

  trains: {},
  setTrains: (trains) => set({ trains }),

  conflicts: [],
  setConflicts: (conflicts) => set({ conflicts }),

  activeRecommendation: null,
  setActiveRecommendation: (rec) => set({ activeRecommendation: rec }),

  kpis: null,
  setKpis: (kpis) => set({ kpis }),

  stations: ['Stn_A', 'Stn_B', 'Stn_C', 'Stn_D', 'Stn_E'],
  setStations: (stations) => set({ stations }),

  wsConnected: false,
  setWsConnected: (wsConnected) => set({ wsConnected }),
}))
