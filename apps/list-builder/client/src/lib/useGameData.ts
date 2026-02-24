import {
  useGameDataAvailable,
  useUnitSearch,
  useFactions,
} from '@tabletop-tools/game-data-store'
import { trpc } from './trpc'

export function useUnits(query: { faction?: string; name?: string }, enabled: boolean) {
  const hasLocalData = useGameDataAvailable()
  const localResult = useUnitSearch({ faction: query.faction, name: query.name })
  const trpcResult = trpc.unit.search.useQuery(
    { faction: query.faction, query: query.name },
    { enabled: !hasLocalData && enabled },
  )

  if (hasLocalData) {
    return { data: localResult.data, isLoading: localResult.isLoading }
  }
  return { data: trpcResult.data ?? [], isLoading: trpcResult.isLoading }
}

export function useGameFactions() {
  const hasLocalData = useGameDataAvailable()
  const localResult = useFactions()
  const trpcResult = trpc.unit.listFactions.useQuery(undefined, {
    enabled: !hasLocalData,
  })

  if (hasLocalData) {
    return { data: localResult.data, isLoading: localResult.isLoading }
  }
  return { data: trpcResult.data ?? [], isLoading: trpcResult.isLoading }
}
