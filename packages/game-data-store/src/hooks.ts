import { useState, useEffect, useCallback } from 'react'
import type { UnitProfile } from '@tabletop-tools/game-content'
import {
  getUnit, searchUnits, listFactions, getImportMeta, getLists, getList, getListUnits,
  getDetachmentsByFaction, getDetachment, getDetachmentAbilities,
  getStratagems, getEnhancements, getLeaderAttachments,
  getUnitCompositions, getUnitCosts, getWargearOptions,
  getUnitKeywords, getUnitAbilities, getMissions,
  getRulesImportMeta,
} from './store.js'
import type {
  LocalList, LocalListUnit, Detachment, DetachmentAbility,
  Stratagem, Enhancement, LeaderAttachment, UnitComposition,
  UnitCost, WargearOption, UnitKeyword, UnitAbility, Mission,
  RulesImportMeta,
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

// ── Unit detail hooks ────────────────────────────────────────────────────────

export function useUnitCompositions(datasheetId: string) {
  return useStoreQuery(() => getUnitCompositions(datasheetId), [datasheetId], [] as UnitComposition[])
}

export function useUnitCosts(datasheetId: string) {
  return useStoreQuery(() => getUnitCosts(datasheetId), [datasheetId], [] as UnitCost[])
}

export function useWargearOptions(datasheetId: string) {
  return useStoreQuery(() => getWargearOptions(datasheetId), [datasheetId], [] as WargearOption[])
}

export function useUnitKeywords(datasheetId: string) {
  return useStoreQuery(() => getUnitKeywords(datasheetId), [datasheetId], [] as UnitKeyword[])
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
