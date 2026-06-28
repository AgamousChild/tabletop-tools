import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadFactionCodes, resetFactionCodes } from './faction-codes'
import { mergeSources } from './merge-sources'
import type { Node, NodeRef } from './model'

function makeNode(overrides: Partial<Node>): Node {
  return {
    id: 'test-id',
    layer: 'unit',
    category: 'datasheet',
    title: 'Test Unit',
    content: 'Test content',
    summary: 'Test summary',
    factionId: 'space-marines',
    sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
    refs: [],
    version: 1,
    keywords: ['infantry'],
    ...overrides,
  }
}

describe('mergeSources', () => {
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
      ['chaos-space-marines', 'Chaos Space Marines', 'chaos'],
      ['death-guard', 'Death Guard', 'chaos'],
    ]
    for (const [id, name, alleg] of factions) {
      await client.execute({
        sql: 'INSERT INTO dim_faction VALUES (?, ?, ?)',
        args: [id!, name!, alleg!],
      })
    }
    const aliases = [
      ['SM', 'space-marines'],
      ['CSM', 'chaos-space-marines'],
      ['DG', 'death-guard'],
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

  it('normalizes all factionIds to canonical slugs', () => {
    const nodes = [
      makeNode({ id: '001', factionId: 'SM', title: 'Intercessors' }),
      makeNode({ id: '002', factionId: 'CSM', title: 'Chosen' }),
    ]
    const result = mergeSources(nodes, [])
    expect(result.nodes.find((n) => n.id === '001')!.factionId).toBe('space-marines')
    expect(result.nodes.find((n) => n.id === '002')!.factionId).toBe('chaos-space-marines')
  })

  it('deduplicates nodes with same ID, keeping the first occurrence', () => {
    const nodes = [
      makeNode({
        id: '001',
        title: 'Intercessors',
        content: 'Game data version',
        keywords: ['infantry'],
      }),
      makeNode({
        id: '001',
        title: 'Intercessors',
        content: 'BSData version',
        keywords: ['infantry', 'extra-kw'],
      }),
    ]
    const result = mergeSources(nodes, [])
    const matching = result.nodes.filter((n) => n.id === '001')
    expect(matching).toHaveLength(1)
    expect(matching[0]!.content).toBe('Game data version')
    expect(matching[0]!.keywords).toContain('extra-kw')
  })

  it('includes faction name in datasheet summary for embedding disambiguation', () => {
    const nodes = [
      makeNode({
        id: '001',
        factionId: 'death-guard',
        category: 'datasheet',
        title: 'Chaos Rhino',
        summary: 'Chaos Rhino — Dedicated Transports',
      }),
    ]
    const result = mergeSources(nodes, [])
    const rhino = result.nodes.find((n) => n.id === '001')!
    expect(rhino.summary).toContain('Death Guard')
  })

  it('does NOT prefix faction name if already present in summary', () => {
    const nodes = [
      makeNode({
        id: '001',
        factionId: 'death-guard',
        category: 'datasheet',
        title: 'Death Guard Rhino',
        summary: 'Death Guard Rhino — Dedicated Transports',
      }),
    ]
    const result = mergeSources(nodes, [])
    const rhino = result.nodes.find((n) => n.id === '001')!
    expect(rhino.summary.match(/death guard/gi)?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it('appends category tag to non-datasheet nodes that share a title with a datasheet', () => {
    const nodes = [
      makeNode({
        id: '001',
        category: 'datasheet',
        title: 'Assault Squad',
        summary: 'Assault Squad — unit',
      }),
      makeNode({
        id: 'det:sm:x:assault-squad',
        category: 'faction-ability',
        title: 'ASSAULT SQUAD',
        summary: 'ASSAULT SQUAD rule text',
      }),
    ]
    const result = mergeSources(nodes, [])
    const rule = result.nodes.find((n) => n.id === 'det:sm:x:assault-squad')!
    expect(rule.summary).toContain('faction rule')
  })

  it('removes refs where either endpoint does not exist', () => {
    const nodes = [makeNode({ id: '001', content: 'first', keywords: ['a'] })]
    const refs: NodeRef[] = [
      { sourceId: '001', targetId: '999', rel: 'part_of', context: 'target missing' },
      { sourceId: '999', targetId: '001', rel: 'modifies', context: 'source missing' },
      { sourceId: '001', targetId: '001', rel: 'clarifies', context: 'both exist' },
    ]
    const result = mergeSources(nodes, refs)
    expect(result.refs).toHaveLength(1)
    expect(result.refs[0]!.context).toBe('both exist')
  })

  it('deduplicates refs with same sourceId + targetId + rel', () => {
    const nodes = [makeNode({ id: '001' })]
    const refs: NodeRef[] = [
      { sourceId: '001', targetId: '001', rel: 'part_of', context: 'from game-data' },
      { sourceId: '001', targetId: '001', rel: 'part_of', context: 'from bsdata' },
    ]
    const result = mergeSources(nodes, refs)
    expect(result.refs).toHaveLength(1)
  })

  describe('MFM points override', () => {
    it('replaces Wahapedia points with MFM points when MFM has the datasheet', () => {
      const nodes = [
        makeNode({
          id: 'ds-001',
          category: 'datasheet',
          datasheetId: 'ds-001',
          title: 'Intercessor Squad',
          points: [
            { models: '5 models', cost: 90 }, // Wahapedia 10e value
            { models: '10 models', cost: 180 },
          ],
        }),
      ]
      const mfmCostingByDatasheetId = new Map([
        [
          'ds-001',
          {
            pointsArray: [
              { models: '5 models', cost: 80 }, // MFM 11e cheaper
              { models: '10 models', cost: 160 },
            ],
            minCost: 80,
            tiers: [
              {
                range: '[1,)',
                label: 'Your Unit Costs',
                costs: [
                  { models: 5, points: 80 },
                  { models: 10, points: 160 },
                ],
              },
            ],
          },
        ],
      ])
      const result = mergeSources(nodes, [], { mfmCostingByDatasheetId })
      const intercessor = result.nodes.find((n) => n.id === 'ds-001')!
      expect(intercessor.points).toEqual([
        { models: '5 models', cost: 80 },
        { models: '10 models', cost: 160 },
      ])
      expect(result.stats.mfmPointsApplied).toBe(1)
    })

    it('keeps Wahapedia points when MFM has no row for the datasheet (fallback)', () => {
      const nodes = [
        makeNode({
          id: 'ds-002',
          category: 'datasheet',
          datasheetId: 'ds-002',
          title: 'Legacy Unit',
          points: [{ models: '1 model', cost: 75 }],
        }),
      ]
      // Empty MFM map — falls back to the Wahapedia value already on the node.
      const mfmCostingByDatasheetId = new Map()
      const result = mergeSources(nodes, [], { mfmCostingByDatasheetId })
      const legacy = result.nodes.find((n) => n.id === 'ds-002')!
      expect(legacy.points).toEqual([{ models: '1 model', cost: 75 }])
      expect(result.stats.mfmPointsApplied).toBe(0)
    })

    it('does not touch non-datasheet nodes', () => {
      const nodes = [
        makeNode({
          id: 'strat-001',
          category: 'stratagem',
          title: 'Rapid Ingress',
          // Stratagems do not carry `points`, but make sure the override doesn't
          // somehow leak across categories even if the same id is in the map.
        }),
      ]
      const mfmCostingByDatasheetId = new Map([
        [
          'strat-001',
          {
            pointsArray: [{ models: '1 model', cost: 999 }],
            minCost: 999,
            tiers: [],
          },
        ],
      ])
      const result = mergeSources(nodes, [], { mfmCostingByDatasheetId })
      const strat = result.nodes.find((n) => n.id === 'strat-001')!
      expect(strat.points).toBeUndefined()
      expect(result.stats.mfmPointsApplied).toBe(0)
    })
  })
})
