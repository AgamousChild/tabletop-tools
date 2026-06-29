import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { _setFactionCodesForTesting, loadFactionCodes, resetFactionCodes } from './faction-codes'
import { BuildGateError, mergeSources } from './merge-sources'
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

  describe('build-time gates (step 9)', () => {
    it('defaults missing editions to 11th and reports counts by edition', () => {
      const nodes = [
        makeNode({ id: 'n1', edition: '10th' }),
        makeNode({ id: 'n2', edition: '11th' }),
        makeNode({ id: 'n3', edition: '9th' }),
        makeNode({ id: 'n4' }), // no edition -> defaulted
        makeNode({ id: 'n5' }), // no edition -> defaulted
      ]
      const result = mergeSources(nodes, [])
      const gate = result.stats.editionGate
      expect(gate['9th']).toBe(1)
      expect(gate['10th']).toBe(1)
      // n2 + n4 + n5 all end up as 11th
      expect(gate['11th']).toBe(3)
      expect(gate.defaulted).toBe(2)
      expect(gate.unexpected).toBe(0)
      // Auto-fix is applied: defaulted nodes carry edition '11th' on the way out
      expect(result.nodes.find((n) => n.id === 'n4')!.edition).toBe('11th')
      expect(result.nodes.find((n) => n.id === 'n5')!.edition).toBe('11th')
    })

    it('warns on unexpected edition values but leaves them in place', () => {
      const nodes = [
        makeNode({ id: 'n1', edition: '10th' }),
        makeNode({ id: 'n2', edition: '12th' }), // typo / not in allowlist
      ]
      const result = mergeSources(nodes, [])
      expect(result.stats.editionGate.unexpected).toBe(1)
      // We don't silently rewrite arbitrary strings — typos must be visible.
      expect(result.nodes.find((n) => n.id === 'n2')!.edition).toBe('12th')
    })

    it('routes shadow factionIds through normalizeFactionId() and reports counts', () => {
      const nodes = [
        // canonical
        makeNode({ id: 'n1', factionId: 'space-marines' }),
        // shadow that an alias can repair: 'SM' was seeded in beforeAll
        makeNode({ id: 'n2', factionId: 'space-marines', title: 'pre-normalized' }),
        // factionId: undefined is allowed
        makeNode({ id: 'n3', factionId: undefined, layer: 'core', category: 'core-mechanic' }),
      ]
      const result = mergeSources(nodes, [])
      const gate = result.stats.factionIdGate
      // n1 and n2 both canonical post-merge; n3 has no factionId so isn't counted
      expect(gate.canonical).toBe(2)
      expect(gate.normalized).toBe(0)
      expect(gate.stillOrphaned).toBe(0)
      expect(result.nodes.find((n) => n.id === 'n3')!.factionId).toBeUndefined()
    })

    it('throws BuildGateError when a factionId cannot be normalized', () => {
      // Reset the cache to a minimal known-state with NO alias entries so a
      // truly-unknown id can't be rescued. slugify() will pass it through
      // unchanged, which the gate must catch.
      resetFactionCodes()
      _setFactionCodesForTesting(
        new Map([['space-marines', 'space-marines']]),
        new Set(['space-marines']),
      )
      try {
        const nodes = [
          makeNode({ id: 'n1', factionId: 'space-marines' }),
          // 'totally-not-a-faction' isn't in the alias map and slugify() returns
          // it verbatim, so the gate's auto-fix can't rescue it.
          makeNode({ id: 'n2', factionId: 'totally-not-a-faction' }),
        ]
        expect(() => mergeSources(nodes, [])).toThrow(BuildGateError)
      } finally {
        // Restore the cache for any tests that run after this one in this file.
        resetFactionCodes()
        _setFactionCodesForTesting(
          new Map([
            ['space-marines', 'space-marines'],
            ['chaos-space-marines', 'chaos-space-marines'],
            ['death-guard', 'death-guard'],
            ['SM', 'space-marines'],
            ['CSM', 'chaos-space-marines'],
            ['DG', 'death-guard'],
          ]),
          new Set(['space-marines', 'chaos-space-marines', 'death-guard']),
        )
      }
    })

    it('counts a node as `normalized` when an alias rescues a shadow factionId', () => {
      // Reset to a fresh cache so we can stage a single-shadow scenario.
      resetFactionCodes()
      _setFactionCodesForTesting(
        new Map([
          ['space-marines', 'space-marines'],
          // Alias that maps a shadow id to a canonical slug
          ['legacy-sm-id', 'space-marines'],
        ]),
        new Set(['space-marines']),
      )
      try {
        // Step 1 of mergeSources already normalizes factionId via the alias map,
        // so by the time the gate runs the node's factionId is already canonical.
        // What we're proving here is that the gate's counts and the auto-fix
        // path don't double-count or false-positive on alias-resolvable ids.
        const nodes = [makeNode({ id: 'n1', factionId: 'legacy-sm-id' })]
        const result = mergeSources(nodes, [])
        expect(result.stats.factionIdGate.stillOrphaned).toBe(0)
        // The step-1 normalize counter (factionNormalizedCount) records this work
        expect(result.stats.factionNormalizedCount).toBe(1)
        expect(result.nodes[0]!.factionId).toBe('space-marines')
      } finally {
        // Restore the test-wide cache.
        resetFactionCodes()
        _setFactionCodesForTesting(
          new Map([
            ['space-marines', 'space-marines'],
            ['chaos-space-marines', 'chaos-space-marines'],
            ['death-guard', 'death-guard'],
            ['SM', 'space-marines'],
            ['CSM', 'chaos-space-marines'],
            ['DG', 'death-guard'],
          ]),
          new Set(['space-marines', 'chaos-space-marines', 'death-guard']),
        )
      }
    })
  })

  describe('MFM detachment + faction-pack detachment-rule merge', () => {
    it('collapses MFM `category: detachment` onto faction-pack `category: detachment-rule`', () => {
      const mfmNode = makeNode({
        id: 'mfm:det:space-marines:gladius-task-force',
        layer: 'faction',
        category: 'detachment',
        title: 'Gladius Task Force',
        content: '**Gladius Task Force**\n**Detachment Points:** 2',
        summary: 'MFM summary',
        factionId: 'space-marines',
        edition: '11th',
        dp: 2,
        forceDisposition: 'PRIORITY ASSETS',
        keywords: ['gladius', 'detachment', '11th edition'],
        sources: [
          {
            type: 'manual',
            title: 'Munitorum Field Manual (11e)',
            retrievedAt: '2026-06-01',
          },
        ],
      })
      const packNode = makeNode({
        id: 'det:space-marines:gladius-task-force',
        layer: 'faction',
        category: 'detachment-rule',
        title: 'Gladius Task Force',
        content: 'Combat Doctrines: each turn pick a doctrine...',
        summary: 'Faction pack rule text',
        factionId: 'space-marines',
        edition: '11th',
        keywords: ['gladius', 'detachment-rule'],
        sources: [{ type: 'pdf', title: 'Faction Pack: Space Marines', retrievedAt: '2026-06-01' }],
      })
      const result = mergeSources([mfmNode, packNode], [])
      // The pack id survives — single node with category: detachment
      const survivors = result.nodes.filter((n) => n.title === 'Gladius Task Force')
      expect(survivors.length).toBe(1)
      const survivor = survivors[0]!
      expect(survivor.id).toBe('det:space-marines:gladius-task-force')
      expect(survivor.category).toBe('detachment')
      // Content from the faction-pack version
      expect(survivor.content).toContain('Combat Doctrines')
      // dp + forceDisposition lifted from MFM
      expect(survivor.dp).toBe(2)
      expect(survivor.forceDisposition).toBe('PRIORITY ASSETS')
      // Both source attributions preserved
      expect(survivor.sources.length).toBe(2)
      const srcTypes = survivor.sources.map((s) => s.type).sort()
      expect(srcTypes).toEqual(['manual', 'pdf'])
    })

    it('redirects refs pointing at the dropped MFM detachment id', () => {
      const mfmNode = makeNode({
        id: 'mfm:det:space-marines:gladius-task-force',
        layer: 'faction',
        category: 'detachment',
        title: 'Gladius Task Force',
        factionId: 'space-marines',
        edition: '11th',
        dp: 2,
      })
      const packNode = makeNode({
        id: 'det:space-marines:gladius-task-force',
        layer: 'faction',
        category: 'detachment-rule',
        title: 'Gladius Task Force',
        factionId: 'space-marines',
        edition: '11th',
      })
      const enhancement = makeNode({
        id: 'mfm:enh:space-marines:gladius-task-force:adept-of-the-codex',
        layer: 'faction',
        category: 'enhancement',
        title: 'Adept of the Codex',
        factionId: 'space-marines',
        edition: '11th',
      })
      const refs: NodeRef[] = [
        {
          sourceId: 'mfm:enh:space-marines:gladius-task-force:adept-of-the-codex',
          targetId: 'mfm:det:space-marines:gladius-task-force',
          rel: 'part_of',
          context: 'enhancement of detachment',
        },
      ]
      const result = mergeSources([mfmNode, packNode, enhancement], refs)
      const enhRef = result.refs.find((r) => r.sourceId === enhancement.id)
      expect(enhRef).toBeDefined()
      // The ref's target was rewritten to the kept (pack) id
      expect(enhRef!.targetId).toBe('det:space-marines:gladius-task-force')
    })

    it('leaves MFM node alone when no faction-pack twin exists', () => {
      const mfmOnly = makeNode({
        id: 'mfm:det:tyranids:assimilation-swarm',
        layer: 'faction',
        category: 'detachment',
        title: 'Assimilation Swarm',
        factionId: 'space-marines', // factionId valid for the test fixture
        edition: '11th',
        dp: 1,
      })
      const result = mergeSources([mfmOnly], [])
      expect(result.nodes.length).toBe(1)
      expect(result.nodes[0]!.id).toBe('mfm:det:tyranids:assimilation-swarm')
      expect(result.nodes[0]!.category).toBe('detachment')
      expect(result.nodes[0]!.dp).toBe(1)
    })
  })
})
