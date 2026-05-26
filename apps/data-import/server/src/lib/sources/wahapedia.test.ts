import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchAndProcessWahapedia } from './wahapedia'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function csvResponse(text: string) {
  return { ok: true, text: () => Promise.resolve(text) }
}

function makeCsvData(): Record<string, string> {
  return {
    Last_update: 'last_update\n2024-01-15',
    Factions: 'id|name\nSM|Space Marines\nAM|Astra Militarum',
    Datasheets:
      'id|name|faction_id|role|legend|transport|loadout|damaged_w|damaged_description|source_id\nds1|Intercessors|SM|Troops||||||src1',
    Datasheets_models:
      'id|datasheet_id|name|line|M|T|Sv|W|Ld|OC|inv_sv|inv_sv_descr|base_size\nm1|ds1|Intercessor|1|6"|5|3+|2|6+|2|||32mm',
    Datasheets_wargear:
      'id|datasheet_id|name|description|range|type|A|BS_WS|S|AP|D|line\nw1|ds1|Bolt rifle||30"|Ranged|2|3+|4|-1|1|1',
    Datasheets_keywords:
      'id|datasheet_id|keyword|is_faction_keyword\nk1|ds1|Infantry|false\nk2|ds1|Adeptus Astartes|true',
    Datasheets_abilities:
      'id|datasheet_id|name|description|type|ability_id|parameter|line\na1|ds1|Oath of Moment|Re-roll hits|Core|||1',
    Datasheets_unit_composition: 'id|datasheet_id|line|description\nuc1|ds1|1|5 Intercessors',
    Datasheets_models_cost: 'id|datasheet_id|line|description|cost\nmc1|ds1|1|5 models|90',
    Datasheets_options:
      'id|datasheet_id|line|description\nop1|ds1|1|Sergeant can take a power sword',
    Datasheets_leader: 'id|leader_id|attached_id\ndl1|ds1|ds1',
    Detachments: 'id|faction_id|name|legend|type\ndet1|SM|Gladius Task Force||',
    Detachment_abilities:
      'id|detachment_id|faction_id|name|legend|description\nda1|det1|SM|Oath of Moment||<b>Re-roll</b> hits',
    Stratagems:
      'id|faction_id|detachment_id|name|type|cp_cost|turn|phase|legend|description\nst1|SM|det1|Armour of Contempt|Battle Tactic|1|Either|Any||<i>Reduce AP</i>',
    Enhancements:
      'id|faction_id|detachment_id|name|legend|description|cost\nen1|SM|det1|Fire Discipline||Improve BS|15',
    Abilities: 'id|name|legend|faction_id|description\nab1|Leader||SM|Can be attached',
    Source: 'id|name\nsrc1|Codex: Space Marines',
    Datasheets_stratagems: 'id|datasheet_id|stratagem_id\ndss1|ds1|st1',
    Datasheets_enhancements: 'id|datasheet_id|enhancement_id\ndse1|ds1|en1',
    Datasheets_detachment_abilities: 'id|datasheet_id|detachment_ability_id\ndda1|ds1|da1',
  }
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('fetchAndProcessWahapedia', () => {
  it('skips processing when lastUpdate matches', async () => {
    mockFetch.mockResolvedValueOnce(csvResponse('last_update\n2024-01-15'))

    const result = await fetchAndProcessWahapedia('2024-01-15')
    expect(result.skipped).toBe(true)
    expect(result.lastUpdate).toBe('2024-01-15')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('processes all CSVs when data is new', async () => {
    const csv = makeCsvData()

    mockFetch.mockImplementation(async (url: string) => {
      const name = url.split('/').pop()?.replace('.csv', '') ?? ''
      if (csv[name]) return csvResponse(csv[name]!)
      return csvResponse('')
    })

    const result = await fetchAndProcessWahapedia()
    expect(result.skipped).toBe(false)
    expect(result.lastUpdate).toBe('2024-01-15')

    // Verify factions
    expect(result.data['factions']).toEqual([
      { id: 'SM', name: 'Space Marines' },
      { id: 'AM', name: 'Astra Militarum' },
    ])

    // Verify datasheets include primary model stats
    const ds = result.data['datasheets'] as Array<Record<string, unknown>>
    expect(ds[0]!.id).toBe('ds1')
    expect(ds[0]!.name).toBe('Intercessors')
    expect(ds[0]!.move).toBe('6"')
    expect(ds[0]!.toughness).toBe('5')
    expect(ds[0]!.isLegends).toBe(false)

    // Verify keywords have boolean isFactionKeyword
    const kw = result.data['unit_keywords'] as Array<Record<string, unknown>>
    expect(kw[0]!.isFactionKeyword).toBe(false)
    expect(kw[1]!.isFactionKeyword).toBe(true)

    // Verify HTML converted to markdown in descriptions
    const da = result.data['detachment_abilities'] as Array<Record<string, unknown>>
    expect(da[0]!.description).toBe('**Re-roll** hits')

    const st = result.data['stratagems'] as Array<Record<string, unknown>>
    expect(st[0]!.description).toBe('*Reduce AP*')

    // Verify column renames
    const wg = result.data['datasheet_wargear'] as Array<Record<string, unknown>>
    expect(wg[0]!.attacks).toBe('2')
    expect(wg[0]!.skill).toBe('3+')
    expect(wg[0]!.strength).toBe('4')

    // Verify model stats
    const models = result.data['datasheet_models'] as Array<Record<string, unknown>>
    expect(models[0]!.move).toBe('6"')
    expect(models[0]!.datasheetId).toBe('ds1')

    // Verify junction tables
    expect(result.data['datasheet_stratagems']).toHaveLength(1)
    expect(result.data['datasheet_enhancements']).toHaveLength(1)
    expect(result.data['datasheet_detachment_abilities']).toHaveLength(1)
  })

  it('marks legends units via Source table', async () => {
    const csv = makeCsvData()
    csv['Source'] = 'id|name\nsrc1|Index: Space Marines (Warhammer Legends)'

    mockFetch.mockImplementation(async (url: string) => {
      const name = url.split('/').pop()?.replace('.csv', '') ?? ''
      if (csv[name]) return csvResponse(csv[name]!)
      return csvResponse('')
    })

    const result = await fetchAndProcessWahapedia()
    const ds = result.data['datasheets'] as Array<Record<string, unknown>>
    expect(ds[0]!.isLegends).toBe(true)
  })

  it('resolves ability names from abilities table', async () => {
    const csv = makeCsvData()
    csv['Datasheets_abilities'] =
      'id|datasheet_id|name|description|type|ability_id|parameter|line\na1|ds1||  |Core|ab1||1'

    mockFetch.mockImplementation(async (url: string) => {
      const name = url.split('/').pop()?.replace('.csv', '') ?? ''
      if (csv[name]) return csvResponse(csv[name]!)
      return csvResponse('')
    })

    const result = await fetchAndProcessWahapedia()
    const abilities = result.data['unit_abilities'] as Array<Record<string, unknown>>
    expect(abilities[0]!.name).toBe('Leader')
    expect(abilities[0]!.description).toBe('Can be attached')
  })

  it('throws on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })

    await expect(fetchAndProcessWahapedia()).rejects.toThrow('HTTP 503')
  })
})
