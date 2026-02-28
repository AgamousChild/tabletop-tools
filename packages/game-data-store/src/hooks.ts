import { useState, useEffect, useCallback, useMemo } from 'react'
import type { UnitProfile, WeaponProfile } from '@tabletop-tools/game-content'
import {
  getUnit, searchUnits, listFactions, getImportMeta, getLists, getList, getListUnits,
  getDetachmentsByFaction, getDetachment, getDetachmentAbilities,
  getStratagems, getEnhancements, getLeaderAttachments, getLeadersForUnit,
  getUnitCompositions, getUnitCosts, getAllUnitCosts, getWargearOptions,
  getUnitKeywords, getAllUnitKeywords, getUnitAbilities, getMissions,
  getRulesImportMeta, getIncludeLegends,
  getAllDatasheets, getDatasheetWargear, getDatasheetModels,
  getDatasheetStratagems, getDatasheetEnhancements, getDatasheetDetachmentAbilities,
  listDatasheetFactions, searchDatasheets, getDatasheetAsUnit, hasDatasheets,
  parseStat, parseDiceOrNum, parseWeaponAbilities,
} from './store.js'
import type {
  LocalList, LocalListUnit, Detachment, DetachmentAbility,
  Stratagem, Enhancement, LeaderAttachment, UnitComposition,
  UnitCost, WargearOption, UnitKeyword, UnitAbility, Mission,
  RulesImportMeta, Datasheet, DatasheetWargear, DatasheetModel,
  DatasheetStratagem, DatasheetEnhancement, DatasheetDetachmentAbility,
} from './store.js'

// ── Internal helper ──────────────────────────────────────────────────────────

function useStoreQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  defaultValue: T,
): { data: T; error: string | null; isLoading: boolean } {
  const [data, setData] = useState<T>(defaultValue)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'IndexedDB unavailable')
          setData(defaultValue)
          setIsLoading(false)
        }
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, isLoading }
}

// ── Unit hooks (existing) ────────────────────────────────────────────────────

export function useUnit(id: string): { data: UnitProfile | null; error: string | null; isLoading: boolean } {
  const [data, setData] = useState<UnitProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    getUnit(id)
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'IndexedDB unavailable')
          setData(null)
          setIsLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [id])

  return { data, error, isLoading }
}

export function useUnitSearch(query: { faction?: string; name?: string }): { data: UnitProfile[]; error: string | null; isLoading: boolean } {
  const [data, setData] = useState<UnitProfile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    searchUnits(query)
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'IndexedDB unavailable')
          setData([])
          setIsLoading(false)
        }
      })
  // Serialize query to avoid infinite re-renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.faction, query.name])

  return { data, error, isLoading }
}

export function useFactions(): { data: string[]; error: string | null; isLoading: boolean } {
  const [data, setData] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    listFactions()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'IndexedDB unavailable')
          setData([])
          setIsLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  return { data, error, isLoading }
}

