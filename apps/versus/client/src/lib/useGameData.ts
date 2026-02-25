import {
  useUnitSearch,
  useFactions,
  useUnit,
} from '@tabletop-tools/game-data-store'

export function useUnits(query: { faction?: string; name?: string }) {
  const localResult = useUnitSearch({ faction: query.faction, name: query.name })
  return { data: localResult.data, isLoading: localResult.isLoading }
}

export function useGameFactions() {
  const localResult = useFactions()
  return { data: localResult.data, isLoading: localResult.isLoading }
}

export function useGameUnit(id: string | null) {
  const localResult = useUnit(id ?? '')
  if (!id) {
    return { data: null, isLoading: false }
  }
  return { data: localResult.data, isLoading: localResult.isLoading }
}
