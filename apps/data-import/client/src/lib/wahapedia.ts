/// <reference types="vite/client" />

import {
  saveDetachments,
  saveDetachmentAbilities,
  saveStratagems,
  saveEnhancements,
  saveLeaderAttachments,
  saveUnitCompositions,
  saveUnitCosts,
  saveWargearOptions,
  saveUnitKeywords,
  saveUnitAbilities,
  saveDatasheets,
  saveDatasheetWargear,
  saveDatasheetModels,
  saveMissions,
  saveAbilities,
  saveDatasheetStratagems,
  saveDatasheetEnhancements,
  saveDatasheetDetachmentAbilities,
  setRulesImportMeta,
  searchUnits,
} from '@tabletop-tools/game-data-store'
import type {
  Detachment,
  DetachmentAbility,
  Stratagem,
  Enhancement,
  LeaderAttachment,
  UnitComposition,
  UnitCost,
  WargearOption,
  UnitKeyword,
  UnitAbility,
  Datasheet,
  DatasheetWargear,
  DatasheetModel,
  Mission,
  Ability,
  DatasheetStratagem,
  DatasheetEnhancement,
  DatasheetDetachmentAbility,
} from '@tabletop-tools/game-data-store'

export interface RulesImportProgress {
  current: number
  total: number
  currentStep: string
}

export interface RulesImportResult {
  counts: Record<string, number>
  errors: string[]
  idMappingStats?: { matched: number; unmatched: number }
}

/**
 * Normalizes a unit name for fuzzy matching between BSData and Wahapedia.
 * Strips special characters, collapses whitespace, lowercases.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^\w\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Builds a mapping from Wahapedia datasheet IDs to BSData unit IDs.
 * Matches by normalized unit name. For ambiguous matches, prefers same faction.
 */
async function buildIdMapping(
  datasheets: Datasheet[],
  factions: Array<{ id: string; name: string }>,
): Promise<{ map: Map<string, string>; matched: number; unmatched: number }> {
  // Load all BSData units
  const bsdataUnits = await searchUnits({})

  // Build faction ID → faction name mapping from Wahapedia factions
  const factionIdToName = new Map<string, string>()
  for (const f of factions) {
    factionIdToName.set(f.id, f.name)
  }

  // Build BSData lookup: normalizedName → array of { id, faction }
  const bsdataByName = new Map<string, Array<{ id: string; faction: string }>>()
  for (const unit of bsdataUnits) {
    const key = normalizeName(unit.name)
    const arr = bsdataByName.get(key) || []
    arr.push({ id: unit.id, faction: unit.faction })
    bsdataByName.set(key, arr)
  }

  const map = new Map<string, string>()
  let matched = 0
  let unmatched = 0

  for (const ds of datasheets) {
    const key = normalizeName(ds.name)
    const candidates = bsdataByName.get(key)

    if (!candidates || candidates.length === 0) {
      unmatched++
      continue
    }

    // If only one match, use it
    if (candidates.length === 1) {
      map.set(ds.id, candidates[0]!.id)
      matched++
      continue
    }

    // Multiple matches — try faction-based disambiguation
    const wahapediaFactionName = factionIdToName.get(ds.factionId)
    const factionMatch = wahapediaFactionName
      ? candidates.find(c =>
          normalizeName(c.faction) === normalizeName(wahapediaFactionName))
      : null

    if (factionMatch) {
      map.set(ds.id, factionMatch.id)
    } else {
      // Fallback: use first candidate
      map.set(ds.id, candidates[0]!.id)
    }
    matched++
  }

  return { map, matched, unmatched }
}

/**
 * Re-keys an array of records, replacing wahapediaId with bsdataId for the
 * datasheetId field. Records without a mapping are kept with original ID.
 */
function rekeyRecords<T extends { datasheetId: string }>(
  records: T[],
  idMap: Map<string, string>,
): T[] {
  return records.map(r => {
    const bsdataId = idMap.get(r.datasheetId)
    if (bsdataId) {
      return { ...r, datasheetId: bsdataId }
    }
    return r
  })
}

/**
 * Re-keys factionId from Wahapedia short codes ("AC", "AM") to full BSData
 * faction names ("Adeptus Custodes", "Astra Militarum") so that queries by
 * faction name (from BSData-imported units) match the stored records.
 */
function rekeyFactionIds<T extends { factionId: string }>(
  records: T[],
  factionCodeToName: Map<string, string>,
): T[] {
  return records.map(r => {
    const fullName = factionCodeToName.get(r.factionId)
    if (fullName) {
      return { ...r, factionId: fullName }
    }
    return r
  })
}

