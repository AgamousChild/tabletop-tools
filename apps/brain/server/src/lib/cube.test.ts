import { describe, expect, test } from 'vitest'

import { buildCube, combosAtStrikeForce } from './cube'
import type { Node } from './model'

const src = {
  type: 'wahapedia' as const,
  title: 'Wahapedia',
  retrievedAt: '2026-01-01T00:00:00Z',
}

function faction(id: string, name: string): Node {
  return {
    id: `faction-root:${id}`,
    layer: 'faction',
    category: 'faction',
    title: name,
    content: `${name} faction root.`,
    summary: name,
    factionId: id,
    factionName: name,
    edition: '11th',
    sources: [src],
    refs: [],
    version: 1,
    keywords: [id],
  }
}

function detachment(id: string, factionId: string, title: string, dp: number): Node {
  return {
    id,
    layer: 'faction',
    category: 'detachment',
    title,
    content: `${title} container.`,
    summary: title,
    factionId,
    edition: '11th',
    dp,
    sources: [src],
    refs: [],
    version: 1,
    keywords: ['detachment'],
  }
}

function unit(id: string, factionId: string, title: string, keywords: string[]): Node {
  return {
    id,
    layer: 'unit',
    category: 'datasheet',
    title,
    content: `${title} datasheet.`,
    summary: title,
    factionId,
    edition: '11th',
    sources: [src],
    refs: [],
    version: 1,
    keywords: [factionId, ...keywords],
  }
}

const subfactions = [
  { id: 'dark-angels', name: 'Dark Angels', factionId: 'space-marines' },
  { id: 'blood-angels', name: 'Blood Angels', factionId: 'space-marines' },
]

describe('combosAtStrikeForce', () => {
  test('single 3-pt detachment yields 1 combo', () => {
    expect(combosAtStrikeForce(0, 0, 1)).toBe(1)
  })

  test('1×2pt + 1×1pt combos = 1', () => {
    expect(combosAtStrikeForce(1, 1, 0)).toBe(1)
  })

  test('3×1pt combos = 1', () => {
    expect(combosAtStrikeForce(3, 0, 0)).toBe(1)
  })

  test('Dark Angels ground truth: 6×1DP + 18×2DP + 6×3DP = 134', () => {
    // 6 (single-3pt) + 18×6 (2+1) + C(6,3)=20 (1+1+1) = 134
    expect(combosAtStrikeForce(6, 18, 6)).toBe(134)
  })

  test("faction with only 1×1DP has 0 valid Strike Force combos (can't fill 3 DP)", () => {
    expect(combosAtStrikeForce(1, 0, 0)).toBe(0)
  })
})

