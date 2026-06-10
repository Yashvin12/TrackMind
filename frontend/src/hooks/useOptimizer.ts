import { useMutation, useQueryClient } from '@tanstack/react-query'
import { optimizeAPI, recommendAPI } from '../services/api'
import { Train } from '../types/train'
import { Conflict } from '../types/conflict'

export function useOptimizer() {
  const queryClient = useQueryClient()

  const solveMutation = useMutation({
    mutationFn: ({
      trains,
      conflicts,
      timeoutSec = 5,
    }: {
      trains: Record<string, Train>
      conflicts: Conflict[]
      timeoutSec?: number
    }) => optimizeAPI.solve(trains, conflicts, timeoutSec),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] })
    },
  })

  const acceptMutation = useMutation({
    mutationFn: (recommendationId: string) => recommendAPI.accept(recommendationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })

  const overrideMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      recommendAPI.override(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })

  return {
    solve: solveMutation.mutate,
    accept: acceptMutation.mutate,
    override: overrideMutation.mutate,
    isSolving: solveMutation.isPending,
    isAccepting: acceptMutation.isPending,
    solution: solveMutation.data?.data,
  }
}
