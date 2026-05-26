import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadFactionCodes, resetFactionCodes } from '../faction-codes'
import type { GameDataInput } from './game-data'
import { convertGameData } from './game-data'

function makeInput(overrides: Partial<GameDataInput> = {}): GameDataInput {
  return {
    datasheets: [],
    datasheetWargear: [],
    datasheetModels: [],
    unitAbilities: [],
    abilities: [],
    detachments: [],
    detachmentAbilities: [],
    stratagems: [],
    enhancements: [],
    unitKeywords: [],
    unitCompositions: [],
    unitCosts: [],
    wargearOptions: [],
    leaderAttachments: [],
    datasheetStratagems: [],
    datasheetEnhancements: [],
    datasheetDetachmentAbilities: [],
    ...overrides,
  }
}

describe('convertGameData', () => {
  beforeAll(async () => {
    const client = createClient({ url: ':memory:' })
    const db = createDbFromClient(client)
    await client.execute(
      'CREATE TABLE dim_faction (id TEXT PRIMARY KEY, name TEXT NOT NULL, allegiance TEXT NOT NULL)',
    )
    await client.execute(
      'CREATE TABLE dim_faction_alias (alias TEXT PRIMARY KEY, faction_id TEXT NOT NULL)',
    )
    const factions = [
      ['space-marines', 'Space Marines', 'imperium'],
      ['adeptus-titanicus', 'Adeptus Titanicus', 'imperium'],
    ]
    for (const [id, name, alleg] of factions) {
      await client.execute({
        sql: 'INSERT INTO dim_faction VALUES (?, ?, ?)',
        args: [id!, name!, alleg!],
      })
    }
    const aliases = [
      ['SM', 'space-marines'],
      ['AT', 'adeptus-titanicus'],
    ]
    for (const [alias, fid] of aliases) {
      await client.execute({
        sql: 'INSERT INTO dim_faction_alias VALUES (?, ?)',
        args: [alias!, fid!],
      })
    }
    await loadFactionCodes(db)
  })

  afterAll(() => {
    resetFactionCodes()
  })

  it('converts datasheets to unit/datasheet nodes', () => {
    const input = makeInput({
      datasheets: [
        {
          id: 'abc-123',
          name: 'Intercessor Squad',
          factionId: 'SM',
          role: 'Battleline',
          legend: '',
          transport: '',
          loadout: 'Standard',
          damagedW: '',
          damagedDescription: '',
        },
      ],
      datasheetModels: [
        {
          id: 1,
          datasheetId: 'abc-123',
          name: 'Intercessor',
          move: '6"',
          toughness: '4',
          save: '3+',
          wounds: '2',
          leadership: '6+',
          oc: '2',
          invSv: '',
          invSvDescription: '',
        },
      ],
      unitKeywords: [
        { id: 'k1', datasheetId: 'abc-123', keyword: 'Infantry', isFactionKeyword: false },
        { id: 'k2', datasheetId: 'abc-123', keyword: 'Adeptus Astartes', isFactionKeyword: true },
      ],
    })

    const { nodes } = convertGameData(input, '2026-04-08')

    const ds = nodes.find((n) => n.id === 'abc-123')
    expect(ds).toBeDefined()
    expect(ds!.layer).toBe('unit')
    expect(ds!.category).toBe('datasheet')
    expect(ds!.title).toBe('Intercessor Squad')
    expect(ds!.factionId).toBe('space-marines')
    expect(ds!.content).toContain('M6"')
    expect(ds!.content).toContain('Infantry')
    expect(ds!.keywords).toContain('infantry')
    expect(ds!.keywords).toContain('battleline')
  })

  it('converts weapons to unit/weapon nodes with part_of refs', () => {
    const input = makeInput({
      datasheets: [
        {
          id: 'abc-123',
          name: 'Intercessor Squad',
          factionId: 'SM',
          role: 'Battleline',
          legend: '',
          transport: '',
          loadout: '',
          damagedW: '',
          damagedDescription: '',
        },
      ],
      datasheetWargear: [
        {
          id: 1,
          datasheetId: 'abc-123',
          name: 'Bolt Rifle',
          description: 'Standard bolt weapon',
          range: '30"',
          type: 'Ranged',
          attacks: '2',
          skill: '3+',
          strength: '4',
          ap: '-1',
          damage: '1',
        },
      ],
    })

    const { nodes, refs } = convertGameData(input, '2026-04-08')

    const weapon = nodes.find((n) => n.category === 'weapon')
    expect(weapon).toBeDefined()
    expect(weapon!.id).toBe('weapon:abc-123:bolt-rifle')
    expect(weapon!.title).toBe('Bolt Rifle')
    expect(weapon!.content).toContain('**S:** 4')

    const partOf = refs.find((r) => r.rel === 'part_of' && r.targetId === 'abc-123')
    expect(partOf).toBeDefined()
    expect(partOf!.context).toContain('Bolt Rifle')
  })

  it('converts unit abilities with part_of refs', () => {
    const input = makeInput({
      datasheets: [
        {
          id: 'abc-123',
          name: 'Intercessor Squad',
          factionId: 'SM',
          role: 'Battleline',
          legend: '',
          transport: '',
          loadout: '',
          damagedW: '',
          damagedDescription: '',
        },
      ],
      unitAbilities: [
        {
          id: 'ua1',
          datasheetId: 'abc-123',
          name: 'Oath of Moment',
          description: 'Re-roll hit and wound rolls against your Oath of Moment target.',
          type: 'Faction',
        },
      ],
    })

    const { nodes, refs } = convertGameData(input, '2026-04-08')

    const ability = nodes.find((n) => n.category === 'unit-ability')
    expect(ability).toBeDefined()
    expect(ability!.id).toBe('ability:abc-123:oath-of-moment')
    expect(ability!.content).toContain('Re-roll')

    const partOf = refs.find((r) => r.rel === 'part_of' && r.targetId === 'abc-123')
    expect(partOf).toBeDefined()
  })

  it('converts army rules (abilities) to faction/army-rule nodes', () => {
    const input = makeInput({
      abilities: [
        {
          id: 'ab-001',
          name: 'Oath of Moment',
          legend: '',
          factionId: 'SM',
          description:
            'At the start of your Command phase, select one enemy unit. Re-roll hit and wound rolls of 1 against that unit.',
        },
      ],
    })

    const { nodes } = convertGameData(input, '2026-04-08')

    const armyRule = nodes.find((n) => n.title === 'Oath of Moment' && n.layer === 'faction')
    expect(armyRule).toBeDefined()
    // Army-wide gameplay rules are classified as 'army-rule' (not 'faction-ability',
    // which is now reserved for detachment-scoped abilities).
    expect(armyRule!.category).toBe('army-rule')
    expect(armyRule!.factionId).toBe('space-marines')
    expect(armyRule!.content).toContain('Command phase')
  })

  it('skips abilities with empty factionId (core/basic rules)', () => {
    const input = makeInput({
      abilities: [
        {
          id: 'ab-core-1',
          name: 'Deep Strike',
          legend: '',
          factionId: '',
          description: 'During the Declare Battle Formations step...',
        },
        {
          id: 'ab-core-2',
          name: 'Deadly Demise',
          legend: '',
          factionId: '',
          description: 'When this model is destroyed...',
        },
        {
          id: 'ab-core-3',
          name: 'Feel No Pain',
          legend: '',
          factionId: '',
          description: 'Each time this model would lose a wound...',
        },
        {
          id: 'ab-real',
          name: 'Oath of Moment',
          legend: '',
          factionId: 'SM',
          description: 'Re-roll hits.',
        },
      ],
    })

    const { nodes } = convertGameData(input, '2026-04-08')

    // Core rules (empty factionId) should NOT appear as army-rule nodes
    expect(
      nodes.find((n) => n.title === 'Deep Strike' && n.category === 'army-rule'),
    ).toBeUndefined()
    expect(
      nodes.find((n) => n.title === 'Deadly Demise' && n.category === 'army-rule'),
    ).toBeUndefined()
    expect(
      nodes.find((n) => n.title === 'Feel No Pain' && n.category === 'army-rule'),
    ).toBeUndefined()

    // Real army rule should still exist
    expect(
      nodes.find((n) => n.title === 'Oath of Moment' && n.category === 'army-rule'),
    ).toBeDefined()
  })

  it('skips Designer\u2019s Note abilities', () => {
    const input = makeInput({
      abilities: [
        {
          id: 'ab-dn',
          name: 'Designer\u2019s Note',
          legend: '',
          factionId: 'AT',
          description: 'This is a clarification.',
        },
        {
          id: 'ab-real',
          name: 'Towering Example',
          legend: '',
          factionId: 'AT',
          description: 'This unit can...',
        },
      ],
    })

    const { nodes } = convertGameData(input, '2026-04-08')

    expect(
      nodes.find((n) => n.title === 'Designer\u2019s Note' && n.category === 'army-rule'),
    ).toBeUndefined()
    expect(
      nodes.find((n) => n.title === 'Towering Example' && n.category === 'army-rule'),
    ).toBeDefined()
  })

  it('converts detachments with abilities, stratagems, and enhancements', () => {
    const input = makeInput({
      detachments: [
        {
          id: 'det-1',
          factionId: 'SM',
          name: 'Gladius Task Force',
          legend: 'The classic Space Marine detachment.',
          type: 'Standard',
        },
      ],
      detachmentAbilities: [
        {
          id: 'da-1',
          detachmentId: 'det-1',
          factionId: 'SM',
          name: 'Combat Doctrines',
          legend: '',
          description: 'At the start of your Command phase, you can select a Combat Doctrine.',
        },
      ],
      stratagems: [
        {
          id: 'str-1',
          factionId: 'SM',
          detachmentId: 'det-1',
          name: 'Armour of Contempt',
          type: 'Battle Tactic',
          cpCost: '1CP',
          turn: 'Either',
          phase: 'Shooting/Fight',
          legend: '',
          description: 'Worsen the AP of attacks against your unit by 1.',
        },
      ],
      enhancements: [
        {
          id: 'enh-1',
          factionId: 'SM',
          detachmentId: 'det-1',
          name: 'Artificer Armour',
          legend: '',
          description: 'The bearer has a 2+ Save and FNP 5+.',
          cost: '10',
        },
      ],
    })

    const { nodes, refs } = convertGameData(input, '2026-04-08')

    // Detachment node
    const det = nodes.find((n) => n.category === 'detachment-rule')
    expect(det).toBeDefined()
    expect(det!.title).toBe('Gladius Task Force')
    expect(det!.id).toBe('det:space-marines:gladius-task-force')

    // Detachment ability
    const da = nodes.find((n) => n.title === 'Combat Doctrines' && n.category === 'faction-ability')
    expect(da).toBeDefined()

    // Stratagem
    const strat = nodes.find((n) => n.category === 'stratagem')
    expect(strat).toBeDefined()
    expect(strat!.title).toBe('Armour of Contempt')
    expect(strat!.content).toContain('1CP')
    expect(strat!.phase).toBe('shooting')

    // Enhancement
    const enh = nodes.find((n) => n.category === 'enhancement')
    expect(enh).toBeDefined()
    expect(enh!.title).toBe('Artificer Armour')
    expect(enh!.content).toContain('10')

    // All should have part_of refs to detachment
    const partOfDet = refs.filter((r) => r.rel === 'part_of' && r.targetId === det!.id)
    expect(partOfDet.length).toBe(3) // ability + stratagem + enhancement
  })

  it('creates leader attachment refs', () => {
    const input = makeInput({
      datasheets: [
        {
          id: 'leader-1',
          name: 'Captain',
          factionId: 'SM',
          role: 'Character',
          legend: '',
          transport: '',
          loadout: '',
          damagedW: '',
          damagedDescription: '',
        },
        {
          id: 'unit-1',
          name: 'Intercessors',
          factionId: 'SM',
          role: 'Battleline',
          legend: '',
          transport: '',
          loadout: '',
          damagedW: '',
          damagedDescription: '',
        },
      ],
      leaderAttachments: [
        {
          id: 'la-1',
          leaderId: 'leader-1',
          attachedId: 'unit-1',
        },
      ],
    })

    const { refs } = convertGameData(input, '2026-04-08')

    // Leader attachments use the `can_lead` ref (bidirectional leader ↔ unit).
    const attachRef = refs.find((r) => r.rel === 'can_lead' && r.targetId === 'unit-1')
    expect(attachRef).toBeDefined()
    expect(attachRef!.sourceId).toBe('leader-1')
    expect(attachRef!.context).toContain('attached')
  })

  it('extracts weapon keywords from description', () => {
    const input = makeInput({
      datasheets: [
        {
          id: 'abc',
          name: 'Unit',
          factionId: 'SM',
          role: 'Infantry',
          legend: '',
          transport: '',
          loadout: '',
          damagedW: '',
          damagedDescription: '',
        },
      ],
      datasheetWargear: [
        {
          id: 1,
          datasheetId: 'abc',
          name: 'Plasma Gun',
          description: '[RAPID FIRE 1, HAZARDOUS, MELTA 2]',
          range: '24"',
          type: 'Ranged',
          attacks: '1',
          skill: '3+',
          strength: '7',
          ap: '-2',
          damage: '1',
        },
      ],
    })

    const { nodes } = convertGameData(input, '2026-04-08')
    const weapon = nodes.find((n) => n.category === 'weapon')
    expect(weapon!.keywords).toContain('rapid fire')
    expect(weapon!.keywords).toContain('melta')
  })

  it('creates requires refs from weapon abilities to core rules nodes', () => {
    const input = makeInput({
      datasheets: [
        {
          id: 'abc',
          name: 'Unit',
          factionId: 'SM',
          role: 'Infantry',
          legend: '',
          transport: '',
          loadout: '',
          damagedW: '',
          damagedDescription: '',
        },
      ],
      datasheetWargear: [
        {
          id: 1,
          datasheetId: 'abc',
          name: 'Heavy Bolter',
          description: 'heavy, sustained hits 1',
          range: '36"',
          type: 'Ranged',
          attacks: '3',
          skill: '4+',
          strength: '5',
          ap: '-1',
          damage: '2',
        },
      ],
    })

    const { refs } = convertGameData(input, '2026-04-08')

    const sustainedRef = refs.find(
      (r) => r.rel === 'requires' && r.targetId === 'core:sustained-hits',
    )
    expect(sustainedRef).toBeDefined()
    expect(sustainedRef!.context).toContain('Sustained Hits')
    expect(sustainedRef!.context).toContain('Heavy Bolter')
  })

  it('creates requires refs from unit abilities to core rules nodes', () => {
    const input = makeInput({
      datasheets: [
        {
          id: 'abc',
          name: 'Unit',
          factionId: 'SM',
          role: 'Infantry',
          legend: '',
          transport: '',
          loadout: '',
          damagedW: '',
          damagedDescription: '',
        },
      ],
      unitAbilities: [
        {
          id: 'ua1',
          datasheetId: 'abc',
          name: 'Deep Strike',
          description: 'This unit can be set up using the Deep Strike ability.',
          type: 'Core',
        },
      ],
    })

    const { refs } = convertGameData(input, '2026-04-08')
    const dsRef = refs.find((r) => r.rel === 'requires' && r.targetId === 'core:deep-strike')
    expect(dsRef).toBeDefined()
    expect(dsRef!.sourceId).toBe('ability:abc:deep-strike')
  })

  it('creates interacts_with refs from stratagems that grant abilities', () => {
    const input = makeInput({
      detachments: [
        {
          id: 'det-1',
          factionId: 'SM',
          name: 'Gladius',
          legend: '',
          type: 'Standard',
        },
      ],
      stratagems: [
        {
          id: 'str-1',
          factionId: 'SM',
          detachmentId: 'det-1',
          name: 'Adaptive Strategy',
          type: 'Battle Tactic',
          cpCost: '1CP',
          turn: 'Your',
          phase: 'Shooting',
          legend: '',
          description:
            'Until the end of the phase, ranged weapons equipped by models in your unit have the [SUSTAINED HITS 1] ability.',
        },
      ],
    })

    const { refs } = convertGameData(input, '2026-04-08')
    const susRef = refs.find(
      (r) => r.rel === 'interacts_with' && r.targetId === 'core:sustained-hits',
    )
    expect(susRef).toBeDefined()
    expect(susRef!.sourceId).toBe('det:space-marines:gladius:adaptive-strategy')
    expect(susRef!.context).toContain('Adaptive Strategy')
    expect(susRef!.context).toContain('Sustained Hits')
  })

  it('creates interacts_with refs from detachment abilities that reference mechanics', () => {
    const input = makeInput({
      detachments: [
        {
          id: 'det-1',
          factionId: 'SM',
          name: 'Firestorm',
          legend: '',
          type: 'Standard',
        },
      ],
      detachmentAbilities: [
        {
          id: 'da-1',
          detachmentId: 'det-1',
          factionId: 'SM',
          name: 'Close-range Eradication',
          legend: '',
          description:
            'Ranged weapons equipped by models in your army have the [LETHAL HITS] ability while targeting units within 12".',
        },
      ],
    })

    const { refs } = convertGameData(input, '2026-04-08')
    const lhRef = refs.find((r) => r.rel === 'interacts_with' && r.targetId === 'core:lethal-hits')
    expect(lhRef).toBeDefined()
    expect(lhRef!.sourceId).toBe('det:space-marines:firestorm:close-range-eradication')
  })

  it('handles empty input gracefully', () => {
    const { nodes, refs } = convertGameData(makeInput(), '2026-04-08')
    expect(nodes).toHaveLength(0)
    expect(refs).toHaveLength(0)
  })
})
