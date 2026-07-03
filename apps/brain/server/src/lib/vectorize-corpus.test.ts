/**
 * Tests for the /index-vectors text-to-embed composer.
 *
 * The datasheet's `content` field is minimal (no ability bodies, no full
 * weapon rows). Semantic search still needs the datasheet to surface for
 * ability-related queries, so at index time we compose a per-datasheet
 * corpus that includes child ability + weapon bodies. Everything else uses
 * the pre-refactor `title + summary + keywords` formula.
 */
import { describe, expect, it } from 'vitest'

import type { Node } from './model'
import {
  buildCorpusForNode,
  buildDatasheetCorpus,
  buildDatasheetCorpusFromParts,
  buildDefaultCorpus,
  collectDatasheetChildren,
} from './vectorize-corpus'

const baseSource = { type: 'wahapedia' as const, title: 'Wahapedia', retrievedAt: '2026-05-01' }

function datasheet(overrides: Partial<Node> = {}): Node {
  return {
    id: '11e:000000020',
    layer: 'unit',
    category: 'datasheet',
    title: 'Tankbustas',
    content:
      'M T SV W LD OC: 6" 4 5+ 1 7+ 2\n\nKEYWORDS: infantry, tankbustas\n\nABILITIES: Bomb Squigs',
    summary: 'Tankbustas — Battleline.',
    factionId: 'orks',
    datasheetId: '11e:000000020',
    edition: '11th',
    sources: [baseSource],
    refs: [],
    version: 1,
    keywords: ['infantry', 'tankbustas'],
    ...overrides,
  }
}

function ability(overrides: Partial<Node> = {}): Node {
  return {
    id: '11e:ability:000000020:bomb-squigs',
    layer: 'unit',
    category: 'unit-ability',
    title: 'Bomb Squigs',
    content: 'Twice per battle, after this unit ends a Normal move, roll one D6...',
    summary: 'Bomb Squigs — mortal-wound ability.',
    factionId: 'orks',
    datasheetId: '11e:000000020',
    edition: '11th',
    sources: [baseSource],
    refs: [],
    version: 1,
    keywords: ['ability'],
    ...overrides,
  }
}

function weapon(overrides: Partial<Node> = {}): Node {
  return {
    id: '11e:weapon:000000020:tankbusta-bomb',
    layer: 'unit',
    category: 'weapon',
    title: 'Tankbusta bomb',
    content:
      '**Range:** 12 | **Type:** Ranged\n**A:** 1 | **BS/WS:** 5+ | **S:** 8 | **AP:** -1 | **D:** D6\n\nanti-vehicle 3+, one shot',
    summary: 'Tankbusta bomb (Ranged) — 12", 1A, S8, AP-1, DD6.',
    factionId: 'orks',
    datasheetId: '11e:000000020',
    edition: '11th',
    sources: [baseSource],
    refs: [],
    version: 1,
    keywords: ['ranged', 'anti-vehicle', 'one shot'],
    ...overrides,
  }
}

describe('collectDatasheetChildren', () => {
  it('returns abilities + weapons matching datasheetId', () => {
    const ds = datasheet()
    const ab = ability()
    const w = weapon()
    const unrelatedAb = ability({
      id: 'ability:x',
      datasheetId: 'other',
      title: 'Other',
    })
    const result = collectDatasheetChildren(ds, [ds, ab, w, unrelatedAb])
    expect(result.abilities).toHaveLength(1)
    expect(result.abilities[0]!.id).toBe('11e:ability:000000020:bomb-squigs')
    expect(result.weapons).toHaveLength(1)
    expect(result.weapons[0]!.id).toBe('11e:weapon:000000020:tankbusta-bomb')
  })

  it('ignores children of the wrong category (stratagem/enhancement)', () => {
    const ds = datasheet()
    const strat: Node = {
      ...ability(),
      id: 'strat:x',
      category: 'stratagem',
      datasheetId: '11e:000000020',
    }
    const result = collectDatasheetChildren(ds, [ds, strat])
    expect(result.abilities).toEqual([])
    expect(result.weapons).toEqual([])
  })
})

