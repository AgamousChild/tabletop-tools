import {
  useUnitSearch,
  useFactions,
} from '@tabletop-tools/game-data-store'

export function useUnits(query: { faction?: string; name?: string }, enabled: boolean) {
  const localResult = useUnitSearch({ faction: query.faction, name: query.name })

  if (!enabled) {
    return { data: [], isLoading: false }
  }
  return { data: localResult.data, isLoading: localResult.isLoading }
}

export function useGameFactions() {
  const localResult = useFactions()
  return { data: localResult.data, isLoading: localResult.isLoading }
}
