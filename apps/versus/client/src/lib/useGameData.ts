import { useMemo } from 'react'
import type { WeaponProfile, WeaponAbility } from '@tabletop-tools/game-content'
import {
  useUnitSearch,
  useFactions,
  useUnit,
  useLeaderAttachments,
  useLeadersForUnit,
  useUnitAbilities,
  useUnitCompositions,
  useUnitKeywords,
  useWargearOptions,
  useDatasheetWargear,
  useDatasheetModels,
} from '@tabletop-tools/game-data-store'
import type { DatasheetWargear, DatasheetModel } from '@tabletop-tools/game-data-store'

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

// ── Wahapedia weapon profile conversion ─────────────────────────────────────

/**
 * Parses a dice-or-number string like "D6", "2D3+1", "3" into number | string.
 */
function parseDiceOrNum(val: string): number | string {
  const s = val.trim().replace(/\s+/g, '').toUpperCase()
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  if (s === '' || s === '-' || s === '\u2013') return 1
  return s
}

/**
 * Parses a stat string like "3+", "4", "N/A" into a number.
 */
function parseStat(val: string): number {
  const s = val.trim().replace(/[+"'″]/g, '')
  const n = parseInt(s, 10)
  return isNaN(n) ? 0 : n
}

/**
 * Parses weapon ability keywords from a description string like
 * "anti-infantry 4+, devastating wounds, rapid fire 1"
 */
function parseWeaponAbilities(desc: string): WeaponAbility[] {
  if (!desc || desc === '-') return []
  const abilities: WeaponAbility[] = []
  const parts = desc.split(/,\s*/)

  for (const raw of parts) {
    const part = raw.trim().toLowerCase()
    if (!part) continue

    if (part === 'lethal hits') {
      abilities.push({ type: 'LETHAL_HITS' })
    } else if (part === 'devastating wounds') {
      abilities.push({ type: 'DEVASTATING_WOUNDS' })
    } else if (part === 'torrent') {
      abilities.push({ type: 'TORRENT' })
    } else if (part === 'twin-linked') {
      abilities.push({ type: 'TWIN_LINKED' })
    } else if (part === 'ignores cover') {
      abilities.push({ type: 'IGNORES_COVER' })
    } else if (part === 'hazardous') {
      abilities.push({ type: 'HAZARDOUS' })
    } else if (part === 'precision') {
      abilities.push({ type: 'PRECISION' })
    } else if (part === 'indirect fire') {
      abilities.push({ type: 'INDIRECT_FIRE' })
    } else if (part === 'assault') {
      abilities.push({ type: 'ASSAULT' })
    } else if (part === 'pistol') {
      abilities.push({ type: 'PISTOL' })
    } else if (part === 'one shot') {
      abilities.push({ type: 'ONE_SHOT' })
    } else if (part === 'psychic') {
      abilities.push({ type: 'PSYCHIC' })
    } else if (part === 'extra attacks') {
      abilities.push({ type: 'ATTACKS_MOD', value: 0 })
    } else {
      // Parametric abilities
      const sustained = part.match(/sustained hits\s*(\d+)/)
      if (sustained) {
        abilities.push({ type: 'SUSTAINED_HITS', value: parseInt(sustained[1]!, 10) })
        continue
      }
      const blast = part.match(/^blast$/)
      if (blast) {
        abilities.push({ type: 'BLAST' })
        continue
      }
      const anti = part.match(/anti-(.+?)\s+(\d+)\+/)
      if (anti) {
        abilities.push({ type: 'ANTI', keyword: anti[1]!, value: parseInt(anti[2]!, 10) })
        continue
      }
      const melta = part.match(/melta\s*(\d+)/)
      if (melta) {
        abilities.push({ type: 'MELTA', value: parseInt(melta[1]!, 10) })
        continue
      }
      const rapidFire = part.match(/rapid fire\s*(\d+)/)
      if (rapidFire) {
        // Rapid fire adds attacks — model as ATTACKS_MOD
        abilities.push({ type: 'ATTACKS_MOD', value: parseInt(rapidFire[1]!, 10) })
        continue
      }
      const heavy = part.match(/^heavy$/)
      if (heavy) {
        abilities.push({ type: 'HIT_MOD', value: 1 })
        continue
      }
      // Unknown ability — skip silently
    }
  }

  return abilities
}

/**
 * Converts Wahapedia DatasheetWargear[] to WeaponProfile[].
 */
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

/**
 * Hook that returns Wahapedia weapon profiles converted to WeaponProfile[].
 * Prefers Wahapedia data when available, falls back to BSData weapons.
 */
export function useGameDatasheetWeapons(datasheetId: string | null) {
  const result = useDatasheetWargear(datasheetId ?? '')
  const weapons = useMemo(() => {
    if (!datasheetId || result.data.length === 0) return []
    return convertWargearToWeapons(result.data)
  }, [datasheetId, result.data])
  if (!datasheetId) return { data: [] as WeaponProfile[], isLoading: false }
  return { data: weapons, isLoading: result.isLoading }
}

/**
 * Hook that returns Wahapedia model stat lines.
 */
export function useGameDatasheetModels(datasheetId: string | null) {
  const result = useDatasheetModels(datasheetId ?? '')
  if (!datasheetId) return { data: [] as DatasheetModel[], isLoading: false }
  return { data: result.data, isLoading: result.isLoading }
}
