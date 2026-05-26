import { describe, expect, it } from 'vitest'

import {
  buildIdMapping,
  normalizeName,
  rekeyAllWahapediaFiles,
  rekeyFactionIds,
  rekeyLeaderAttachments,
  rekeyRecords,
} from './id-mapping'

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName('  Hello World  ')).toBe('hello world')
  })

  it('normalizes curly apostrophes', () => {
    expect(normalizeName('Mortarion\u2019s Anvil')).toBe("mortarion's anvil")
  })

  it('strips special characters but keeps hyphens and apostrophes', () => {
    expect(normalizeName('Unit™ (Alpha)')).toBe('unit alpha')
    expect(normalizeName('Blood-Crazed')).toBe('blood-crazed')
  })

  it('collapses whitespace', () => {
    expect(normalizeName('a   b   c')).toBe('a b c')
  })
})

describe('buildIdMapping', () => {
  it('maps Wahapedia datasheet IDs to BSData unit IDs by name', () => {
    const datasheets = [
      { id: 'w1', name: 'Intercessors', factionId: 'SM' },
      { id: 'w2', name: 'Guardsmen', factionId: 'AM' },
    ]
    const factions = [
      { id: 'SM', name: 'Space Marines' },
      { id: 'AM', name: 'Astra Militarum' },
    ]
    const bsdataUnits = [
      { id: 'b1', name: 'Intercessors', faction: 'Space Marines' },
      { id: 'b2', name: 'Guardsmen', faction: 'Astra Militarum' },
    ]

    const { map, matched, unmatched } = buildIdMapping(datasheets, factions, bsdataUnits)
    expect(map.get('w1')).toBe('b1')
    expect(map.get('w2')).toBe('b2')
    expect(matched).toBe(2)
    expect(unmatched).toBe(0)
  })

  it('handles unmatched datasheets', () => {
    const datasheets = [{ id: 'w1', name: 'Unknown Unit', factionId: 'SM' }]
    const factions = [{ id: 'SM', name: 'Space Marines' }]
    const bsdataUnits: Array<{ id: string; name: string; faction: string }> = []

    const { map, matched, unmatched } = buildIdMapping(datasheets, factions, bsdataUnits)
    expect(map.size).toBe(0)
    expect(matched).toBe(0)
    expect(unmatched).toBe(1)
  })

  it('disambiguates by faction when multiple BSData units share a name', () => {
    const datasheets = [{ id: 'w1', name: 'Daemon Prince', factionId: 'CSM' }]
    const factions = [{ id: 'CSM', name: 'Chaos Space Marines' }]
    const bsdataUnits = [
      { id: 'b1', name: 'Daemon Prince', faction: 'Chaos Space Marines' },
      { id: 'b2', name: 'Daemon Prince', faction: 'Chaos Daemons' },
    ]

    const { map } = buildIdMapping(datasheets, factions, bsdataUnits)
    expect(map.get('w1')).toBe('b1')
  })

  it('falls back to first candidate when faction disambiguation fails', () => {
    const datasheets = [{ id: 'w1', name: 'Daemon Prince', factionId: 'XX' }]
    const factions = [{ id: 'XX', name: 'Unknown Faction' }]
    const bsdataUnits = [
      { id: 'b1', name: 'Daemon Prince', faction: 'Chaos Space Marines' },
      { id: 'b2', name: 'Daemon Prince', faction: 'Chaos Daemons' },
    ]

    const { map, matched } = buildIdMapping(datasheets, factions, bsdataUnits)
    expect(map.get('w1')).toBe('b1')
    expect(matched).toBe(1)
  })

  it('returns factionCodeToName map', () => {
    const factions = [
      { id: 'SM', name: 'Space Marines' },
      { id: 'AM', name: 'Astra Militarum' },
    ]
    const { factionCodeToName } = buildIdMapping([], factions, [])
    expect(factionCodeToName.get('SM')).toBe('Space Marines')
    expect(factionCodeToName.get('AM')).toBe('Astra Militarum')
  })
})

