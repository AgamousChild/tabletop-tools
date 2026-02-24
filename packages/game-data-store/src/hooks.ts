import { useState, useEffect } from 'react'
import type { UnitProfile } from '@tabletop-tools/game-content'
import { getUnit, searchUnits, listFactions, getImportMeta } from './store.js'

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