describe('buildDatasheetCorpusFromParts', () => {
  it('appends ability body text to the datasheet corpus', () => {
    const corpus = buildDatasheetCorpusFromParts(datasheet(), [ability()], [])
    expect(corpus).toMatch(/Tankbustas/)
    expect(corpus).toMatch(/Bomb Squigs/)
    expect(corpus).toMatch(/Twice per battle/)
  })

  it('appends weapon body text to the datasheet corpus', () => {
    const corpus = buildDatasheetCorpusFromParts(datasheet(), [], [weapon()])
    expect(corpus).toMatch(/Tankbusta bomb/)
    expect(corpus).toMatch(/anti-vehicle/)
  })

  it('includes the datasheet content, title, summary, keywords', () => {
    const corpus = buildDatasheetCorpusFromParts(datasheet(), [], [])
    expect(corpus).toMatch(/Tankbustas/)
    expect(corpus).toMatch(/Battleline/) // summary
    expect(corpus).toMatch(/infantry, tankbustas/) // keywords
    expect(corpus).toMatch(/ABILITIES: Bomb Squigs/) // content structural hint
  })

  it('handles abilities without content by falling back to title', () => {
    const ab = ability({ content: '' })
    const corpus = buildDatasheetCorpusFromParts(datasheet(), [ab], [])
    expect(corpus).toMatch(/Bomb Squigs/)
  })

  it('joins multiple ability bodies into one corpus', () => {
    const bombSquigs = ability({
      id: 'ab:1',
      title: 'Bomb Squigs',
      content: 'Twice per battle mortal wounds',
    })
    const glory = ability({
      id: 'ab:2',
      title: 'Glory Hogs',
      content: 'Re-roll charge rolls',
    })
    const corpus = buildDatasheetCorpusFromParts(datasheet(), [bombSquigs, glory], [])
    expect(corpus).toMatch(/Twice per battle mortal wounds/)
    expect(corpus).toMatch(/Re-roll charge rolls/)
  })
})

describe('buildDatasheetCorpus', () => {
  it('looks up children by datasheetId + category and includes their bodies', () => {
    const ds = datasheet()
    const ab = ability()
    const w = weapon()
    const corpus = buildDatasheetCorpus(ds, [ds, ab, w])
    expect(corpus).toMatch(/Twice per battle/)
    expect(corpus).toMatch(/anti-vehicle/)
  })

  it('produces the same output as buildDatasheetCorpusFromParts', () => {
    const ds = datasheet()
    const ab = ability()
    const w = weapon()
    const viaLookup = buildDatasheetCorpus(ds, [ds, ab, w])
    const viaParts = buildDatasheetCorpusFromParts(ds, [ab], [w])
    expect(viaLookup).toBe(viaParts)
  })
})

describe('buildDefaultCorpus', () => {
  it('uses title + summary + keywords for non-datasheet nodes', () => {
    const ab = ability()
    const corpus = buildDefaultCorpus(ab)
    expect(corpus).toContain('Bomb Squigs')
    expect(corpus).toContain('mortal-wound ability')
    expect(corpus).toContain('ability')
    // Does NOT embed the ability content (that's the datasheet-corpus job).
    expect(corpus).not.toContain('Twice per battle')
  })
})

describe('buildCorpusForNode', () => {
  it('dispatches to buildDatasheetCorpus for datasheet-category nodes', () => {
    const ds = datasheet()
    const ab = ability()
    const w = weapon()
    const corpus = buildCorpusForNode(ds, [ds, ab, w])
    expect(corpus).toMatch(/Twice per battle/)
    expect(corpus).toMatch(/anti-vehicle/)
  })

  it('dispatches to buildDefaultCorpus for non-datasheet nodes', () => {
    const ab = ability()
    const corpus = buildCorpusForNode(ab, [ab])
    // No content because default corpus is title/summary/keywords only.
    expect(corpus).toBe(buildDefaultCorpus(ab))
  })

  it('preserves searchability for ability-text queries via datasheet corpus', () => {
    // The whole point of composing the corpus: a query like
    // "sustained hits" should hit the datasheet even though the storage
    // layer never embeds "sustained hits" on the datasheet's content field.
    const ds = datasheet({ content: 'M T SV W LD OC: ...\n\nKEYWORDS: infantry' })
    const ab = ability({ content: 'This weapon has sustained hits 1.' })
    const corpus = buildCorpusForNode(ds, [ds, ab])
    expect(corpus).toMatch(/sustained hits/)
  })
})