describe('rekeyRecords', () => {
  it('replaces datasheetId with mapped ID', () => {
    const records = [
      { id: '1', datasheetId: 'w1', name: 'foo' },
      { id: '2', datasheetId: 'w2', name: 'bar' },
    ]
    const idMap = new Map([['w1', 'b1']])

    const result = rekeyRecords(records, idMap)
    expect(result[0]!.datasheetId).toBe('b1')
    expect(result[1]!.datasheetId).toBe('w2') // unmapped, kept original
  })

  it('supports custom field name', () => {
    const records = [{ id: '1', unitId: 'w1' }]
    const idMap = new Map([['w1', 'b1']])

    const result = rekeyRecords(records, idMap, 'unitId')
    expect(result[0]!.unitId).toBe('b1')
  })
})

describe('rekeyFactionIds', () => {
  it('replaces faction codes with full names', () => {
    const records = [
      { id: '1', factionId: 'SM', name: 'foo' },
      { id: '2', factionId: 'AM', name: 'bar' },
    ]
    const map = new Map([
      ['SM', 'Space Marines'],
      ['AM', 'Astra Militarum'],
    ])

    const result = rekeyFactionIds(records, map)
    expect(result[0]!.factionId).toBe('Space Marines')
    expect(result[1]!.factionId).toBe('Astra Militarum')
  })

  it('keeps original if no mapping', () => {
    const records = [{ id: '1', factionId: 'XX' }]
    const result = rekeyFactionIds(records, new Map())
    expect(result[0]!.factionId).toBe('XX')
  })
})

describe('rekeyLeaderAttachments', () => {
  it('re-keys both leaderId and attachedId', () => {
    const records = [{ id: '1', leaderId: 'w1', attachedId: 'w2' }]
    const idMap = new Map([
      ['w1', 'b1'],
      ['w2', 'b2'],
    ])

    const result = rekeyLeaderAttachments(records, idMap)
    expect(result[0]!.leaderId).toBe('b1')
    expect(result[0]!.attachedId).toBe('b2')
  })

  it('keeps original IDs when unmapped', () => {
    const records = [{ id: '1', leaderId: 'w1', attachedId: 'w2' }]
    const result = rekeyLeaderAttachments(records, new Map())
    expect(result[0]!.leaderId).toBe('w1')
    expect(result[0]!.attachedId).toBe('w2')
  })
})

describe('rekeyAllWahapediaFiles', () => {
  it('re-keys datasheets with both ID and factionId', () => {
    const data: Record<string, unknown[]> = {
      datasheets: [{ id: 'w1', name: 'Unit', factionId: 'SM' }],
    }
    const idMap = new Map([['w1', 'b1']])
    const factionMap = new Map([['SM', 'Space Marines']])

    const result = rekeyAllWahapediaFiles(data, idMap, factionMap)
    const ds = result['datasheets']![0] as Record<string, unknown>
    expect(ds.id).toBe('b1')
    expect(ds.factionId).toBe('Space Marines')
  })

  it('re-keys datasheetId files', () => {
    const data: Record<string, unknown[]> = {
      unit_costs: [{ id: '1', datasheetId: 'w1', cost: '100' }],
    }
    const idMap = new Map([['w1', 'b1']])

    const result = rekeyAllWahapediaFiles(data, idMap, new Map())
    const uc = result['unit_costs']![0] as Record<string, unknown>
    expect(uc.datasheetId).toBe('b1')
  })

  it('re-keys leader_attachments', () => {
    const data: Record<string, unknown[]> = {
      leader_attachments: [{ id: '1', leaderId: 'w1', attachedId: 'w2' }],
    }
    const idMap = new Map([
      ['w1', 'b1'],
      ['w2', 'b2'],
    ])

    const result = rekeyAllWahapediaFiles(data, idMap, new Map())
    const la = result['leader_attachments']![0] as Record<string, unknown>
    expect(la.leaderId).toBe('b1')
    expect(la.attachedId).toBe('b2')
  })

  it('re-keys factionId on detachments', () => {
    const data: Record<string, unknown[]> = {
      detachments: [{ id: '1', factionId: 'SM', name: 'det' }],
    }

    const result = rekeyAllWahapediaFiles(data, new Map(), new Map([['SM', 'Space Marines']]))
    const det = result['detachments']![0] as Record<string, unknown>
    expect(det.factionId).toBe('Space Marines')
  })

  it('passes through unknown file names unchanged', () => {
    const data: Record<string, unknown[]> = {
      custom_data: [{ id: '1', value: 'test' }],
    }

    const result = rekeyAllWahapediaFiles(data, new Map(), new Map())
    expect(result['custom_data']).toEqual([{ id: '1', value: 'test' }])
  })
})
