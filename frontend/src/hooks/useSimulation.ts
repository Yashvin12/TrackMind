import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { simulationAPI } from '../services/api'
import { SimulationState } from '../types/api'

export function useSimulation() {
  const queryClient = useQueryClient()
  const [running, setRunning] = useState(false)

  const stateQuery = useQuery<SimulationState>({
    queryKey: ['simulation', 'state'],
    queryFn: async () => {
      const { data } = await simulationAPI.getState()
      return data
    },
    refetchInterval: running ? 1000 : false,
    staleTime: 500,
  })

  const startMutation = useMutation({
    mutationFn: (scenarioId: string) => simulationAPI.start(scenarioId),
    onSuccess: () => {
      setRunning(true)
      queryClient.invalidateQueries({ queryKey: ['simulation'] })
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => simulationAPI.reset(),
    onSuccess: () => {
      setRunning(false)
      queryClient.invalidateQueries({ queryKey: ['simulation'] })
    },
  })

  const start = useCallback(
    (scenarioId = 'demo_5stn') => startMutation.mutate(scenarioId),
    [startMutation]
  )

  const reset = useCallback(() => resetMutation.mutate(), [resetMutation])

  return {
    state: stateQuery.data,
    isLoading: stateQuery.isLoading,
    running,
    start,
    reset,
    isStarting: startMutation.isPending,
    isResetting: resetMutation.isPending,
  }
}
