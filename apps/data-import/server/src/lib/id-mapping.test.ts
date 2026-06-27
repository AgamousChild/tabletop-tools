import { describe, expect, it } from 'vitest'

import {
  buildIdMapping,
  buildMfmUnitIdMapping,
  canonicalContentId,
  mfmUnitMapKey,
  normalizeName,
  rekeyAllWahapediaFiles,
  rekeyFactionIds,
  rekeyLeaderAttachments,
  rekeyRecords,
  validateContentIds,
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

describe('canonicalContentId', () => {
  it('anchors the canonical id to the given source id, namespaced by type', () => {
    expect(canonicalContentId('ability', 'A1')).toBe('ability:A1')
    expect(canonicalContentId('stratagem', 'S5')).toBe('stratagem:S5')
    expect(canonicalContentId('enhancement', 'E9')).toBe('enhancement:E9')
    expect(canonicalContentId('detachment_ability', 'DA2')).toBe('detachment_ability:DA2')
    expect(canonicalContentId('mission', 'M3')).toBe('mission:M3')
  })

  it('is deterministic — same source id yields the same canonical id every run', () => {
    expect(canonicalContentId('ability', 'A1')).toBe(canonicalContentId('ability', 'A1'))
  })
})

describe('buildIdMapping — ambiguity reporting', () => {
  it('flags ambiguous matches where faction disambiguation fell back to the first candidate', () => {
    const datasheets = [{ id: 'w1', name: 'Daemon Prince', factionId: 'XX' }]
    const factions = [{ id: 'XX', name: 'Unknown Faction' }]
    const bsdataUnits = [
      { id: 'b1', name: 'Daemon Prince', faction: 'Chaos Space Marines' },
      { id: 'b2', name: 'Daemon Prince', faction: 'Chaos Daemons' },
    ]
    const { matched, ambiguous } = buildIdMapping(datasheets, factions, bsdataUnits)
    expect(matched).toBe(1)
    expect(ambiguous).toBe(1)
  })

  it('does not flag a clean faction-disambiguated match as ambiguous', () => {
    const datasheets = [{ id: 'w1', name: 'Daemon Prince', factionId: 'CSM' }]
    const factions = [{ id: 'CSM', name: 'Chaos Space Marines' }]
    const bsdataUnits = [
      { id: 'b1', name: 'Daemon Prince', faction: 'Chaos Space Marines' },
      { id: 'b2', name: 'Daemon Prince', faction: 'Chaos Daemons' },
    ]
    const { ambiguous } = buildIdMapping(datasheets, factions, bsdataUnits)
    expect(ambiguous).toBe(0)
  })
})

describe('provenance — given ids are kept, never discarded', () => {
  it('keeps the original Wahapedia id on datasheets re-keyed to a BSData id', () => {
    const data: Record<string, unknown[]> = {
      datasheets: [{ id: 'w1', name: 'Unit', factionId: 'SM' }],
    }
    const result = rekeyAllWahapediaFiles(
      data,
      new Map([['w1', 'b1']]),
      new Map([['SM', 'Space Marines']]),
    )
    const ds = result['datasheets']![0] as Record<string, unknown>
    expect(ds.id).toBe('b1') // canonical key (BSData)
    expect(ds.canonicalId).toBe('b1')
    expect(ds.wahapediaId).toBe('w1') // given id preserved for verification
    expect(ds.bsdataId).toBe('b1')
  })

  it('keeps the original id on an unmatched datasheet (no silent loss)', () => {
    const data: Record<string, unknown[]> = {
      datasheets: [{ id: 'w9', name: 'Unmatched', factionId: 'SM' }],
    }
    const result = rekeyAllWahapediaFiles(data, new Map(), new Map())
    const ds = result['datasheets']![0] as Record<string, unknown>
    expect(ds.id).toBe('w9')
    expect(ds.wahapediaId).toBe('w9')
    expect(ds.canonicalId).toBe('w9')
    expect(ds.bsdataId).toBeUndefined()
  })

  it('adds canonicalId + wahapediaId to ability/stratagem/enhancement/detachment_ability/mission without changing id', () => {
    const data: Record<string, unknown[]> = {
      abilities: [{ id: 'A1', name: 'Oath', factionId: 'SM' }],
      stratagems: [{ id: 'S1', name: 'Strat', factionId: 'SM' }],
      enhancements: [{ id: 'E1', name: 'Enh', factionId: 'SM' }],
      detachment_abilities: [{ id: 'DA1', name: 'Det', factionId: 'SM' }],
      missions: [{ id: 'M1', name: 'Take and Hold', type: 'primary' }],
    }
    const result = rekeyAllWahapediaFiles(data, new Map(), new Map([['SM', 'Space Marines']]))
    const ab = result['abilities']![0] as Record<string, unknown>
    expect(ab.id).toBe('A1') // existing key unchanged (no consumer break)
    expect(ab.canonicalId).toBe('ability:A1')
    expect(ab.wahapediaId).toBe('A1')
    expect(ab.factionId).toBe('Space Marines') // existing rekey still applies
    expect((result['stratagems']![0] as Record<string, unknown>).canonicalId).toBe('stratagem:S1')
    expect((result['enhancements']![0] as Record<string, unknown>).canonicalId).toBe(
      'enhancement:E1',
    )
    expect((result['detachment_abilities']![0] as Record<string, unknown>).canonicalId).toBe(
      'detachment_ability:DA1',
    )
    const ms = result['missions']![0] as Record<string, unknown>
    expect(ms.id).toBe('M1') // unchanged — 11th-leak ids stay stable
    expect(ms.canonicalId).toBe('mission:M1')
    expect(ms.wahapediaId).toBe('M1')
  })
})

describe('validateContentIds — surfaces broken references instead of silently dropping them', () => {
  it('counts resolved vs unresolved references across the content set', () => {
    const data: Record<string, unknown[]> = {
      abilities: [{ id: 'A1' }],
      stratagems: [{ id: 'S1' }],
      enhancements: [{ id: 'E1' }],
      detachment_abilities: [{ id: 'DA1' }],
      unit_abilities: [
        { id: 'x', datasheetId: 'd', abilityId: 'A1' }, // resolved
        { id: 'y', datasheetId: 'd', abilityId: '' }, // inline ability — skipped
      ],
      datasheet_stratagems: [
        { id: 'd-S1', datasheetId: 'd', stratagemId: 'S1' }, // resolved
        { id: 'd-S9', datasheetId: 'd', stratagemId: 'S9' }, // unresolved
      ],
      datasheet_enhancements: [{ id: 'd-E1', datasheetId: 'd', enhancementId: 'E1' }], // resolved
      datasheet_detachment_abilities: [
        { id: 'd-DA1', datasheetId: 'd', detachmentAbilityId: 'DA1' }, // resolved
      ],
    }
    const { matched, unmatched, byType } = validateContentIds(data)
    expect(matched).toBe(4)
    expect(unmatched).toBe(1)
    expect(byType.stratagem).toEqual({ matched: 1, unmatched: 1 })
    expect(byType.ability).toEqual({ matched: 1, unmatched: 0 })
  })
})

describe('buildMfmUnitIdMapping', () => {
  it('joins MFM (factionSlug, name) to BSData datasheet ids', () => {
    const mfmFactions = [
      {
        slug: 'space-marines',
        units: [{ name: 'Intercessor Squad' }, { name: 'Captain' }],
      },
      { slug: 'tyranids', units: [{ name: 'Hormagaunts' }] },
    ]
    const bsdataUnits = [
      { id: 'sm-int', name: 'Intercessor Squad', factionSlug: 'space-marines' },
      { id: 'sm-cap', name: 'Captain', factionSlug: 'space-marines' },
      { id: 'ty-horm', name: 'Hormagaunts', factionSlug: 'tyranids' },
    ]
    const { map, matched, unmatched, ambiguous } = buildMfmUnitIdMapping(mfmFactions, bsdataUnits)
    expect(matched).toBe(3)
    expect(unmatched).toBe(0)
    expect(ambiguous).toBe(0)
    expect(map.get(mfmUnitMapKey('space-marines', 'Intercessor Squad'))).toBe('sm-int')
    expect(map.get(mfmUnitMapKey('tyranids', 'Hormagaunts'))).toBe('ty-horm')
  })

  it('counts unmatched MFM units instead of throwing', () => {
    const mfmFactions = [{ slug: 'space-marines', units: [{ name: 'Brand New Unit' }] }]
    const bsdataUnits: Array<{ id: string; name: string; factionSlug: string }> = []
    const { map, matched, unmatched } = buildMfmUnitIdMapping(mfmFactions, bsdataUnits)
    expect(matched).toBe(0)
    expect(unmatched).toBe(1)
    expect(map.size).toBe(0)
  })

  it('does not cross-match identical names across factions', () => {
    const mfmFactions = [
      { slug: 'space-marines', units: [{ name: 'Captain' }] },
      { slug: 'chaos-space-marines', units: [{ name: 'Captain' }] },
    ]
    const bsdataUnits = [
      { id: 'sm-cap', name: 'Captain', factionSlug: 'space-marines' },
      { id: 'csm-cap', name: 'Captain', factionSlug: 'chaos-space-marines' },
    ]
    const { map, matched, ambiguous } = buildMfmUnitIdMapping(mfmFactions, bsdataUnits)
    expect(matched).toBe(2)
    expect(ambiguous).toBe(0)
    expect(map.get(mfmUnitMapKey('space-marines', 'Captain'))).toBe('sm-cap')
    expect(map.get(mfmUnitMapKey('chaos-space-marines', 'Captain'))).toBe('csm-cap')
  })

  it('flags ambiguous matches when same key collides on multiple BSData ids', () => {
    const mfmFactions = [{ slug: 'space-marines', units: [{ name: 'Captain' }] }]
    const bsdataUnits = [
      { id: 'sm-cap-a', name: 'Captain', factionSlug: 'space-marines' },
      { id: 'sm-cap-b', name: 'Captain', factionSlug: 'space-marines' },
    ]
    const { matched, ambiguous } = buildMfmUnitIdMapping(mfmFactions, bsdataUnits)
    expect(matched).toBe(1)
    expect(ambiguous).toBe(1)
  })

  it('uses the same name normalization as the Wahapedia mapper', () => {
    // Curly apostrophe in MFM vs straight in BSData should still match.
    const mfmFactions = [{ slug: 'death-guard', units: [{ name: 'Mortarion’s Anvil' }] }]
    const bsdataUnits = [{ id: 'dg-anvil', name: "Mortarion's Anvil", factionSlug: 'death-guard' }]
    const { matched, map } = buildMfmUnitIdMapping(mfmFactions, bsdataUnits)
    expect(matched).toBe(1)
    expect(map.get(mfmUnitMapKey('death-guard', 'Mortarion’s Anvil'))).toBe('dg-anvil')
  })
})