export function useGameDataAvailable(): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    getImportMeta()
      .then((meta) => {
        if (!cancelled) {
          setAvailable(meta !== null && meta.totalUnits > 0)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailable(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  return available
}

// ── List hooks (existing) ────────────────────────────────────────────────────

export function useLists(): { data: LocalList[]; refetch: () => void } {
  const [data, setData] = useState<LocalList[]>([])
  const [counter, setCounter] = useState(0)

  const refetch = useCallback(() => setCounter((c) => c + 1), [])

  useEffect(() => {
    let cancelled = false
    getLists()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData([])
      })
    return () => { cancelled = true }
  }, [counter])

  return { data, refetch }
}

export function useList(id: string | null): {
  data: (LocalList & { units: LocalListUnit[] }) | null
  refetch: () => void
} {
  const [data, setData] = useState<(LocalList & { units: LocalListUnit[] }) | null>(null)
  const [counter, setCounter] = useState(0)

  const refetch = useCallback(() => setCounter((c) => c + 1), [])

  useEffect(() => {
    if (!id) {
      setData(null)
      return
    }
    let cancelled = false
    Promise.all([getList(id), getListUnits(id)])
      .then(([list, units]) => {
        if (!cancelled) {
          setData(list ? { ...list, units } : null)
        }
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
    return () => { cancelled = true }
  }, [id, counter])

  return { data, refetch }
}

// ── Detachment hooks ─────────────────────────────────────────────────────────

export function useDetachments(factionId: string) {
  return useStoreQuery(() => getDetachmentsByFaction(factionId), [factionId], [] as Detachment[])
}

export function useDetachment(id: string) {
  return useStoreQuery(() => getDetachment(id), [id], null as Detachment | null)
}

export function useDetachmentAbilities(detachmentId: string) {
  return useStoreQuery(() => getDetachmentAbilities(detachmentId), [detachmentId], [] as DetachmentAbility[])
}

// ── Stratagem hooks ──────────────────────────────────────────────────────────

export function useStratagems(filter: { factionId: string; detachmentId?: string }) {
  return useStoreQuery(
    () => getStratagems(filter),
    [filter.factionId, filter.detachmentId],
    [] as Stratagem[],
  )
}

// ── Enhancement hooks ────────────────────────────────────────────────────────

export function useEnhancements(detachmentId: string) {
  return useStoreQuery(() => getEnhancements(detachmentId), [detachmentId], [] as Enhancement[])
}

// ── Leader attachment hooks ──────────────────────────────────────────────────

export function useLeaderAttachments(leaderId: string) {
  return useStoreQuery(() => getLeaderAttachments(leaderId), [leaderId], [] as LeaderAttachment[])
}

export function useLeadersForUnit(attachedId: string) {
  return useStoreQuery(() => getLeadersForUnit(attachedId), [attachedId], [] as LeaderAttachment[])
}

// ── Unit detail hooks ────────────────────────────────────────────────────────

export function useUnitCompositions(datasheetId: string) {
  return useStoreQuery(() => getUnitCompositions(datasheetId), [datasheetId], [] as UnitComposition[])
}

export function useUnitCosts(datasheetId: string) {
  return useStoreQuery(() => getUnitCosts(datasheetId), [datasheetId], [] as UnitCost[])
}

/** Returns a Map from datasheetId to minimum points cost. */
export function useUnitCostMap(): Map<string, number> {
  const { data: allCosts } = useStoreQuery(() => getAllUnitCosts(), [], [] as UnitCost[])
  return useMemo(() => {
    const map = new Map<string, number>()
    for (const c of allCosts) {
      if (map.has(c.datasheetId)) continue // keep first (lowest) cost
      const costStr = c.cost || c.description || ''
      const m = costStr.match(/(\d+)\s*pts?/i)
      if (m) map.set(c.datasheetId, parseInt(m[1], 10))
      else {
        const n = parseInt(costStr, 10)
        if (!isNaN(n)) map.set(c.datasheetId, n)
      }
    }
    return map
  }, [allCosts])
}

export function useWargearOptions(datasheetId: string) {
  return useStoreQuery(() => getWargearOptions(datasheetId), [datasheetId], [] as WargearOption[])
}

export function useUnitKeywords(datasheetId: string) {
  return useStoreQuery(() => getUnitKeywords(datasheetId), [datasheetId], [] as UnitKeyword[])
}

export function useAllUnitKeywords() {
  return useStoreQuery(() => getAllUnitKeywords(), [], [] as UnitKeyword[])
}

export function useUnitAbilities(datasheetId: string) {
  return useStoreQuery(() => getUnitAbilities(datasheetId), [datasheetId], [] as UnitAbility[])
}

// ── Mission hooks ────────────────────────────────────────────────────────────

export function useMissions() {
  return useStoreQuery(() => getMissions(), [], [] as Mission[])
}

// ── Rules import meta hook ───────────────────────────────────────────────────

export function useRulesImportMeta() {
  return useStoreQuery(() => getRulesImportMeta(), [], null as RulesImportMeta | null)
}

// ── Datasheet hooks ─────────────────────────────────────────────────────────

export function useAllDatasheets() {
  return useStoreQuery(() => getAllDatasheets(), [], [] as Datasheet[])
}

export function useDatasheetWargear(datasheetId: string) {
  return useStoreQuery(() => getDatasheetWargear(datasheetId), [datasheetId], [] as DatasheetWargear[])
}

export function useDatasheetModels(datasheetId: string) {
  return useStoreQuery(() => getDatasheetModels(datasheetId), [datasheetId], [] as DatasheetModel[])
}

// ── Junction table hooks ────────────────────────────────────────────────────

export function useDatasheetStratagems(datasheetId: string) {
  return useStoreQuery(() => getDatasheetStratagems(datasheetId), [datasheetId], [] as DatasheetStratagem[])
}

export function useDatasheetEnhancements(datasheetId: string) {
  return useStoreQuery(() => getDatasheetEnhancements(datasheetId), [datasheetId], [] as DatasheetEnhancement[])
}

export function useDatasheetDetachmentAbilities(datasheetId: string) {
  return useStoreQuery(() => getDatasheetDetachmentAbilities(datasheetId), [datasheetId], [] as DatasheetDetachmentAbility[])
}

// ── Wahapedia-primary hooks ─────────────────────────────────────────────────

export function useDatasheetFactions() {
  return useStoreQuery(() => listDatasheetFactions(), [], [] as string[])
}

export function useDatasheetSearch(query: { faction?: string; name?: string }) {
  return useStoreQuery(
    () => searchDatasheets(query),
    [query.faction, query.name],
    [] as Datasheet[],
  )
}

export function useDatasheetUnit(id: string) {
  return useStoreQuery(
    () => getDatasheetAsUnit(id),
    [id],
    null as import('@tabletop-tools/game-content').UnitProfile | null,
  )
}

export function useHasDatasheets() {
  return useStoreQuery(() => hasDatasheets(), [], false)
}

// ── Wahapedia weapon conversion ──────────────────────────────────────────────

/** Convert Wahapedia DatasheetWargear[] to WeaponProfile[] (shared by all apps). */
export function convertWargearToWeapons(wargear: DatasheetWargear[]): WeaponProfile[] {
  return wargear
    .filter(w => w.name && w.name !== '-')
    .map(w => ({
      name: w.name,
      range: w.type === 'Melee' || w.range === 'Melee' ? 'melee' as const : parseStat(w.range),
      attacks: parseDiceOrNum(w.attacks),
      skill: parseStat(w.skill),
      strength: parseStat(w.strength),
      ap: parseStat(w.ap),
      damage: parseDiceOrNum(w.damage),
      abilities: parseWeaponAbilities(w.description),
    }))
}

/** Hook: load Wahapedia wargear for a datasheet, converted to WeaponProfile[]. */
export function useWargearAsWeapons(datasheetId: string | null) {
  const result = useDatasheetWargear(datasheetId ?? '')
  const weapons = useMemo(() => {
    if (!datasheetId || result.data.length === 0) return []
    return convertWargearToWeapons(result.data)
  }, [datasheetId, result.data])
  if (!datasheetId) return { data: [] as WeaponProfile[], isLoading: false }
  return { data: weapons, isLoading: result.isLoading }
}

// ── Settings hooks ──────────────────────────────────────────────────────────

export function useIncludeLegends() {
  return useStoreQuery(() => getIncludeLegends(), [], false)
}

// ── Legends detection ───────────────────────────────────────────────────────

/** Returns a Set of datasheet IDs that have a LEGENDS/LEGEND keyword.
 *  Returns empty Set if the user has enabled "Include Legends" in settings. */
export function useLegendsUnitIds(): Set<string> {
  const { data: includeLegends } = useIncludeLegends()
  const { data: allKeywords } = useAllUnitKeywords()
  return useMemo(() => {
    if (includeLegends) return new Set<string>()
    const set = new Set<string>()
    for (const k of allKeywords) {
      const upper = k.keyword.toUpperCase()
      if (upper === 'LEGENDS' || upper === 'LEGEND') {
        set.add(k.datasheetId)
      }
    }
    return set
  }, [includeLegends, allKeywords])
}

// ── Wahapedia-primary with BSData fallback ──────────────────────────────────
// These hooks prefer Wahapedia datasheets (complete M/T/Sv/W) when available,
// falling back to BSData units. Used by versus and list-builder.

export function usePrimaryFactions() {
  const { data: hasWaha, isLoading: checkLoading } = useHasDatasheets()
  const wahaResult = useDatasheetFactions()
  const bsdataResult = useFactions()

  if (checkLoading) return { data: [] as string[], isLoading: true }
  if (hasWaha) return { data: wahaResult.data, isLoading: wahaResult.isLoading }
  return { data: bsdataResult.data, isLoading: bsdataResult.isLoading }
}

export function usePrimaryUnitSearch(query: { faction?: string; name?: string }) {
  const { data: hasWaha, isLoading: checkLoading } = useHasDatasheets()
  const wahaResult = useDatasheetSearch({ faction: query.faction, name: query.name })
  const bsdataResult = useUnitSearch({ faction: query.faction, name: query.name })
  const costMap = useUnitCostMap()

  // Convert Wahapedia datasheets to lightweight UnitProfile for list display
  const wahaUnits = useMemo(() => {
    return wahaResult.data.map(ds => ({
      id: ds.id,
      faction: ds.factionId,
      name: ds.name,
      move: 0, toughness: 0, save: 0, wounds: 0, leadership: 0, oc: 0,
      weapons: [],
      abilities: [],
      points: costMap.get(ds.id) ?? 0,
    } as UnitProfile))
  }, [wahaResult.data, costMap])

  if (checkLoading) return { data: [] as UnitProfile[], isLoading: true }
  if (hasWaha) return { data: wahaUnits, isLoading: wahaResult.isLoading }
  return { data: bsdataResult.data, isLoading: bsdataResult.isLoading }
}

export function usePrimaryUnit(id: string) {
  const { data: hasWaha, isLoading: checkLoading } = useHasDatasheets()
  const wahaResult = useDatasheetUnit(id)
  const bsdataResult = useUnit(id)

  if (!id) return { data: null as UnitProfile | null, isLoading: false }
  if (checkLoading) return { data: null as UnitProfile | null, isLoading: true }
  if (hasWaha) return { data: wahaResult.data, isLoading: wahaResult.isLoading }
  return { data: bsdataResult.data, isLoading: bsdataResult.isLoading }
}
