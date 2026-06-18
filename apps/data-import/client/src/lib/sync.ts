/// <reference types="vite/client" />

import {
  saveAbilities,
  saveDatasheetDetachmentAbilities,
  saveDatasheetEnhancements,
  saveDatasheetModels,
  saveDatasheets,
  saveDatasheetStratagems,
  saveDatasheetWargear,
  saveDetachmentAbilities,
  saveDetachments,
  saveEnhancements,
  saveLeaderAttachments,
  saveMissions,
  saveStratagems,
  saveUnitAbilities,
  saveUnitCompositions,
  saveUnitCosts,
  saveUnitKeywords,
  saveUnits,
  saveWargearOptions,
  setImportMeta,
  setRulesImportMeta,
} from '@tabletop-tools/game-data-store'

export interface Manifest {
  version: number
  updatedAt: string
  wahapedia?: {
    lastUpdate: string
    recordCounts: Record<string, number>
  }
  bsdata?: {
    commitSha: string
    unitCount: number
    factionCount: number
  }
  missions?: {
    count: number
  }
  files: string[]
}

export interface SyncProgress {
  current: number
  total: number
  currentStep: string
}

export interface SyncResult {
  unitCount: number
  rulesCount: number
  errors: string[]
}

function getApiBase(): string {
  if (import.meta.env.VITE_DATA_IMPORT_API_URL) {
    return import.meta.env.VITE_DATA_IMPORT_API_URL
  }
  // In production, the gateway proxies /data-import/api/* to the worker
  return `${window.location.origin}/data-import/api`
}

export async function checkForUpdates(currentVersion?: number): Promise<{
  available: boolean
  manifest: Manifest | null
}> {
  try {
    const resp = await fetch(`${getApiBase()}/manifest.json`)
    if (!resp.ok) return { available: false, manifest: null }
    const manifest: Manifest = await resp.json()
    const available = currentVersion == null || manifest.version > currentVersion
    return { available, manifest }
  } catch {
    return { available: false, manifest: null }
  }
}

async function fetchDataFile<T>(filename: string): Promise<T> {
  const resp = await fetch(`${getApiBase()}/data/${filename}`)
  if (!resp.ok) throw new Error(`Failed to fetch ${filename}: HTTP ${resp.status}`)
  return resp.json()
}

/** Map of filename → save function for all data stores */
const STORE_MAP: Record<
  string,
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    save: (items: any[]) => Promise<void>
    label: string
    rulesKey?: string
  }
> = {
  'bsdata-units.json': { save: saveUnits, label: 'Unit Profiles' },
  'datasheets.json': { save: saveDatasheets, label: 'Datasheets', rulesKey: 'datasheets' },
  'detachments.json': { save: saveDetachments, label: 'Detachments', rulesKey: 'detachments' },
  'detachment_abilities.json': {
    save: saveDetachmentAbilities,
    label: 'Detachment Abilities',
    rulesKey: 'detachmentAbilities',
  },
  'stratagems.json': { save: saveStratagems, label: 'Stratagems', rulesKey: 'stratagems' },
  'enhancements.json': { save: saveEnhancements, label: 'Enhancements', rulesKey: 'enhancements' },
  'leader_attachments.json': {
    save: saveLeaderAttachments,
    label: 'Leader Attachments',
    rulesKey: 'leaderAttachments',
  },
  'unit_compositions.json': {
    save: saveUnitCompositions,
    label: 'Unit Compositions',
    rulesKey: 'unitCompositions',
  },
  'unit_costs.json': { save: saveUnitCosts, label: 'Unit Costs', rulesKey: 'unitCosts' },
  'wargear_options.json': {
    save: saveWargearOptions,
    label: 'Wargear Options',
    rulesKey: 'wargearOptions',
  },
  'unit_keywords.json': {
    save: saveUnitKeywords,
    label: 'Unit Keywords',
    rulesKey: 'unitKeywords',
  },
  'unit_abilities.json': {
    save: saveUnitAbilities,
    label: 'Unit Abilities',
    rulesKey: 'unitAbilities',
  },
  'datasheet_wargear.json': {
    save: saveDatasheetWargear,
    label: 'Weapon Profiles',
    rulesKey: 'datasheetWargear',
  },
  'datasheet_models.json': {
    save: saveDatasheetModels,
    label: 'Model Stats',
    rulesKey: 'datasheetModels',
  },
  'missions.json': { save: saveMissions, label: 'Missions', rulesKey: 'missions' },
  'abilities.json': { save: saveAbilities, label: 'Global Abilities', rulesKey: 'abilities' },
  'datasheet_stratagems.json': {
    save: saveDatasheetStratagems,
    label: 'Datasheet Stratagems',
    rulesKey: 'datasheetStratagems',
  },
  'datasheet_enhancements.json': {
    save: saveDatasheetEnhancements,
    label: 'Datasheet Enhancements',
    rulesKey: 'datasheetEnhancements',
  },
  'datasheet_detachment_abilities.json': {
    save: saveDatasheetDetachmentAbilities,
    label: 'Datasheet Det. Abilities',
    rulesKey: 'datasheetDetachmentAbilities',
  },
  'factions.json': { save: async () => {}, label: 'Factions' }, // Factions don't have a separate store
}

