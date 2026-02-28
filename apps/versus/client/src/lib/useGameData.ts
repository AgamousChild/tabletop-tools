import { useMemo } from 'react'
import {
  useLeaderAttachments,
  useLeadersForUnit,
  useUnitAbilities,
  useUnitCompositions,
  useUnitKeywords,
  useWargearOptions,
  useDatasheetModels,
  useDetachments,
  useDetachmentAbilities,
  useEnhancements,
  useStratagems,
  useLegendsUnitIds,
  usePrimaryFactions,
  usePrimaryUnitSearch,
  usePrimaryUnit,
  useWargearAsWeapons,
} from '@tabletop-tools/game-data-store'
import type { DatasheetModel, Detachment, DetachmentAbility, Enhancement, Stratagem } from '@tabletop-tools/game-data-store'

export function useUnits(query: { faction?: string; name?: string }, showLegends = false) {
  const result = usePrimaryUnitSearch(query)
  const legendsIds = useLegendsUnitIds()
  // Don't show any units until a faction is selected
  const filtered = useMemo(() => {
    if (!query.faction) return []
    if (showLegends) return result.data
    return result.data.filter(u => !legendsIds.has(u.id))
  }, [query.faction, result.data, legendsIds, showLegends])
  if (!query.faction) return { data: [], isLoading: false }
  return { data: filtered, isLoading: result.isLoading }
}

export function useGameFactions() {
  return usePrimaryFactions()
}

export function useGameUnit(id: string | null) {
  const result = usePrimaryUnit(id ?? '')
  if (!id) return { data: null, isLoading: false }
  return result
}

export function useGameLeaderAttachments(leaderId: string | null) {
  const result = useLeaderAttachments(leaderId ?? '')
  if (!leaderId) return { data: [], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameLeadersForUnit(unitId: string | null) {
  const result = useLeadersForUnit(unitId ?? '')
  if (!unitId) return { data: [], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameUnitAbilities(datasheetId: string | null) {
  const result = useUnitAbilities(datasheetId ?? '')
  if (!datasheetId) return { data: [], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameUnitCompositions(datasheetId: string | null) {
  const result = useUnitCompositions(datasheetId ?? '')
  if (!datasheetId) return { data: [], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameUnitKeywords(datasheetId: string | null) {
  const result = useUnitKeywords(datasheetId ?? '')
  if (!datasheetId) return { data: [], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameWargearOptions(datasheetId: string | null) {
  const result = useWargearOptions(datasheetId ?? '')
  if (!datasheetId) return { data: [], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

/**
 * Hook: Wahapedia weapon profiles for a datasheet (via shared game-data-store).
 */
export function useGameDatasheetWeapons(datasheetId: string | null) {
  return useWargearAsWeapons(datasheetId)
}

/**
 * Hook: Wahapedia model stat lines for a datasheet.
 */
export function useGameDatasheetModels(datasheetId: string | null) {
  const result = useDatasheetModels(datasheetId ?? '')
  if (!datasheetId) return { data: [] as DatasheetModel[], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameDetachments(factionName: string | undefined) {
  const result = useDetachments(factionName ?? '')
  if (!factionName) return { data: [] as Detachment[], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameDetachmentAbilities(detachmentId: string | null) {
  const result = useDetachmentAbilities(detachmentId ?? '')
  if (!detachmentId) return { data: [] as DetachmentAbility[], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameEnhancements(detachmentId: string | null) {
  const result = useEnhancements(detachmentId ?? '')
  if (!detachmentId) return { data: [] as Enhancement[], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameStratagems(factionId: string | undefined, detachmentId: string | null) {
  const result = useStratagems({ factionId: factionId ?? '', detachmentId: detachmentId ?? undefined })
  if (!factionId) return { data: [] as Stratagem[], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}
