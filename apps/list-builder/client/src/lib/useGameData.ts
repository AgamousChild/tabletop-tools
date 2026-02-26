import {
  useUnitSearch,
  useFactions,
  useDetachments,
  useEnhancements,
  useUnitKeywords,
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

export function useGameDetachments(factionId: string) {
  const result = useDetachments(factionId)
  if (!factionId) return { data: [], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameEnhancements(detachmentId: string) {
  const result = useEnhancements(detachmentId)
  if (!detachmentId) return { data: [], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameUnitKeywords(datasheetId: string) {
  const result = useUnitKeywords(datasheetId)
  if (!datasheetId) return { data: [], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}
