import { useMemo } from 'react'
import {
  useDetachments,
  useDetachment,
  useDetachmentAbilities,
  useEnhancements,
  useUnitKeywords,
  useAllUnitKeywords,
  useUnitCompositions,
  useUnitCosts,
  useAllDatasheets,
  usePrimaryFactions,
  usePrimaryUnitSearch,
} from '@tabletop-tools/game-data-store'
import { parseModelOptions } from './modelOptions'

export function useUnits(query: { faction?: string; name?: string }, enabled: boolean) {
  const result = usePrimaryUnitSearch(query)
  if (!enabled) return { data: [], isLoading: false }
  return result
}

export function useGameFactions() {
  return usePrimaryFactions()
}

export function useGameDetachments(factionId: string) {
  const result = useDetachments(factionId)
  if (!factionId) return { data: [], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameDetachment(detachmentId: string) {
  const result = useDetachment(detachmentId)
  if (!detachmentId) return { data: null, isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}

export function useGameDetachmentAbilities(detachmentId: string) {
  const result = useDetachmentAbilities(detachmentId)
  if (!detachmentId) return { data: [], isLoading: false }
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

export function useUnitModelOptions(datasheetId: string) {
  const compositions = useUnitCompositions(datasheetId)
  const costs = useUnitCosts(datasheetId)
  if (!datasheetId) return []
  return parseModelOptions(compositions.data, costs.data)
}

/** Returns a Set of datasheet IDs that have a LEGENDS/LEGEND keyword */
export function useLegendsUnitIds(): Set<string> {
  const { data: allKeywords } = useAllUnitKeywords()
  return useMemo(() => {
    const set = new Set<string>()
    for (const k of allKeywords) {
      const upper = k.keyword.toUpperCase()
      if (upper === 'LEGENDS' || upper === 'LEGEND') {
        set.add(k.datasheetId)
      }
    }
    return set
  }, [allKeywords])
}

/** Returns a Map of unit ID → role (e.g. "Battleline", "Character", "Dedicated Transport") */
export function useUnitRoles(): Map<string, string> {
  const { data: datasheets } = useAllDatasheets()
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const ds of datasheets) {
      if (ds.role) map.set(ds.id, ds.role)
    }
    return map
  }, [datasheets])
}

/** Returns whether a unit ID is a CHARACTER (from keywords) */
export function useIsCharacter(unitId: string): boolean {
  const { data: keywords } = useUnitKeywords(unitId)
  return useMemo(() => {
    return keywords.some(k => k.keyword.toUpperCase() === 'CHARACTER')
  }, [keywords])
}
