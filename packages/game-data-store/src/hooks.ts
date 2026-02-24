import { useState, useEffect } from 'react'
import type { UnitProfile } from '@tabletop-tools/game-content'
import { getUnit, searchUnits, listFactions, getImportMeta } from './store.js'

export function useUnit(id: string): { data: UnitProfile | null; isLoading: boolean } {
  const [data, setData] = useState<UnitProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    getUnit(id).then((result) => {
      if (!cancelled) {
        setData(result)
        setIsLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [id])

  return { data, isLoading }
}

export function useUnitSearch(query: { faction?: string; name?: string }): { data: UnitProfile[]; isLoading: boolean } {
  const [data, setData] = useState<UnitProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    searchUnits(query).then((result) => {
      if (!cancelled) {
        setData(result)
        setIsLoading(false)
      }
    })
  // Serialize query to avoid infinite re-renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.faction, query.name])

  return { data, isLoading }
}

export function useFactions(): { data: string[]; isLoading: boolean } {
  const [data, setData] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    listFactions().then((result) => {
      if (!cancelled) {
        setData(result)
        setIsLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  return { data, isLoading }
}

export function useGameDataAvailable(): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    getImportMeta().then((meta) => {
      if (!cancelled) {
        setAvailable(meta !== null && meta.totalUnits > 0)
      }
    })
    return () => { cancelled = true }
  }, [])

  return available
}