describe('buildCube', () => {
  test('emits a fact row per node with factionIds', () => {
    const nodes = [
      faction('orks', 'Orks'),
      detachment('11e:det:orks:goff', 'orks', 'Goff Warband', 2),
    ]
    const cube = buildCube(nodes, [])
    const facts = cube.factNodesJsonl
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(facts).toHaveLength(2)
    const goff = facts.find((f) => f.id === '11e:det:orks:goff')!
    expect(goff.factionIds).toEqual(['orks'])
    expect(goff.dp).toBe(2)
  })

  test('bakes chapter → parent inheritance into factionIds on parent nodes', () => {
    // A Space Marines detachment should be accessible to Dark Angels + Blood Angels.
    const nodes = [
      faction('space-marines', 'Space Marines'),
      faction('dark-angels', 'Dark Angels'),
      faction('blood-angels', 'Blood Angels'),
      detachment('11e:det:space-marines:gladius', 'space-marines', 'Gladius Task Force', 3),
      detachment('11e:det:dark-angels:dark-age-arsenal', 'dark-angels', 'Dark Age Arsenal', 1),
    ]
    const cube = buildCube(nodes, subfactions)
    const facts = cube.factNodesJsonl
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    const gladius = facts.find((f) => f.id === '11e:det:space-marines:gladius')!
    expect(gladius.factionIds.sort()).toEqual(['blood-angels', 'dark-angels', 'space-marines'])
    // Chapter-only stays chapter-only.
    const arsenal = facts.find((f) => f.id === '11e:det:dark-angels:dark-age-arsenal')!
    expect(arsenal.factionIds).toEqual(['dark-angels'])
  })

  test('rollup_faction_dp reflects chapter-expanded accessible detachments', () => {
    const nodes = [
      faction('space-marines', 'Space Marines'),
      faction('dark-angels', 'Dark Angels'),
      // 2 SM detachments accessible to everyone in the SM family
      detachment('sm-3pt', 'space-marines', 'Gladius', 3),
      detachment('sm-2pt', 'space-marines', 'Anvil', 2),
      // 1 DA-only detachment
      detachment('da-1pt', 'dark-angels', 'Dark Age Arsenal', 1),
    ]
    const cube = buildCube(nodes, subfactions)
    const daRow = cube.rollupFactionDp.find((r) => r.factionId === 'dark-angels')
    expect(daRow).toBeDefined()
    // DA sees: 1×3pt (Gladius) + 1×2pt (Anvil) + 1×1pt (Arsenal) = 3 total
    expect(daRow!.dp1).toBe(1)
    expect(daRow!.dp2).toBe(1)
    expect(daRow!.dp3).toBe(1)
    expect(daRow!.total).toBe(3)
    // combos: 1 (3pt) + 1×1 (2+1) + C(1,3)=0 = 2
    expect(daRow!.combosStrikeForce).toBe(2)
    expect(daRow!.isChapter).toBe(true)
    expect(daRow!.parentId).toBe('space-marines')

    const smRow = cube.rollupFactionDp.find((r) => r.factionId === 'space-marines')
    expect(smRow!.dp1).toBe(0)
    expect(smRow!.dp2).toBe(1)
    expect(smRow!.dp3).toBe(1)
    expect(smRow!.total).toBe(2)
    // SM alone: 1 (3pt) + 1×0 + 0 = 1 combo
    expect(smRow!.combosStrikeForce).toBe(1)
    expect(smRow!.isChapter).toBe(false)
  })

  test('rollup_faction_category_edition counts nodes by (faction, category, edition) with chapter expansion', () => {
    const nodes = [
      faction('space-marines', 'Space Marines'),
      faction('dark-angels', 'Dark Angels'),
      unit('u1', 'space-marines', 'Intercessor Squad', ['sustained hits']),
      unit('u2', 'space-marines', 'Terminator Squad', ['deep strike']),
      unit('u3', 'dark-angels', 'Deathwing Knights', ['deep strike']),
    ]
    const cube = buildCube(nodes, subfactions)
    // Dark Angels should see 3 datasheets (2 SM + 1 DA)
    const daDs = cube.rollupFactionCategoryEdition.find(
      (r) => r.factionId === 'dark-angels' && r.category === 'datasheet' && r.edition === '11th',
    )
    expect(daDs?.count).toBe(3)
    // Space Marines sees 2 (its own)
    const smDs = cube.rollupFactionCategoryEdition.find(
      (r) => r.factionId === 'space-marines' && r.category === 'datasheet' && r.edition === '11th',
    )
    expect(smDs?.count).toBe(2)
  })

  test('lowercases keywords for case-insensitive matching', () => {
    const nodes = [unit('u1', 'orks', 'Boyz', ['SUSTAINED HITS', 'MOB RULE'])]
    const cube = buildCube(nodes, [])
    const fact = JSON.parse(cube.factNodesJsonl.trim().split('\n')[0]!)
    expect(fact.keywords).toContain('sustained hits')
    expect(fact.keywords).toContain('mob rule')
  })

  test('dim_faction includes both parents and chapters, marked correctly', () => {
    const nodes = [faction('space-marines', 'Space Marines'), faction('orks', 'Orks')]
    const cube = buildCube(nodes, subfactions)
    const sm = cube.dimFaction.find((f) => f.id === 'space-marines')!
    expect(sm.isChapter).toBe(false)
    expect(sm.parentId).toBeUndefined()
    const da = cube.dimFaction.find((f) => f.id === 'dark-angels')!
    expect(da.isChapter).toBe(true)
    expect(da.parentId).toBe('space-marines')
  })
})