export async function syncAllData(
  manifest: Manifest,
  onProgress: (progress: SyncProgress) => void,
): Promise<SyncResult> {
  const errors: string[] = []
  const filesToSync = manifest.files.filter((f) => STORE_MAP[f])
  const total = filesToSync.length
  let unitCount = 0
  const rulesCounts: Record<string, number> = {}

  for (let i = 0; i < filesToSync.length; i++) {
    const file = filesToSync[i]!
    const store = STORE_MAP[file]!
    onProgress({ current: i + 1, total, currentStep: store.label })

    try {
      const data = await fetchDataFile<unknown[]>(file)
      if (!Array.isArray(data)) throw new Error(`${file} is not an array`)

      await store.save(data)

      if (file === 'bsdata-units.json') {
        unitCount = data.length
      }
      if (store.rulesKey) {
        rulesCounts[store.rulesKey] = data.length
      }
    } catch (err) {
      errors.push(`${store.label}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Update import meta
  if (unitCount > 0 && manifest.bsdata) {
    await setImportMeta({
      lastImport: Date.now(),
      factions: [], // populated from stored data
      totalUnits: unitCount,
      commitSha: manifest.bsdata.commitSha,
    })
  }

  // Update rules meta
  if (Object.keys(rulesCounts).length > 0) {
    await setRulesImportMeta({
      lastImport: Date.now(),
      counts: {
        detachments: rulesCounts['detachments'] ?? 0,
        stratagems: rulesCounts['stratagems'] ?? 0,
        enhancements: rulesCounts['enhancements'] ?? 0,
        leaderAttachments: rulesCounts['leaderAttachments'] ?? 0,
        unitCompositions: rulesCounts['unitCompositions'] ?? 0,
        unitCosts: rulesCounts['unitCosts'] ?? 0,
        wargearOptions: rulesCounts['wargearOptions'] ?? 0,
        unitKeywords: rulesCounts['unitKeywords'] ?? 0,
        unitAbilities: rulesCounts['unitAbilities'] ?? 0,
        missions: rulesCounts['missions'] ?? 0,
        abilities: rulesCounts['abilities'] ?? 0,
        datasheetStratagems: rulesCounts['datasheetStratagems'] ?? 0,
        datasheetEnhancements: rulesCounts['datasheetEnhancements'] ?? 0,
        datasheetDetachmentAbilities: rulesCounts['datasheetDetachmentAbilities'] ?? 0,
      },
    })
  }

  const rulesCount = Object.values(rulesCounts).reduce((a, b) => a + b, 0)
  return { unitCount, rulesCount, errors }
}
