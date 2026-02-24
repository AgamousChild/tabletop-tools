import {
  useGameDataAvailable,
  useUnitSearch,
  useFactions,
  useUnit,
} from '@tabletop-tools/game-data-store'
import { trpc } from './trpc'

export function useUnits(query: { faction?: string; name?: string }) {
  const hasLocalData = useGameDataAvailable()
  // Map 'query' param to 'name' for the local search
  const localResult = useUnitSearch({ faction: query.faction, name: query.name })
  const trpcResult = trpc.unit.search.useQuery(
    { faction: query.faction, query: query.name },
    { enabled: !hasLocalData && Boolean(query.faction || query.name) },
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

export function useGameUnit(id: string | null) {
  const hasLocalData = useGameDataAvailable()
  const localResult = useUnit(id ?? '')
  const trpcResult = trpc.unit.get.useQuery(
    { id: id! },
    { enabled: !hasLocalData && id != null },
  )

  if (hasLocalData) {
    return { data: localResult.data, isLoading: localResult.isLoading }
  }
  return { data: trpcResult.data ?? null, isLoading: trpcResult.isLoading }
}
