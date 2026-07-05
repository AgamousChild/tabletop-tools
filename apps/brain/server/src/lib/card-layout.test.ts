import { describe, expect, it } from 'vitest'

import type { CardLayout } from './card-layout'
import { buildDatasheetLayout } from './card-layout'
import type { Node } from './model'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const warbossNode: Node = {
  id: '000000001',
  layer: 'unit',
  category: 'datasheet',
  title: 'Warboss',
  content:
    '**Derived Type:** Character\n\nWarboss: M6" T5 Sv4+ W6 Ld6+ OC1 5++\n\n**Role:** Characters\n\n**Keywords:** Orks, Infantry, Warboss, Character, Grenades\n\n**Faction Keywords:** Orks\n\n**Composition:** 1 Warboss\n\n**Points:** 1 model: 75pts\n\n**Loadout:** This model is equipped with: kombi-weapon; twin slugga; big choppa.\n\n**Wargear Options:**\n• This model\'s big choppa can be replaced with 1 power klaw.',
  summary: 'Orks: Warboss — Characters, 1 model: 75pts.',
  factionId: 'orks',
  datasheetId: '000000001',
  stats: {
    M: '6"',
    T: 5,
    SV: '4+',
    W: 6,
    LD: '6+',
    OC: 1,
    invSv: '5+',
  },
  points: [{ models: '1 model', cost: 75 }],
  sources: [
    { type: 'wahapedia', title: 'Wahapedia 10th', retrievedAt: '2026-05-15T00:00:00.000Z' },
  ],
  refs: [],
  version: 1,
  keywords: [
    'orks',
    'infantry',
    'warboss',
    'character',
    'grenades',
    't5',
    'toughness-5',
    'sv4+',
    'save-4',
    'invuln-5+',
    'w6',
    'wounds-6',
    'pts-75',
    'type:character',
  ],
  factionName: 'ORKS',
}

const kombiWeaponNode: Node = {
  id: 'weapon:000000001:kombi-weapon',
  layer: 'unit',
  category: 'weapon',
  title: 'Kombi-weapon',
  content:
    '**Range:** 24 | **Type:** Ranged\n**A:** 1 | **BS/WS:** 5 | **S:** 4 | **AP:** 0 | **D:** 1\n\nanti-infantry 4+, devastating wounds, rapid fire 1',
  summary:
    'Kombi-weapon (Ranged) — 24, 1A, S4, AP0, D1. [anti-infantry 4+] [devastating wounds] [rapid fire 1]',
  factionId: 'orks',
  datasheetId: '000000001',
  weaponStats: { range: '24', A: '1', skill: '5', S: 4, AP: 0, D: '1' },
  sources: [
    { type: 'wahapedia', title: 'Wahapedia 10th', retrievedAt: '2026-05-15T00:00:00.000Z' },
  ],
  refs: [],
  version: 1,
  keywords: ['ranged', 'rapid fire', 'devastating wounds'],
}

const bigChoppaNode: Node = {
  id: 'weapon:000000001:big-choppa',
  layer: 'unit',
  category: 'weapon',
  title: 'Big choppa',
  content:
    '**Range:** Melee | **Type:** Melee\n**A:** 4 | **BS/WS:** 3 | **S:** 7 | **AP:** -2 | **D:** 2',
  summary: 'Big choppa (Melee) — Melee, 4A, S7, AP-2, D2.',
  factionId: 'orks',
  datasheetId: '000000001',
  weaponStats: { range: 'Melee', A: '4', skill: '3', S: 7, AP: -2, D: '2' },
  sources: [
    { type: 'wahapedia', title: 'Wahapedia 10th', retrievedAt: '2026-05-15T00:00:00.000Z' },
  ],
  refs: [],
  version: 1,
  keywords: ['melee'],
}

