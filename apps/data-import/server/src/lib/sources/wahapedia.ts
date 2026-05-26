/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 */
import { parsePipeCsv, convertDescriptions } from '../parsers/wahapedia-csv'

const BASE_URL = 'https://wahapedia.ru/wh40k10ed'

/** All CSV files we fetch from Wahapedia */
const CSV_FILES = [
  'Last_update',
  'Factions',
  'Datasheets',
  'Datasheets_models',
  'Datasheets_wargear',
  'Datasheets_keywords',
  'Datasheets_abilities',
  'Datasheets_unit_composition',
  'Datasheets_models_cost',
  'Datasheets_options',
  'Datasheets_leader',
  'Detachments',
  'Detachment_abilities',
  'Stratagems',
  'Enhancements',
  'Abilities',
  'Source',
  'Datasheets_stratagems',
  'Datasheets_enhancements',
  'Datasheets_detachment_abilities',
] as const

export interface WahapediaResult {
  skipped: boolean
  lastUpdate: string
  data: Record<string, unknown[]>
}

async function fetchCsv(name: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/${name}.csv`)
  if (!resp.ok) throw new Error(`Failed to fetch ${name}.csv: HTTP ${resp.status}`)
  return resp.text()
}

/**
 * Fetches all Wahapedia CSVs, transforms them into the JSON format
 * matching the output of export-wahapedia.ts.
 *
 * Column renames (snake_case → camelCase) and joins that were previously
 * done via SQL queries are now done as in-memory transforms on the CSV rows.
 */
export async function fetchAndProcessWahapedia(
  previousLastUpdate?: string,
): Promise<WahapediaResult> {
  // Check if data has changed
  const lastUpdateRaw = await fetchCsv('Last_update')
  const lastUpdateRows = parsePipeCsv<{ last_update: string }>(lastUpdateRaw)
  const lastUpdate = lastUpdateRows[0]?.last_update ?? ''

  if (previousLastUpdate && lastUpdate === previousLastUpdate) {
    return { skipped: true, lastUpdate, data: {} }
  }

  // Fetch all CSVs in parallel
  const csvNames = CSV_FILES.filter(n => n !== 'Last_update')
  const csvTexts = await Promise.all(csvNames.map(name => fetchCsv(name)))

  const csvData: Record<string, Record<string, string>[]> = {}
  for (let i = 0; i < csvNames.length; i++) {
    csvData[csvNames[i]!] = parsePipeCsv(csvTexts[i]!)
  }

  // Build lookup maps for joins
  const sources = csvData['Source'] ?? []
  const sourceById = new Map(sources.map(s => [s['id'], s]))
  const models = csvData['Datasheets_models'] ?? []
  const abilities = csvData['Abilities'] ?? []
  const abilityById = new Map(abilities.map(a => [a['id'], a]))

  // Build first-model-per-datasheet map (for primary stats on datasheets)
  const firstModelByDatasheet = new Map<string, Record<string, string>>()
  for (const m of models) {
    const dsId = m['datasheet_id'] ?? ''
    if (!firstModelByDatasheet.has(dsId)) {
      firstModelByDatasheet.set(dsId, m)
    }
  }

  const data: Record<string, unknown[]> = {}

  // factions
  data['factions'] = (csvData['Factions'] ?? []).map(r => ({
    id: r['id'] ?? '',
    name: r['name'] ?? '',
  }))

  // detachments
  data['detachments'] = (csvData['Detachments'] ?? []).map(r => ({
    id: r['id'] ?? '',
    factionId: r['faction_id'] ?? '',
    name: r['name'] ?? '',
    legend: r['legend'] ?? '',
    type: r['type'] ?? '',
  }))

  // detachment_abilities
  data['detachment_abilities'] = convertDescriptions(
    (csvData['Detachment_abilities'] ?? []).map(r => ({
      id: r['id'] ?? '',
      detachmentId: r['detachment_id'] ?? '',
      factionId: r['faction_id'] ?? '',
      name: r['name'] ?? '',
      legend: r['legend'] ?? '',
      description: r['description'] ?? '',
    }))
  )

  // stratagems
  data['stratagems'] = convertDescriptions(
    (csvData['Stratagems'] ?? []).map(r => ({
      id: r['id'] ?? '',
      factionId: r['faction_id'] ?? '',
      detachmentId: r['detachment_id'] ?? '',
      name: r['name'] ?? '',
      type: r['type'] ?? '',
      cpCost: r['cp_cost'] ?? '',
      turn: r['turn'] ?? '',
      phase: r['phase'] ?? '',
      legend: r['legend'] ?? '',
      description: r['description'] ?? '',
    }))
  )

  // enhancements
  data['enhancements'] = convertDescriptions(
    (csvData['Enhancements'] ?? []).map(r => ({
      id: r['id'] ?? '',
      factionId: r['faction_id'] ?? '',
      detachmentId: r['detachment_id'] ?? '',
      name: r['name'] ?? '',
      legend: r['legend'] ?? '',
      description: r['description'] ?? '',
      cost: r['cost'] ?? '',
    }))
  )

  // leader_attachments (from datasheet_leaders)
  data['leader_attachments'] = (csvData['Datasheets_leader'] ?? []).map(r => ({
    id: r['id'] ?? '',
    leaderId: r['leader_id'] ?? '',
    attachedId: r['attached_id'] ?? '',
  }))

  // unit_compositions
  data['unit_compositions'] = (csvData['Datasheets_unit_composition'] ?? []).map(r => ({
    id: r['id'] ?? '',
    datasheetId: r['datasheet_id'] ?? '',
    line: r['line'] ?? '',
    description: r['description'] ?? '',
  }))

  // unit_costs
  data['unit_costs'] = (csvData['Datasheets_models_cost'] ?? []).map(r => ({
    id: r['id'] ?? '',
    datasheetId: r['datasheet_id'] ?? '',
    line: r['line'] ?? '',
    description: r['description'] ?? '',
    cost: r['cost'] ?? '',
  }))

  // wargear_options
  data['wargear_options'] = (csvData['Datasheets_options'] ?? []).map(r => ({
    id: r['id'] ?? '',
    datasheetId: r['datasheet_id'] ?? '',
    line: r['line'] ?? '',
    description: r['description'] ?? '',
  }))

  // unit_keywords
  data['unit_keywords'] = (csvData['Datasheets_keywords'] ?? []).map(r => ({
    id: r['id'] ?? '',
    datasheetId: r['datasheet_id'] ?? '',
    keyword: r['keyword'] ?? '',
    isFactionKeyword: r['is_faction_keyword'] === 'true',
  }))

  // unit_abilities — JOIN to abilities table to resolve Core/Faction ability names
  data['unit_abilities'] = convertDescriptions(
    (csvData['Datasheets_abilities'] ?? []).map(r => {
      const abilityId = r['ability_id'] ?? ''
      const ability = abilityById.get(abilityId)
      const name = (r['name'] === '' && ability?.['name']) ? ability['name'] : (r['name'] ?? '')
      const description = (r['description'] === '' && ability?.['description']) ? ability['description'] : (r['description'] ?? '')
      return {
        id: r['id'] ?? '',
        datasheetId: r['datasheet_id'] ?? '',
        name,
        description,
        type: r['type'] ?? '',
        abilityId,
        parameter: r['parameter'] ?? '',
      }
    })
  )

  // abilities (global — Core rules)
  data['abilities'] = convertDescriptions(
    (csvData['Abilities'] ?? []).map(r => ({
      id: r['id'] ?? '',
      name: r['name'] ?? '',
      legend: r['legend'] ?? '',
      factionId: r['faction_id'] ?? '',
      description: r['description'] ?? '',
    }))
  )

  // datasheets (master reference — includes isLegends flag + primary model stats)
  data['datasheets'] = (csvData['Datasheets'] ?? []).map(r => {
    const sourceId = r['source_id'] ?? ''
    const source = sourceById.get(sourceId)
    const isLegends = source ? (source['name'] ?? '').includes('(Warhammer Legends)') : false
    const primaryModel = firstModelByDatasheet.get(r['id'] ?? '')
    return {
      id: r['id'] ?? '',
      name: r['name'] ?? '',
      factionId: r['faction_id'] ?? '',
      role: r['role'] ?? '',
      legend: r['legend'] ?? '',
      transport: r['transport'] ?? '',
      loadout: r['loadout'] ?? '',
      damagedW: r['damaged_w'] ?? '',
      damagedDescription: r['damaged_description'] ?? '',
      isLegends,
      move: primaryModel?.['M'] ?? '',
      toughness: primaryModel?.['T'] ?? '',
      save: primaryModel?.['Sv'] ?? '',
      wounds: primaryModel?.['W'] ?? '',
      leadership: primaryModel?.['Ld'] ?? '',
      oc: primaryModel?.['OC'] ?? '',
      invSv: primaryModel?.['inv_sv'] ?? '',
    }
  })

  // datasheet_wargear (weapon profiles)
  data['datasheet_wargear'] = convertDescriptions(
    (csvData['Datasheets_wargear'] ?? []).map(r => ({
      id: `${r['datasheet_id'] ?? ''}-${r['line'] ?? '0'}-${r['line_in_wargear'] ?? '0'}`,
      datasheetId: r['datasheet_id'] ?? '',
      name: r['name'] ?? '',
      description: r['description'] ?? '',
      range: r['range'] ?? '',
      type: r['type'] ?? '',
      attacks: r['A'] ?? '',
      skill: r['BS_WS'] ?? '',
      strength: r['S'] ?? '',
      ap: r['AP'] ?? '',
      damage: r['D'] ?? '',
    }))
  )

  // datasheet_models (model stat lines)
  data['datasheet_models'] = (csvData['Datasheets_models'] ?? []).map(r => ({
    id: `${r['datasheet_id'] ?? ''}-${r['line'] ?? '0'}`,
    datasheetId: r['datasheet_id'] ?? '',
    name: r['name'] ?? '',
    move: r['M'] ?? '',
    toughness: r['T'] ?? '',
    save: r['Sv'] ?? '',
    wounds: r['W'] ?? '',
    leadership: r['Ld'] ?? '',
    oc: r['OC'] ?? '',
    invSv: r['inv_sv'] ?? '',
    invSvDescription: r['inv_sv_descr'] ?? '',
    baseSize: r['base_size'] ?? '',
  }))

  // Junction tables
  data['datasheet_stratagems'] = (csvData['Datasheets_stratagems'] ?? []).map(r => ({
    id: `${r['datasheet_id'] ?? ''}-${r['stratagem_id'] ?? ''}`,
    datasheetId: r['datasheet_id'] ?? '',
    stratagemId: r['stratagem_id'] ?? '',
  }))

  data['datasheet_enhancements'] = (csvData['Datasheets_enhancements'] ?? []).map(r => ({
    id: `${r['datasheet_id'] ?? ''}-${r['enhancement_id'] ?? ''}`,
    datasheetId: r['datasheet_id'] ?? '',
    enhancementId: r['enhancement_id'] ?? '',
  }))

  data['datasheet_detachment_abilities'] = (csvData['Datasheets_detachment_abilities'] ?? []).map(r => ({
    id: `${r['datasheet_id'] ?? ''}-${r['detachment_ability_id'] ?? ''}`,
    datasheetId: r['datasheet_id'] ?? '',
    detachmentAbilityId: r['detachment_ability_id'] ?? '',
  }))

  return { skipped: false, lastUpdate, data }
}
