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
      // Chapter factions — PR B of the scalar-to-ref refactor moves
      // chapter-specific units to their chapter's own factionId. Only the five
      // canonical chapter factions are seeded here; other chapters
      // (Ultramarines, Salamanders, etc.) stay generic SM by design.
      ['blood-angels', 'Blood Angels', 'imperium'],
      ['dark-angels', 'Dark Angels', 'imperium'],
      ['space-wolves', 'Space Wolves', 'imperium'],
      ['black-templars', 'Black Templars', 'imperium'],
      ['deathwatch', 'Deathwatch', 'imperium'],
      ['tyranids', 'Tyranids', 'chaos'],
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
      ['TYR', 'tyranids'],
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

  // Regression: Chaos Rhino (and other dedicated-transport datasheets) were
  // reported to come back with empty `rangedWeapons` + `meleeWeapons` arrays
  // on the unit card. The data-layer join is straightforward
  // (`datasheet_wargear.datasheetId === datasheet.id`) and works for any
  // role. This test locks the join in place against the role string
  // "Dedicated Transports" so a future filter accidentally narrowing by role
  // (e.g., excluding transports) will trip here.
  it('emits weapon nodes for Dedicated Transport datasheets (Chaos Rhino class)', () => {
    const input = makeInput({
      datasheets: [
        {
          id: 'transport-1',
          name: 'Synthetic Transport',
          factionId: 'SM',
          role: 'Dedicated Transports',
          legend: '',
          transport: 'Transport capacity 10.',
          loadout: 'one storm bolter',
          damagedW: '',
          damagedDescription: '',
        },
      ],
      datasheetWargear: [
        {
          id: 1,
          datasheetId: 'transport-1',
          name: 'Storm bolter',
          description: 'Standard transport gun',
          range: '24"',
          type: 'Ranged',
          attacks: '2',
          skill: '4+',
          strength: '4',
          ap: '0',
          damage: '1',
        },
        {
          id: 2,
          datasheetId: 'transport-1',
          name: 'Armoured tracks',
          description: 'Crushes infantry underneath.',
          range: 'Melee',
          type: 'Melee',
          attacks: '3',
          skill: '4+',
          strength: '6',
          ap: '0',
          damage: '1',
        },
      ],
    })

    const { nodes } = convertGameData(input, '2026-06-29')

    const weapons = nodes.filter((n) => n.category === 'weapon' && n.datasheetId === 'transport-1')
    expect(weapons.length).toBe(2)
    const ranged = weapons.find((w) => w.title === 'Storm bolter')
    expect(ranged).toBeDefined()
    expect(ranged!.content).toMatch(/\*\*Type:\*\* Ranged/i)
    const melee = weapons.find((w) => w.title === 'Armoured tracks')
    expect(melee).toBeDefined()
    expect(melee!.content).toMatch(/\*\*Type:\*\* Melee/i)
  })

  it('emits can_support refs for leader_attachments rows tagged type=support (11e)', () => {
    const input = makeInput({
      datasheets: [
        {
          id: 'char-1',
          name: 'Sentinel Captain',
          factionId: 'SM',
          role: 'Character',
          legend: '',
          transport: '',
          loadout: '',
          damagedW: '',
          damagedDescription: '',
        },
        {
          id: 'sup-1',
          name: 'Heavy Weapons Team',
          factionId: 'SM',
          role: 'Battleline',
          legend: '',
          transport: '',
          loadout: '',
          damagedW: '',
          damagedDescription: '',
        },
        {
          id: 'led-1',
          name: 'Sentinel Squad',
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
        // 11e SUPPORT row — emits can_support
        {
          id: 'la-sup',
          leaderId: 'char-1',
          attachedId: 'sup-1',
          type: 'support',
        },
        // 11e LEADER row (explicit type) — still can_lead
        {
          id: 'la-led',
          leaderId: 'char-1',
          attachedId: 'led-1',
          type: 'leader',
        },
      ],
    })

    const { refs } = convertGameData(input, '2026-06-29')

    const supportRef = refs.find((r) => r.rel === 'can_support' && r.targetId === 'sup-1')
    expect(supportRef).toBeDefined()
    expect(supportRef!.sourceId).toBe('char-1')
    expect(supportRef!.context).toContain('SUPPORT')

    const leaderRef = refs.find((r) => r.rel === 'can_lead' && r.targetId === 'led-1')
    expect(leaderRef).toBeDefined()
    expect(leaderRef!.sourceId).toBe('char-1')
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

  describe('chapter faction resolution (PR B of scalar-to-ref refactor)', () => {
    it('Wahapedia chapter keyword rewrites factionId to the chapter slug', () => {
      // Lemartes-style: Wahapedia tags him with the Blood Angels chapter
      // keyword, so his home faction is Blood Angels, not generic Space Marines.
      const input = makeInput({
        datasheets: [
          {
            id: 'lemartes-1',
            name: 'Lemartes',
            factionId: 'SM',
            role: 'Character',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
        ],
        unitKeywords: [
          { id: 'k1', datasheetId: 'lemartes-1', keyword: 'Blood Angels', isFactionKeyword: true },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const ds = nodes.find((n) => n.id === 'lemartes-1')
      expect(ds).toBeDefined()
      expect(ds!.factionId).toBe('blood-angels')
      expect(ds!.subfaction).toBeUndefined()
    })

    it('BSData single-catalog membership rewrites factionId when Wahapedia is silent', () => {
      // Chaplain Grimaldus appears only in the Black Templars catalog. Wahapedia
      // has no chapter keyword for him — BSData single-catalog membership is
      // the discriminator.
      const input = makeInput({
        datasheets: [
          {
            id: 'grimaldus-1',
            name: 'Chaplain Grimaldus',
            factionId: 'SM',
            role: 'Character',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
        ],
      })
      const bsdataSubfactionByKey = new Map<string, Set<string>>([
        ['space-marines::chaplain grimaldus', new Set(['black-templars'])],
      ])
      const { nodes } = convertGameData(input, '2026-04-08', { bsdataSubfactionByKey })
      const ds = nodes.find((n) => n.id === 'grimaldus-1')
      expect(ds).toBeDefined()
      expect(ds!.factionId).toBe('black-templars')
      expect(ds!.subfaction).toBeUndefined()
    })

    it('shared units (appear in 3+ catalogs) stay factionId=space-marines with no chapter tag', () => {
      // Rhino appears in every chapter catalog — shared across the SM pool.
      // No chapter tag should be emitted.
      const input = makeInput({
        datasheets: [
          {
            id: 'rhino-1',
            name: 'Rhino',
            factionId: 'SM',
            role: 'Dedicated Transport',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
        ],
      })
      const bsdataSubfactionByKey = new Map<string, Set<string>>([
        [
          'space-marines::rhino',
          new Set(['blood-angels', 'dark-angels', 'ultramarines', 'black-templars']),
        ],
      ])
      const { nodes } = convertGameData(input, '2026-04-08', { bsdataSubfactionByKey })
      const ds = nodes.find((n) => n.id === 'rhino-1')
      expect(ds).toBeDefined()
      expect(ds!.factionId).toBe('space-marines')
      expect(ds!.subfaction).toBeUndefined()
    })

    it('Wahapedia chapter keyword wins over conflicting BSData catalog membership', () => {
      // Wahapedia's structured chapter data is the higher-quality signal.
      // If Wahapedia says Dark Angels but BSData files the unit under Blood
      // Angels catalog only, trust Wahapedia.
      const input = makeInput({
        datasheets: [
          {
            id: 'conflicted-1',
            name: 'Conflicted Captain',
            factionId: 'SM',
            role: 'Character',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
        ],
        unitKeywords: [
          {
            id: 'k1',
            datasheetId: 'conflicted-1',
            keyword: 'Dark Angels',
            isFactionKeyword: true,
          },
        ],
      })
      const bsdataSubfactionByKey = new Map<string, Set<string>>([
        ['space-marines::conflicted captain', new Set(['blood-angels'])],
      ])
      const { nodes } = convertGameData(input, '2026-04-08', { bsdataSubfactionByKey })
      const ds = nodes.find((n) => n.id === 'conflicted-1')
      expect(ds).toBeDefined()
      expect(ds!.factionId).toBe('dark-angels')
      expect(ds!.subfaction).toBeUndefined()
    })

    it('non-chapter chapter keywords (Ultramarines, Salamanders, etc.) stay space-marines', () => {
      // Ultramarines / Salamanders / etc. aren't canonical factions in
      // dim_faction — only the five canonical chapters (BA/DA/SW/BT/DW) are.
      // Everything else stays generic SM with no chapter tag.
      const input = makeInput({
        datasheets: [
          {
            id: 'adrax-1',
            name: 'Adrax Agatone',
            factionId: 'SM',
            role: 'Character',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
        ],
        unitKeywords: [
          { id: 'k1', datasheetId: 'adrax-1', keyword: 'Salamanders', isFactionKeyword: true },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const ds = nodes.find((n) => n.id === 'adrax-1')
      expect(ds).toBeDefined()
      expect(ds!.factionId).toBe('space-marines')
      expect(ds!.subfaction).toBeUndefined()
    })

    it('non-SM datasheets are unaffected by chapter resolution', () => {
      const input = makeInput({
        datasheets: [
          {
            id: 'hive-tyrant-1',
            name: 'Hive Tyrant',
            factionId: 'TYR',
            role: 'Character',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
        ],
      })
      // Use tyranids alias; the test DB doesn't have Tyranids — factionId will
      // be slugified. What matters is subfaction stays undefined.
      const { nodes } = convertGameData(input, '2026-04-08')
      const ds = nodes.find((n) => n.id === 'hive-tyrant-1')
      expect(ds).toBeDefined()
      expect(ds!.subfaction).toBeUndefined()
    })
  })

  describe('structured Node fields (card-display promotion)', () => {
    it('populates structured wargearOptions on datasheet nodes', () => {
      const input = makeInput({
        datasheets: [
          {
            id: 'ds-w-1',
            name: 'Warlord Squad',
            factionId: 'SM',
            role: 'Infantry',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
        ],
        wargearOptions: [
          {
            id: 'wo-1',
            datasheetId: 'ds-w-1',
            line: '1',
            description: 'Champion: may replace its bolt rifle with a chainsword.',
          },
          {
            id: 'wo-2',
            datasheetId: 'ds-w-1',
            line: '2',
            description: 'Free-form line without name prefix.',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const ds = nodes.find((n) => n.id === 'ds-w-1')
      expect(ds).toBeDefined()
      expect(ds!.wargearOptions).toBeDefined()
      expect(ds!.wargearOptions!.length).toBe(2)
      expect(ds!.wargearOptions![0]).toEqual({
        name: 'Champion',
        description: 'may replace its bolt rifle with a chainsword.',
      })
      expect(ds!.wargearOptions![1]!.name).toContain('Free-form line')
    })

    it('omits wargearOptions when none are present', () => {
      const input = makeInput({
        datasheets: [
          {
            id: 'ds-w-empty',
            name: 'Empty',
            factionId: 'SM',
            role: 'Infantry',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const ds = nodes.find((n) => n.id === 'ds-w-empty')
      expect(ds!.wargearOptions).toBeUndefined()
    })

    it('populates structured damaged block when threshold + effect present', () => {
      const input = makeInput({
        datasheets: [
          {
            id: 'ds-dmg-1',
            name: 'Bracket Tank',
            factionId: 'SM',
            role: 'Vehicle',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '1-4 wounds remaining',
            damagedDescription:
              'While this model has 1-4 wounds remaining, subtract 1 from its Hit rolls.',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const ds = nodes.find((n) => n.id === 'ds-dmg-1')
      expect(ds!.damaged).toEqual({
        threshold: '1-4 wounds remaining',
        effect: 'While this model has 1-4 wounds remaining, subtract 1 from its Hit rolls.',
      })
    })

    it('omits damaged block when no degradation data exists', () => {
      const input = makeInput({
        datasheets: [
          {
            id: 'ds-no-dmg',
            name: 'Infantry Squad',
            factionId: 'SM',
            role: 'Battleline',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const ds = nodes.find((n) => n.id === 'ds-no-dmg')
      expect(ds!.damaged).toBeUndefined()
    })

    it('populates structured stratagem when/target/effect/cpCost/turn', () => {
      const input = makeInput({
        detachments: [
          {
            id: 'det-strat',
            factionId: 'SM',
            name: 'Test Detachment',
            legend: '',
            type: 'Standard',
          },
        ],
        stratagems: [
          {
            id: 'str-1',
            factionId: 'SM',
            detachmentId: 'det-strat',
            name: 'Tactical Reserves',
            type: 'Battle Tactic',
            cpCost: '2',
            turn: 'Your',
            phase: 'Movement',
            legend: '',
            description:
              '**WHEN:** Your Movement phase.\n\n**TARGET:** One Adeptus Astartes unit from your army.\n\n**EFFECT:** Until the end of the phase, that unit can move as if Advancing.',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const strat = nodes.find((n) => n.category === 'stratagem')
      expect(strat).toBeDefined()
      expect(strat!.cpCost).toBe(2)
      expect(strat!.turn).toBe('Your')
      expect(strat!.when).toContain('Movement phase')
      expect(strat!.target).toContain('Adeptus Astartes')
      expect(strat!.effect).toContain('Advancing')
    })

    it('populates enhancement cost as integer points', () => {
      const input = makeInput({
        detachments: [
          {
            id: 'det-enh',
            factionId: 'SM',
            name: 'Test Detachment',
            legend: '',
            type: 'Standard',
          },
        ],
        enhancements: [
          {
            id: 'enh-1',
            factionId: 'SM',
            detachmentId: 'det-enh',
            name: 'Hammer of Wrath',
            legend: '',
            description: 'Improve AP by 1.',
            cost: '25',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const enh = nodes.find((n) => n.category === 'enhancement')
      expect(enh).toBeDefined()
      expect(enh!.cost).toBe(25)
    })

    it('leaves enhancement.cost undefined when Wahapedia cost is non-numeric', () => {
      const input = makeInput({
        detachments: [
          {
            id: 'det-enh-2',
            factionId: 'SM',
            name: 'Test Detachment',
            legend: '',
            type: 'Standard',
          },
        ],
        enhancements: [
          {
            id: 'enh-2',
            factionId: 'SM',
            detachmentId: 'det-enh-2',
            name: 'Mystery Enhancement',
            legend: '',
            description: 'Cost is hidden.',
            cost: '',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const enh = nodes.find((n) => n.category === 'enhancement')
      expect(enh!.cost).toBeUndefined()
    })

    it('populates stratType on stratagem nodes from Wahapedia strat.type', () => {
      const input = makeInput({
        detachments: [
          {
            id: 'det-st-type',
            factionId: 'SM',
            name: 'Test Detachment Type',
            legend: '',
            type: '',
          },
        ],
        stratagems: [
          {
            id: 'strat-bt',
            factionId: 'SM',
            detachmentId: 'det-st-type',
            name: 'Battle Tactic Strat',
            type: 'Battle Tactic',
            cpCost: '2',
            turn: 'Either',
            phase: 'Shooting',
            legend: '',
            description: '<b>WHEN:</b> Shooting. <b>EFFECT:</b> Re-roll hits.',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const strat = nodes.find((n) => n.category === 'stratagem')
      expect(strat).toBeDefined()
      expect(strat!.stratType).toBe('Battle Tactic')
    })

    it('promotes ability-like keywords (SMOKE) to coreAbilities and out of keywords', () => {
      const input = makeInput({
        datasheets: [
          {
            id: 'rhino-1',
            name: 'Chaos Rhino',
            factionId: 'SM',
            role: 'Dedicated Transport',
            legend: '',
            transport: '',
            loadout: 'combi-bolter',
            damagedW: '',
            damagedDescription: '',
          },
        ],
        datasheetModels: [
          {
            id: 1,
            datasheetId: 'rhino-1',
            name: 'Chaos Rhino',
            move: '12"',
            toughness: '9',
            save: '3+',
            wounds: '10',
            leadership: '6+',
            oc: '2',
            invSv: '',
            invSvDescription: '',
          },
        ],
        unitKeywords: [
          { id: 'k1', datasheetId: 'rhino-1', keyword: 'Vehicle', isFactionKeyword: false },
          { id: 'k2', datasheetId: 'rhino-1', keyword: 'Smoke', isFactionKeyword: false },
          { id: 'k3', datasheetId: 'rhino-1', keyword: 'Transport', isFactionKeyword: false },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const ds = nodes.find((n) => n.id === 'rhino-1')!
      // SMOKE is ability-like and must not pollute the keyword row.
      expect(ds.keywords).not.toContain('smoke')
      // But it should appear as a coreAbility chip.
      expect(ds.coreAbilities).toBeDefined()
      const smoke = ds.coreAbilities!.find((c) => c.keyword === 'SMOKE')
      expect(smoke).toBeDefined()
    })

    it('extracts core ability values (FEEL NO PAIN 5+, DEADLY DEMISE D3)', () => {
      const input = makeInput({
        datasheets: [
          {
            id: 'fnp-unit',
            name: 'Tough Unit',
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
            id: 'fnp-a',
            datasheetId: 'fnp-unit',
            name: 'Feel No Pain 5+',
            description: 'Models in this unit have the Feel No Pain 5+ ability.',
            type: 'Core',
            parameter: '5+',
          },
          {
            id: 'dd-a',
            datasheetId: 'fnp-unit',
            name: 'Deadly Demise D3',
            description: 'Roll one D6.',
            type: 'Core',
            parameter: 'D3',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const ds = nodes.find((n) => n.id === 'fnp-unit')!
      expect(ds.coreAbilities).toBeDefined()
      const fnp = ds.coreAbilities!.find((c) => c.keyword === 'FEEL NO PAIN')
      expect(fnp).toBeDefined()
      expect(fnp!.value).toBe('5+')
      const dd = ds.coreAbilities!.find((c) => c.keyword === 'DEADLY DEMISE')
      expect(dd).toBeDefined()
      expect(dd!.value).toBe('D3')
    })

    it('dedups singular/plural keyword chips (dedicated transport vs transports)', () => {
      const input = makeInput({
        datasheets: [
          {
            id: 'dt-unit',
            name: 'DT Vehicle',
            factionId: 'SM',
            role: 'Dedicated Transport',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
        ],
        unitKeywords: [
          {
            id: 'k1',
            datasheetId: 'dt-unit',
            keyword: 'Dedicated Transport',
            isFactionKeyword: false,
          },
          {
            id: 'k2',
            datasheetId: 'dt-unit',
            keyword: 'Dedicated Transports',
            isFactionKeyword: false,
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const ds = nodes.find((n) => n.id === 'dt-unit')!
      const matches = ds.keywords.filter((k) => k.toLowerCase().startsWith('dedicated transport'))
      expect(matches.length).toBe(1)
    })

    // ── Bug-4b regression: SV / LD double-plus ───────────────────────────
    it('does not produce double-plus SV / LD when upstream already includes "+"', () => {
      const input = makeInput({
        datasheets: [
          {
            id: 'termi-1',
            name: 'Captain in Terminator Armour',
            factionId: 'SM',
            role: 'Character',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
            // Mirror the structured Wahapedia/BSData fields onto the
            // datasheet itself — stats are read from `ds.save` etc.
            move: '5"',
            toughness: '5',
            save: '2+',
            wounds: '5',
            leadership: '6+',
            oc: '1',
            invSv: '4+',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const ds = nodes.find((n) => n.id === 'termi-1')!
      expect(ds.stats).toBeDefined()
      expect(ds.stats!.SV).toBe('2+')
      expect(ds.stats!.LD).toBe('6+')
      expect(ds.stats!.invSv).toBe('4+')
      expect(ds.stats!.SV).not.toMatch(/\+\+/)
      expect(ds.stats!.LD).not.toMatch(/\+\+/)
    })

    it('still appends "+" when upstream SV / LD lack the trailing plus', () => {
      const input = makeInput({
        datasheets: [
          {
            id: 'tac-1',
            name: 'Tac Marine',
            factionId: 'SM',
            role: 'Battleline',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
            move: '6"',
            toughness: '4',
            save: '3',
            wounds: '2',
            leadership: '6',
            oc: '2',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const ds = nodes.find((n) => n.id === 'tac-1')!
      expect(ds.stats!.SV).toBe('3+')
      expect(ds.stats!.LD).toBe('6+')
    })

    // ── Parallel 10e/11e dataset support (see lib/duplicate-eleventh.ts) ──

    it('uses wahapediaId as the surface node id when present, ds.id as fallback', () => {
      // Wahapedia JSON now carries a stable numeric id on `wahapediaId` —
      // that's what bookmarks and Vectorize index entries pin to. The
      // surface node id MUST be that numeric, not the BSData hash, so old
      // brain:000000135 links survive. When `wahapediaId` is missing (test
      // fixtures, older snapshots), fall back to `ds.id`.
      const input = makeInput({
        datasheets: [
          {
            id: '5e35-ae82-23e4-bcef',
            wahapediaId: '000000135',
            name: 'Captain in Terminator Armour',
            factionId: 'SM',
            role: 'Character',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
          // Fixture without wahapediaId — fallback to ds.id.
          {
            id: 'no-waha-id',
            name: 'Test Unit',
            factionId: 'SM',
            role: 'Battleline',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-06-29')

      const captain = nodes.find((n) => n.title === 'Captain in Terminator Armour')
      expect(captain).toBeDefined()
      expect(captain!.id).toBe('000000135')
      expect(captain!.datasheetId).toBe('000000135')

      const fallback = nodes.find((n) => n.title === 'Test Unit')
      expect(fallback).toBeDefined()
      expect(fallback!.id).toBe('no-waha-id')
      expect(fallback!.datasheetId).toBe('no-waha-id')
    })

    it('tags every Wahapedia-emitted node with edition: "10th"', () => {
      // The previous deploy regressed by leaving edition unset on Wahapedia
      // nodes and letting the merge-sources default-to-11th gate flip them
      // to 11e — destroying the 10e tag entirely. The parser now stamps
      // '10th' explicitly so the gate never has a chance to default-fix.
      const input = makeInput({
        datasheets: [
          {
            id: 'ds-1',
            name: 'Tac Marine',
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
            datasheetId: 'ds-1',
            name: 'Bolter',
            description: 'rapid fire 1',
            range: '24"',
            type: 'Ranged',
            attacks: '2',
            skill: '3+',
            strength: '4',
            ap: '0',
            damage: '1',
          },
        ],
        unitAbilities: [
          {
            id: 'ua-1',
            datasheetId: 'ds-1',
            name: 'Combat Squads',
            description: 'Split this squad before deployment.',
            type: 'Faction',
          },
        ],
        detachments: [
          {
            id: 'det-1',
            factionId: 'SM',
            name: 'Gladius',
            legend: '',
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
            description: 'Pick a doctrine.',
          },
        ],
        stratagems: [
          {
            id: 'str-1',
            factionId: 'SM',
            detachmentId: 'det-1',
            name: 'Adaptive Strategy',
            type: 'Battle Tactic',
            cpCost: '1',
            turn: 'Either',
            phase: 'Any',
            legend: '',
            description: 'EFFECT: ...',
          },
        ],
        enhancements: [
          {
            id: 'enh-1',
            factionId: 'SM',
            detachmentId: 'det-1',
            name: 'Hammer of Wrath',
            legend: '',
            description: 'Improve AP by 1.',
            cost: '15',
          },
        ],
        abilities: [
          {
            id: 'ab-1',
            name: 'Oath of Moment',
            legend: '',
            factionId: 'SM',
            description: 'Re-roll hits.',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-06-29')
      for (const n of nodes) {
        expect(n.edition, `${n.category} "${n.title}" should be tagged 10th`).toBe('10th')
      }
    })

    it('rewrites internal join refs (weapon→datasheet, ability→datasheet) to use the surface id', () => {
      // When wahapediaId is present, the weapon and ability nodes' part_of
      // refs must point at the surface id, not the BSData hash. Otherwise
      // the refs become orphans during merge.
      const input = makeInput({
        datasheets: [
          {
            id: '5e35-hash',
            wahapediaId: '000000135',
            name: 'Captain',
            factionId: 'SM',
            role: 'Character',
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
            datasheetId: '5e35-hash',
            name: 'Power Sword',
            description: '',
            range: 'Melee',
            type: 'Melee',
            attacks: '5',
            skill: '2+',
            strength: '5',
            ap: '-2',
            damage: '1',
          },
        ],
        unitAbilities: [
          {
            id: 'ua-1',
            datasheetId: '5e35-hash',
            name: 'Rites of Battle',
            description: 'Aura ability.',
            type: 'Faction',
          },
        ],
      })
      const { nodes, refs } = convertGameData(input, '2026-06-29')

      // Weapon node id is built off the surface id.
      const weapon = nodes.find((n) => n.category === 'weapon')!
      expect(weapon.id).toBe('weapon:000000135:power-sword')
      expect(weapon.datasheetId).toBe('000000135')

      // Weapon → datasheet part_of ref uses surface id.
      const weaponPartOf = refs.find(
        (r) => r.rel === 'part_of' && r.sourceId === 'weapon:000000135:power-sword',
      )!
      expect(weaponPartOf.targetId).toBe('000000135')

      // Ability node + part_of ref both translated.
      const ability = nodes.find((n) => n.category === 'unit-ability')!
      expect(ability.id).toBe('ability:000000135:rites-of-battle')
      expect(ability.datasheetId).toBe('000000135')
      const abilityPartOf = refs.find(
        (r) => r.rel === 'part_of' && r.sourceId === 'ability:000000135:rites-of-battle',
      )!
      expect(abilityPartOf.targetId).toBe('000000135')
    })

    it('rewrites leader_attachment refs to use surface ids', () => {
      const input = makeInput({
        datasheets: [
          {
            id: 'led-hash',
            wahapediaId: '000001234',
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
            id: 'unit-hash',
            wahapediaId: '000005678',
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
            leaderId: 'led-hash',
            attachedId: 'unit-hash',
          },
        ],
      })
      const { refs } = convertGameData(input, '2026-06-29')
      const ref = refs.find((r) => r.rel === 'can_lead')!
      expect(ref.sourceId).toBe('000001234')
      expect(ref.targetId).toBe('000005678')
    })

    it('exposes bsdataIdToSurfaceId for downstream consumers (MFM, duplicate-eleventh)', () => {
      const input = makeInput({
        datasheets: [
          {
            id: '5e35-hash',
            wahapediaId: '000000135',
            name: 'Captain',
            factionId: 'SM',
            role: 'Character',
            legend: '',
            transport: '',
            loadout: '',
            damagedW: '',
            damagedDescription: '',
          },
        ],
      })
      const result = convertGameData(input, '2026-06-29')
      expect(result.bsdataIdToSurfaceId.get('5e35-hash')).toBe('000000135')
    })

    it('populates attachesTo on enhancement nodes (sniffed from description)', () => {
      const input = makeInput({
        detachments: [
          {
            id: 'det-attach',
            factionId: 'SM',
            name: 'Test Det Attach',
            legend: '',
            type: '',
          },
        ],
        enhancements: [
          {
            id: 'enh-leader',
            factionId: 'SM',
            detachmentId: 'det-attach',
            name: 'Leader Enhancement',
            legend: '',
            description: 'Chaplain model only. The bearer gains +1 attack.',
            cost: '15',
          },
          {
            id: 'enh-unit',
            factionId: 'SM',
            detachmentId: 'det-attach',
            name: 'Unit Enhancement',
            legend: '',
            description: "Models in the bearer's unit have +1 strength.",
            cost: '20',
          },
        ],
      })
      const { nodes } = convertGameData(input, '2026-04-08')
      const leader = nodes.find((n) => n.title === 'Leader Enhancement')
      const unit = nodes.find((n) => n.title === 'Unit Enhancement')
      expect(leader!.attachesTo).toBe('leader')
      expect(unit!.attachesTo).toBe('unit')
    })
  })
})