const warbossAbilityNode: Node = {
  id: 'ability:000000001:waaagh',
  layer: 'unit',
  category: 'unit-ability',
  title: 'Waaagh!',
  content:
    'While this model is leading a unit, add 1 to the Attacks characteristic of models in that unit.',
  summary: 'Waaagh! on Warboss — While this model is leading a unit, add 1 to Attacks.',
  factionId: 'orks',
  datasheetId: '000000001',
  sources: [
    { type: 'wahapedia', title: 'Wahapedia 10th', retrievedAt: '2026-05-15T00:00:00.000Z' },
  ],
  refs: [],
  version: 1,
  keywords: ['orks', 'attack', 'leader'],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildDatasheetLayout', () => {
  it('returns a CardLayout with version 1', () => {
    const layout = buildDatasheetLayout({
      datasheet: warbossNode,
      weapons: [],
      abilities: [],
    })
    expect(layout.version).toBe(1)
    expect(Array.isArray(layout.nodes)).toBe(true)
  })

  it('emits a header node with title and points badge', () => {
    const layout = buildDatasheetLayout({
      datasheet: warbossNode,
      weapons: [],
      abilities: [],
    })
    const header = layout.nodes.find((n) => n.type === 'header')
    expect(header).toBeDefined()
    expect(header?.type).toBe('header')
    if (header?.type === 'header') {
      expect(header.title).toBe('Warboss')
      expect(header.badge).toBe('1 model: 75pts')
      expect(header.badgeColor).toBe('amber')
    }
  })

  it('emits a stat-bar with M/T/SV/W/LD/OC and INV when present', () => {
    const layout = buildDatasheetLayout({
      datasheet: warbossNode,
      weapons: [],
      abilities: [],
    })
    const statBar = layout.nodes.find((n) => n.type === 'stat-bar')
    expect(statBar).toBeDefined()
    if (statBar?.type === 'stat-bar') {
      const labels = statBar.stats.map((s) => s.label)
      expect(labels).toContain('M')
      expect(labels).toContain('T')
      expect(labels).toContain('SV')
      expect(labels).toContain('W')
      expect(labels).toContain('LD')
      expect(labels).toContain('OC')
      expect(labels).toContain('INV')
      const toughness = statBar.stats.find((s) => s.label === 'T')
      expect(toughness?.value).toBe('5')
      const inv = statBar.stats.find((s) => s.label === 'INV')
      expect(inv?.value).toBe('5+')
    }
  })

  it('emits a ranged weapon table for ranged weapons', () => {
    const layout = buildDatasheetLayout({
      datasheet: warbossNode,
      weapons: [kombiWeaponNode],
      abilities: [],
    })
    const tables = layout.nodes
      .flatMap((n) => (n.type === 'box' ? flattenLayoutNodes(n.children) : [n]))
      .filter((n) => n.type === 'table')
    const rangedTable = tables.find((n) => n.type === 'table' && n.label === 'RANGED WEAPONS')
    expect(rangedTable).toBeDefined()
    if (rangedTable?.type === 'table') {
      expect(rangedTable.rows).toHaveLength(1)
      expect(rangedTable.rows[0].cells[0]).toBe('Kombi-weapon')
      expect(rangedTable.rows[0].cells[1]).toBe('24')
      expect(rangedTable.rows[0].tags).toContain('anti-infantry 4+')
    }
  })

  it('emits a melee weapon table for melee weapons', () => {
    const layout = buildDatasheetLayout({
      datasheet: warbossNode,
      weapons: [bigChoppaNode],
      abilities: [],
    })
    const tables = flattenAllNodes(layout).filter((n) => n.type === 'table')
    const meleeTable = tables.find((n) => n.type === 'table' && n.label === 'MELEE WEAPONS')
    expect(meleeTable).toBeDefined()
    if (meleeTable?.type === 'table') {
      expect(meleeTable.rows[0].cells[0]).toBe('Big choppa')
      expect(meleeTable.rows[0].cells[4]).toBe('7') // strength
    }
  })

  it('emits an ability node for each ability', () => {
    const layout = buildDatasheetLayout({
      datasheet: warbossNode,
      weapons: [],
      abilities: [warbossAbilityNode],
    })
    const abilityNodes = flattenAllNodes(layout).filter((n) => n.type === 'ability')
    expect(abilityNodes).toHaveLength(1)
    if (abilityNodes[0]?.type === 'ability') {
      expect(abilityNodes[0].name).toBe('Waaagh!')
      expect(abilityNodes[0].description).toContain('add 1 to the Attacks')
    }
  })

  // ── Bug-4a regression: ability title triplicated in body ────────────────
  it('strips a leading copy of the ability title from the description body', () => {
    // Use a non-USR ability so it survives the USR filter and gets rendered
    // as an expanded panel (USRs like Deep Strike / Leader are pill-only —
    // see the Khârn regression fix).
    const waaaghAbility: Node = {
      id: 'ability:waaagh',
      layer: 'unit',
      category: 'unit-ability',
      title: 'Waaagh! Boss',
      content:
        'Waaagh! Boss\nWAAAGH! BOSS\nOnce per battle, at the start of your Command phase, this unit can shout Waaagh!...',
      summary: '',
      datasheetId: warbossNode.id,
      sources: [],
      refs: [],
      version: 1,
      keywords: [],
    }
    const layout = buildDatasheetLayout({
      datasheet: warbossNode,
      weapons: [],
      abilities: [waaaghAbility],
    })
    const abilityNodes = flattenAllNodes(layout).filter((n) => n.type === 'ability')
    expect(abilityNodes).toHaveLength(1)
    if (abilityNodes[0]?.type === 'ability') {
      const node = abilityNodes[0]
      expect(node.name).toBe('Waaagh! Boss')
      // Body must NOT start with the title repeated.
      expect(node.description.startsWith('Waaagh! Boss')).toBe(false)
      expect(node.description.startsWith('WAAAGH! BOSS')).toBe(false)
      // The actual rule text must remain.
      expect(node.description).toContain('Once per battle')
    }
  })

  it('skips USR abilities (Leader, Deep Strike, etc.) from expanded panels', () => {
    // Khârn-shaped datasheet: has a "Leader" ability node with a 3kb generic
    // body plus a unique "Legendary Killer" ability. The Leader panel should
    // be filtered out (surfaced as a pill instead); the unique one stays.
    const kharnLike: Node = {
      ...warbossNode,
      id: 'datasheet:kharn-like',
      title: 'Khârn-like Character',
      coreAbilities: [{ keyword: 'LEADER' }, { keyword: 'GRENADES' }],
    }
    const leaderAbility: Node = {
      id: 'ability:leader',
      layer: 'unit',
      category: 'unit-ability',
      title: 'Leader',
      content:
        'Mighty heroes fight at the forefront of battle. Some CHARACTER units have Leader listed on their datasheets...',
      summary: '',
      datasheetId: kharnLike.id,
      sources: [],
      refs: [],
      version: 1,
      keywords: [],
    }
    const uniqueAbility: Node = {
      id: 'ability:legendary-killer',
      layer: 'unit',
      category: 'unit-ability',
      title: 'Legendary Killer',
      content: 'While this model is leading a unit, re-roll a Hit roll of 1...',
      summary: '',
      datasheetId: kharnLike.id,
      sources: [],
      refs: [],
      version: 1,
      keywords: [],
    }
    const layout = buildDatasheetLayout({
      datasheet: kharnLike,
      weapons: [],
      abilities: [leaderAbility, uniqueAbility],
    })
    const abilityNodes = flattenAllNodes(layout).filter((n) => n.type === 'ability')
    expect(abilityNodes.map((n) => (n.type === 'ability' ? n.name : ''))).toEqual([
      'Legendary Killer',
    ])
    // LEADER must still surface as a pill — never disappear entirely.
    const pillLists = flattenAllNodes(layout).filter((n) => n.type === 'pill-list') as Array<{
      type: 'pill-list'
      pills: Array<{ text: string }>
    }>
    const allPills = pillLists.flatMap((pl) => pl.pills.map((p) => p.text))
    expect(allPills).toContain('LEADER')
  })

  it('emits a pill-list for keywords', () => {
    const layout = buildDatasheetLayout({
      datasheet: warbossNode,
      weapons: [],
      abilities: [],
    })
    const pillLists = flattenAllNodes(layout).filter((n) => n.type === 'pill-list')
    const kwList = pillLists.find((n) => n.type === 'pill-list' && n.label === 'Keywords')
    expect(kwList).toBeDefined()
    if (kwList?.type === 'pill-list') {
      const texts = kwList.pills.map((p) => p.text)
      // 'grenades' is a core ability prefix — it goes to coreAbilities, not the keyword bar
      // 'infantry', 'warboss', 'character' stay in display keywords
      expect(texts).toContain('infantry')
      expect(texts).toContain('warboss')
    }
  })

  it('emits a key-value node for Composition in footer', () => {
    const layout = buildDatasheetLayout({
      datasheet: warbossNode,
      weapons: [],
      abilities: [],
    })
    const kvNodes = flattenAllNodes(layout).filter((n) => n.type === 'key-value')
    const comp = kvNodes.find((n) => n.type === 'key-value' && n.label === 'Composition')
    expect(comp).toBeDefined()
    if (comp?.type === 'key-value') {
      expect(comp.value).toBe('1 Warboss')
    }
  })

  it('emits a key-value node for Loadout in footer', () => {
    const layout = buildDatasheetLayout({
      datasheet: warbossNode,
      weapons: [],
      abilities: [],
    })
    const kvNodes = flattenAllNodes(layout).filter((n) => n.type === 'key-value')
    const loadout = kvNodes.find((n) => n.type === 'key-value' && n.label === 'Loadout')
    expect(loadout).toBeDefined()
    if (loadout?.type === 'key-value') {
      expect(loadout.value).toContain('kombi-weapon')
    }
  })

  it('omits stat-bar for datasheets with no stats field', () => {
    const noStats: Node = {
      ...warbossNode,
      stats: undefined,
    }
    const layout = buildDatasheetLayout({ datasheet: noStats, weapons: [], abilities: [] })
    const statBar = layout.nodes.find((n) => n.type === 'stat-bar')
    // Still emits stat-bar but all values are '-'
    expect(statBar).toBeDefined()
    if (statBar?.type === 'stat-bar') {
      expect(statBar.stats.find((s) => s.label === 'T')?.value).toBe('-')
    }
  })

  it('includes FNP in stat-bar when fnp- keyword is present', () => {
    const withFnp: Node = {
      ...warbossNode,
      keywords: [...warbossNode.keywords, 'fnp-5'],
    }
    const layout = buildDatasheetLayout({ datasheet: withFnp, weapons: [], abilities: [] })
    const statBar = flattenAllNodes(layout).find((n) => n.type === 'stat-bar')
    if (statBar?.type === 'stat-bar') {
      expect(statBar.stats.find((s) => s.label === 'FNP')?.value).toBe('5++')
    }
  })

  it('produces a stable JSON structure for snapshot comparison', () => {
    const layout = buildDatasheetLayout({
      datasheet: warbossNode,
      weapons: [kombiWeaponNode, bigChoppaNode],
      abilities: [warbossAbilityNode],
    })
    // Verify it round-trips through JSON without error
    const json = JSON.stringify(layout)
    const reparsed: CardLayout = JSON.parse(json)
    expect(reparsed.version).toBe(1)
    expect(reparsed.nodes.length).toBeGreaterThan(0)
  })
})

// ── Tree helpers ──────────────────────────────────────────────────────────────

import type { CardLayoutNode } from '../../../shared/card-layout-types'

function flattenLayoutNodes(nodes: CardLayoutNode[]): CardLayoutNode[] {
  const result: CardLayoutNode[] = []
  for (const n of nodes) {
    result.push(n)
    if (n.type === 'box') {
      result.push(...flattenLayoutNodes(n.children))
    }
  }
  return result
}

function flattenAllNodes(layout: CardLayout): CardLayoutNode[] {
  return flattenLayoutNodes(layout.nodes)
}