/**
 * Re-keys leader attachment records which use leaderId/attachedId (both are datasheet IDs).
 */
function rekeyLeaderAttachments(
  records: LeaderAttachment[],
  idMap: Map<string, string>,
): LeaderAttachment[] {
  return records.map(r => ({
    ...r,
    leaderId: idMap.get(r.leaderId) ?? r.leaderId,
    attachedId: idMap.get(r.attachedId) ?? r.attachedId,
  }))
}

const TOTAL_STEPS = 20 // factions + datasheets + ID mapping + 10 existing + wargear + models + missions + abilities + 3 junction tables

export async function importWahapediaRules(
  onProgress: (progress: RulesImportProgress) => void,
): Promise<RulesImportResult> {
  const counts: Record<string, number> = {}
  const errors: string[] = []
  const baseUrl = `${import.meta.env.BASE_URL}wahapedia`
  let step = 0

  // Step 1: Fetch factions (needed for ID mapping)
  step++
  onProgress({ current: step, total: TOTAL_STEPS, currentStep: 'Factions' })
  let factions: Array<{ id: string; name: string }> = []
  try {
    const resp = await fetch(`${baseUrl}/factions.json`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    factions = await resp.json()
  } catch (err) {
    errors.push(`Factions: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Step 2: Fetch datasheets (master unit table — needed for ID mapping)
  step++
  onProgress({ current: step, total: TOTAL_STEPS, currentStep: 'Datasheets' })
  let datasheets: Datasheet[] = []
  try {
    const resp = await fetch(`${baseUrl}/datasheets.json`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    datasheets = await resp.json()
    if (!Array.isArray(datasheets)) throw new Error('datasheets.json is not an array')
    counts.datasheets = datasheets.length
  } catch (err) {
    errors.push(`Datasheets: ${err instanceof Error ? err.message : String(err)}`)
    counts.datasheets = 0
  }

  // Step 3: Build ID mapping from Wahapedia → BSData
  step++
  onProgress({ current: step, total: TOTAL_STEPS, currentStep: 'Building ID mapping' })
  let idMap = new Map<string, string>()
  let mappingStats = { matched: 0, unmatched: 0 }
  try {
    const result = await buildIdMapping(datasheets, factions)
    idMap = result.map
    mappingStats = { matched: result.matched, unmatched: result.unmatched }
  } catch (err) {
    errors.push(`ID mapping: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Build faction code → full name map for re-keying faction IDs.
  // Wahapedia uses short codes ("AC", "AM") but BSData uses full names
  // ("Adeptus Custodes", "Astra Militarum"). Without this re-keying,
  // queries like useDetachments("Adeptus Custodes") return nothing.
  const factionCodeToName = new Map<string, string>()
  for (const f of factions) {
    factionCodeToName.set(f.id, f.name)
  }

  // Re-key datasheets themselves (store with BSData IDs for consistency)
  const rekeyedDatasheets = datasheets.map(ds => {
    const bsdataId = idMap.get(ds.id)
    const fullFactionName = factionCodeToName.get(ds.factionId)
    return {
      ...ds,
      ...(bsdataId ? { id: bsdataId } : {}),
      ...(fullFactionName ? { factionId: fullFactionName } : {}),
    }
  })
  if (rekeyedDatasheets.length > 0) {
    try {
      await saveDatasheets(rekeyedDatasheets)
    } catch (err) {
      errors.push(`Save datasheets: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Steps 4-13: Import all existing Wahapedia data with re-keyed IDs
  type StepConfig = {
    file: string
    label: string
    save: (items: unknown[]) => Promise<void>
    key: string
    rekey: (items: unknown[], map: Map<string, string>) => unknown[]
  }

  const steps: StepConfig[] = [
    {
      file: 'detachments.json', label: 'Detachments', key: 'detachments',
      save: saveDetachments as (items: unknown[]) => Promise<void>,
      rekey: (items) => rekeyFactionIds(items as Array<{ factionId: string }>, factionCodeToName),
    },
    {
      file: 'detachment_abilities.json', label: 'Detachment Abilities', key: 'detachmentAbilities',
      save: saveDetachmentAbilities as (items: unknown[]) => Promise<void>,
      rekey: (items) => rekeyFactionIds(items as Array<{ factionId: string }>, factionCodeToName),
    },
    {
      file: 'stratagems.json', label: 'Stratagems', key: 'stratagems',
      save: saveStratagems as (items: unknown[]) => Promise<void>,
      rekey: (items) => rekeyFactionIds(items as Array<{ factionId: string }>, factionCodeToName),
    },
    {
      file: 'enhancements.json', label: 'Enhancements', key: 'enhancements',
      save: saveEnhancements as (items: unknown[]) => Promise<void>,
      rekey: (items) => rekeyFactionIds(items as Array<{ factionId: string }>, factionCodeToName),
    },
    {
      file: 'leader_attachments.json', label: 'Leader Attachments', key: 'leaderAttachments',
      save: saveLeaderAttachments as (items: unknown[]) => Promise<void>,
      rekey: (items, map) => rekeyLeaderAttachments(items as LeaderAttachment[], map),
    },
    {
      file: 'unit_compositions.json', label: 'Unit Compositions', key: 'unitCompositions',
      save: saveUnitCompositions as (items: unknown[]) => Promise<void>,
      rekey: (items, map) => rekeyRecords(items as Array<{ datasheetId: string }>, map),
    },
    {
      file: 'unit_costs.json', label: 'Unit Costs', key: 'unitCosts',
      save: saveUnitCosts as (items: unknown[]) => Promise<void>,
      rekey: (items, map) => rekeyRecords(items as Array<{ datasheetId: string }>, map),
    },
    {
      file: 'wargear_options.json', label: 'Wargear Options', key: 'wargearOptions',
      save: saveWargearOptions as (items: unknown[]) => Promise<void>,
      rekey: (items, map) => rekeyRecords(items as Array<{ datasheetId: string }>, map),
    },
    {
      file: 'unit_keywords.json', label: 'Unit Keywords', key: 'unitKeywords',
      save: saveUnitKeywords as (items: unknown[]) => Promise<void>,
      rekey: (items, map) => rekeyRecords(items as Array<{ datasheetId: string }>, map),
    },
    {
      file: 'unit_abilities.json', label: 'Unit Abilities', key: 'unitAbilities',
      save: saveUnitAbilities as (items: unknown[]) => Promise<void>,
      rekey: (items, map) => rekeyRecords(items as Array<{ datasheetId: string }>, map),
    },
  ]

  for (const s of steps) {
    step++
    onProgress({ current: step, total: TOTAL_STEPS, currentStep: s.label })

    try {
      const resp = await fetch(`${baseUrl}/${s.file}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${s.file}`)
      const data = await resp.json()
      if (!Array.isArray(data)) throw new Error(`${s.file} is not an array`)
      const rekeyed = s.rekey(data, idMap)
      await s.save(rekeyed)
      counts[s.key] = data.length
    } catch (err) {
      errors.push(`${s.label}: ${err instanceof Error ? err.message : String(err)}`)
      counts[s.key] = 0
    }
  }

  // Step 14: Import weapon profiles (datasheet_wargear)
  step++
  onProgress({ current: step, total: TOTAL_STEPS, currentStep: 'Weapon Profiles' })
  try {
    const resp = await fetch(`${baseUrl}/datasheet_wargear.json`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data: DatasheetWargear[] = await resp.json()
    if (!Array.isArray(data)) throw new Error('datasheet_wargear.json is not an array')
    const rekeyed = rekeyRecords(data, idMap)
    await saveDatasheetWargear(rekeyed)
    counts.datasheetWargear = data.length
  } catch (err) {
    errors.push(`Weapon Profiles: ${err instanceof Error ? err.message : String(err)}`)
    counts.datasheetWargear = 0
  }

  // Step 15: Import model stat lines (datasheet_models)
  step++
  onProgress({ current: step, total: TOTAL_STEPS, currentStep: 'Model Stats' })
  try {
    const resp = await fetch(`${baseUrl}/datasheet_models.json`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data: DatasheetModel[] = await resp.json()
    if (!Array.isArray(data)) throw new Error('datasheet_models.json is not an array')
    const rekeyed = rekeyRecords(data, idMap)
    await saveDatasheetModels(rekeyed)
    counts.datasheetModels = data.length
  } catch (err) {
    errors.push(`Model Stats: ${err instanceof Error ? err.message : String(err)}`)
    counts.datasheetModels = 0
  }

  // Step 16: Import missions (from Chapter Approved markdown export)
  step++
  onProgress({ current: step, total: TOTAL_STEPS, currentStep: 'Missions' })
  try {
    const resp = await fetch(`${baseUrl}/missions.json`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data: Mission[] = await resp.json()
    if (!Array.isArray(data)) throw new Error('missions.json is not an array')
    await saveMissions(data)
    counts.missions = data.length
  } catch (err) {
    errors.push(`Missions: ${err instanceof Error ? err.message : String(err)}`)
    counts.missions = 0
  }

  // Step 17: Import global abilities (Core rules: Leader, Deadly Demise, etc.)
  step++
  onProgress({ current: step, total: TOTAL_STEPS, currentStep: 'Global Abilities' })
  try {
    const resp = await fetch(`${baseUrl}/abilities.json`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data: Ability[] = await resp.json()
    if (!Array.isArray(data)) throw new Error('abilities.json is not an array')
    await saveAbilities(data)
    counts.abilities = data.length
  } catch (err) {
    errors.push(`Global Abilities: ${err instanceof Error ? err.message : String(err)}`)
    counts.abilities = 0
  }

  // Step 18: Import datasheet → stratagem junction table
  step++
  onProgress({ current: step, total: TOTAL_STEPS, currentStep: 'Datasheet Stratagems' })
  try {
    const resp = await fetch(`${baseUrl}/datasheet_stratagems.json`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data: DatasheetStratagem[] = await resp.json()
    if (!Array.isArray(data)) throw new Error('datasheet_stratagems.json is not an array')
    const rekeyed = rekeyRecords(data, idMap)
    await saveDatasheetStratagems(rekeyed)
    counts.datasheetStratagems = data.length
  } catch (err) {
    errors.push(`Datasheet Stratagems: ${err instanceof Error ? err.message : String(err)}`)
    counts.datasheetStratagems = 0
  }

  // Step 19: Import datasheet → enhancement junction table
  step++
  onProgress({ current: step, total: TOTAL_STEPS, currentStep: 'Datasheet Enhancements' })
  try {
    const resp = await fetch(`${baseUrl}/datasheet_enhancements.json`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data: DatasheetEnhancement[] = await resp.json()
    if (!Array.isArray(data)) throw new Error('datasheet_enhancements.json is not an array')
    const rekeyed = rekeyRecords(data, idMap)
    await saveDatasheetEnhancements(rekeyed)
    counts.datasheetEnhancements = data.length
  } catch (err) {
    errors.push(`Datasheet Enhancements: ${err instanceof Error ? err.message : String(err)}`)
    counts.datasheetEnhancements = 0
  }

  // Step 20: Import datasheet → detachment ability junction table
  step++
  onProgress({ current: step, total: TOTAL_STEPS, currentStep: 'Datasheet Detachment Abilities' })
  try {
    const resp = await fetch(`${baseUrl}/datasheet_detachment_abilities.json`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data: DatasheetDetachmentAbility[] = await resp.json()
    if (!Array.isArray(data)) throw new Error('datasheet_detachment_abilities.json is not an array')
    const rekeyed = rekeyRecords(data, idMap)
    await saveDatasheetDetachmentAbilities(rekeyed)
    counts.datasheetDetachmentAbilities = data.length
  } catch (err) {
    errors.push(`Datasheet Det. Abilities: ${err instanceof Error ? err.message : String(err)}`)
    counts.datasheetDetachmentAbilities = 0
  }

  await setRulesImportMeta({
    lastImport: Date.now(),
    counts: {
      detachments: counts.detachments ?? 0,
      stratagems: counts.stratagems ?? 0,
      enhancements: counts.enhancements ?? 0,
      leaderAttachments: counts.leaderAttachments ?? 0,
      unitCompositions: counts.unitCompositions ?? 0,
      unitCosts: counts.unitCosts ?? 0,
      wargearOptions: counts.wargearOptions ?? 0,
      unitKeywords: counts.unitKeywords ?? 0,
      unitAbilities: counts.unitAbilities ?? 0,
      missions: counts.missions ?? 0,
      abilities: counts.abilities ?? 0,
      datasheetStratagems: counts.datasheetStratagems ?? 0,
      datasheetEnhancements: counts.datasheetEnhancements ?? 0,
      datasheetDetachmentAbilities: counts.datasheetDetachmentAbilities ?? 0,
    },
  })

  return { counts, errors, idMappingStats: mappingStats }
}

export function isWahapediaAvailable(): Promise<boolean> {
  // Check if the first JSON file is accessible
  const baseUrl = `${import.meta.env.BASE_URL}wahapedia`
  return fetch(`${baseUrl}/factions.json`, { method: 'HEAD' })
    .then(r => r.ok)
    .catch(() => false)
}
