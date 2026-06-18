import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetManifestCache } from './fetch-nodes'
import type { Node } from './model'
import { retrieve, type RetrieveEnv } from './retrieve'

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeNode = (overrides: Partial<Node>): Node => ({
  id: 'core:test',
  layer: 'core',
  category: 'core-mechanic',
  title: 'Test Node',
  content: 'test content',
  summary: 'test summary',
  sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-04-08' }],
  refs: [],
  version: 1,
  keywords: [],
  ...overrides,
})

function createMockBucket(files: Record<string, unknown>): any {
  return {
    get: vi.fn(async (key: string) => {
      const data = files[key]
      if (!data) return null
      return { json: async () => data, text: async () => JSON.stringify(data) }
    }),
  }
}

function createMockAI() {
  return { run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })) }
}

function createMockVectorize(
  matches: Array<{ id: string; score: number; metadata?: Record<string, any> }>,
) {
  return { query: vi.fn(async () => ({ matches })) }
}

// ── Base test data ───────────────────────────────────────────────────────────

const coreNode = makeNode({
  id: 'core:wound-roll',
  layer: 'core',
  category: 'core-mechanic',
  title: 'Wound Roll',
  summary: 'How the wound roll works',
  content: 'The wound roll determines...',
  keywords: ['wound roll'],
})

const factionNode = makeNode({
  id: 'faction:necrons:reanimation',
  layer: 'faction',
  category: 'faction-ability',
  title: 'Reanimation Protocols',
  summary: 'Necrons repair themselves',
  content: 'At the start of each turn...',
  factionId: 'necrons',
  keywords: ['necrons', 'reanimation'],
})

const genericNode = makeNode({
  id: 'core:advance',
  layer: 'core',
  category: 'core-mechanic',
  title: 'Advance',
  summary: 'Advance move',
  content: 'A unit can advance...',
  keywords: ['advance'],
})

function makeBucket(nodes: Node[]) {
  return createMockBucket({
    'manifest.json': { files: { 'nodes/test.json': 'v1' } },
    'nodes/test.json': nodes,
    'refs/reverse-index.json': {},
    'refs/forward-index.json': {},
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('retrieve', () => {
  beforeEach(() => {
    resetManifestCache()
  })

  it('detects faction from query and returns in detected field', async () => {
    const ai = createMockAI()
    const vectorize = createMockVectorize([
      {
        id: factionNode.id,
        score: 0.9,
        metadata: { factionId: 'necrons', layer: 'faction', category: 'faction-ability' },
      },
    ])
    const bucket = makeBucket([factionNode])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'how do necrons score objectives', limit: 10 }, env)

    expect(result.detected.factions).toContain('necrons')
  })

  it('strips faction from query before generating embedding', async () => {
    const ai = createMockAI()
    const vectorize = createMockVectorize([])
    const bucket = makeBucket([])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    await retrieve({ query: 'how do necrons score objectives', limit: 10 }, env)

    // The text passed to AI should NOT contain 'necron'
    const aiCall = (ai.run as ReturnType<typeof vi.fn>).mock.calls[0]
    const inputText: string = aiCall[1].text[0]
    expect(inputText.toLowerCase()).not.toContain('necron')
  })

  it('returns strippedQuery in detected field', async () => {
    const ai = createMockAI()
    const vectorize = createMockVectorize([])
    const bucket = makeBucket([])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'how do necrons score objectives', limit: 10 }, env)

    expect(result.detected.strippedQuery.toLowerCase()).not.toContain('necron')
  })

  it('returns keywords in detected field', async () => {
    const ai = createMockAI()
    const vectorize = createMockVectorize([])
    const bucket = makeBucket([])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve(
      { query: 'how does feel no pain work with mortals', limit: 10 },
      env,
    )

    expect(result.detected.keywords).toContain('feel no pain')
    expect(result.detected.keywords).toContain('mortal wound')
  })

  it('returns empty results gracefully when no matches', async () => {
    const ai = createMockAI()
    const vectorize = createMockVectorize([])
    const bucket = makeBucket([])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'how does cover work', limit: 10 }, env)

    expect(result.results).toEqual([])
    expect(result.connected).toEqual([])
    expect(result.parentMap.size).toBe(0)
    expect(result.detected.factions).toEqual([])
  })

  it('sorts faction-matched results before generic even if generic has higher vectorize score', async () => {
    const ai = createMockAI()
    // Generic node has higher score (0.95) but faction node should sort first
    const vectorize = createMockVectorize([
      { id: genericNode.id, score: 0.95, metadata: { layer: 'core', category: 'core-mechanic' } },
      {
        id: factionNode.id,
        score: 0.7,
        metadata: { factionId: 'necrons', layer: 'faction', category: 'faction-ability' },
      },
    ])
    const bucket = makeBucket([genericNode, factionNode])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'necrons reanimation protocols', limit: 10 }, env)

    expect(result.results.length).toBeGreaterThanOrEqual(2)
    // The faction-matched node should appear before the generic node
    const factionIdx = result.results.findIndex((r) => r.id === factionNode.id)
    const genericIdx = result.results.findIndex((r) => r.id === genericNode.id)
    expect(factionIdx).toBeLessThan(genericIdx)
  })

  it('enriches results with score from Vectorize', async () => {
    const ai = createMockAI()
    const vectorize = createMockVectorize([
      { id: coreNode.id, score: 0.88, metadata: { layer: 'core', category: 'core-mechanic' } },
    ])
    const bucket = makeBucket([coreNode])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'wound roll mechanics', limit: 10 }, env)

    expect(result.results).toHaveLength(1)
    expect(result.results[0]!.score).toBe(0.88)
    expect(result.results[0]!.id).toBe(coreNode.id)
    expect(result.results[0]!.title).toBe(coreNode.title)
    expect(result.results[0]!.content).toBe(coreNode.content)
    expect(result.results[0]!.summary).toBe(coreNode.summary)
    expect(result.results[0]!.layer).toBe(coreNode.layer)
    expect(result.results[0]!.category).toBe(coreNode.category)
  })

  it('respects the limit option', async () => {
    const nodes = Array.from({ length: 20 }, (_, i) =>
      makeNode({ id: `core:node-${i}`, title: `Node ${i}` }),
    )
    const ai = createMockAI()
    const vectorize = createMockVectorize(
      nodes.map((n, i) => ({
        id: n.id,
        score: 1 - i * 0.01,
        metadata: { layer: 'core', category: 'core-mechanic' },
      })),
    )
    const bucket = makeBucket(nodes)

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'generic rules', limit: 5 }, env)

    expect(result.results.length).toBeLessThanOrEqual(5)
  })

  it('defaults limit to 10', async () => {
    const nodes = Array.from({ length: 20 }, (_, i) =>
      makeNode({ id: `core:node-${i}`, title: `Node ${i}` }),
    )
    const ai = createMockAI()
    const vectorize = createMockVectorize(
      nodes.map((n, i) => ({
        id: n.id,
        score: 1 - i * 0.01,
        metadata: { layer: 'core', category: 'core-mechanic' },
      })),
    )
    const bucket = makeBucket(nodes)

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'generic rules' }, env)

    expect(result.results.length).toBeLessThanOrEqual(10)
  })

  it('caps limit at 50', async () => {
    const nodes = Array.from({ length: 60 }, (_, i) =>
      makeNode({ id: `core:node-${i}`, title: `Node ${i}` }),
    )
    const ai = createMockAI()
    const vectorize = createMockVectorize(
      nodes.map((n, i) => ({
        id: n.id,
        score: 1 - i * 0.01,
        metadata: { layer: 'core', category: 'core-mechanic' },
      })),
    )
    const bucket = makeBucket(nodes)

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'generic rules', limit: 100 }, env)

    expect(result.results.length).toBeLessThanOrEqual(50)
  })

  it('dualEmbedding generates second embedding from keywords when they exist', async () => {
    const ai = createMockAI()
    const vectorize = createMockVectorize([])
    const bucket = makeBucket([])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    await retrieve(
      { query: 'how does feel no pain interact with mortal wounds', dualEmbedding: true },
      env,
    )

    // Should have called AI twice: once for main query, once for keywords
    expect((ai.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  it('dualEmbedding does NOT generate second embedding when no keywords found', async () => {
    const ai = createMockAI()
    const vectorize = createMockVectorize([])
    const bucket = makeBucket([])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    await retrieve({ query: 'what colour are necrons', dualEmbedding: true }, env)

    // No mechanic keywords → only one AI call
    expect((ai.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('dualEmbedding merges and deduplicates results from both queries', async () => {
    const ai = createMockAI()
    // First query returns nodeA, keyword query returns nodeA + nodeB (nodeA is deduped)
    const nodeA = makeNode({ id: 'core:node-a', title: 'Node A' })
    const nodeB = makeNode({ id: 'core:node-b', title: 'Node B' })

    const vectorize = {
      query: vi
        .fn()
        // primary unfiltered
        .mockResolvedValueOnce({
          matches: [
            { id: nodeA.id, score: 0.9, metadata: { layer: 'core', category: 'core-mechanic' } },
          ],
        })
        // keyword unfiltered
        .mockResolvedValueOnce({
          matches: [
            { id: nodeA.id, score: 0.8, metadata: { layer: 'core', category: 'core-mechanic' } },
            { id: nodeB.id, score: 0.7, metadata: { layer: 'core', category: 'core-mechanic' } },
          ],
        }),
    }
    const bucket = makeBucket([nodeA, nodeB])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'feel no pain mortal wounds', dualEmbedding: true }, env)

    const ids = result.results.map((r) => r.id)
    expect(ids).toContain(nodeA.id)
    expect(ids).toContain(nodeB.id)
    // nodeA should only appear once
    expect(ids.filter((id) => id === nodeA.id)).toHaveLength(1)
  })

  it('does not return connected nodes by default (includeConnected defaults to false)', async () => {
    const connectedNode = makeNode({
      id: 'faction:blood-angels:red-thirst',
      title: 'Red Thirst',
      layer: 'faction',
      category: 'faction-ability',
    })
    const ai = createMockAI()
    const vectorize = createMockVectorize([
      { id: coreNode.id, score: 0.9, metadata: { layer: 'core', category: 'core-mechanic' } },
    ])
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/test.json': 'v1' } },
      'nodes/test.json': [coreNode, connectedNode],
      'refs/reverse-index.json': {
        'core:wound-roll': [
          {
            sourceId: connectedNode.id,
            rel: 'modifies',
            context: 'BA wound roll',
            factionId: 'blood-angels',
          },
        ],
      },
      'refs/forward-index.json': {},
    })

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'wound roll', includeConnected: false }, env)

    expect(result.connected).toEqual([])
  })

  it('fetches connected nodes when includeConnected is true', async () => {
    const connectedNode = makeNode({
      id: 'faction:blood-angels:red-thirst',
      title: 'Red Thirst',
      layer: 'faction',
      category: 'faction-ability',
      factionId: 'blood-angels',
    })
    const ai = createMockAI()
    const vectorize = createMockVectorize([
      { id: coreNode.id, score: 0.9, metadata: { layer: 'core', category: 'core-mechanic' } },
    ])
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/test.json': 'v1' } },
      'nodes/test.json': [coreNode, connectedNode],
      'refs/reverse-index.json': {
        'core:wound-roll': [
          {
            sourceId: connectedNode.id,
            rel: 'modifies',
            context: 'BA wound roll',
            factionId: 'blood-angels',
          },
        ],
      },
      'refs/forward-index.json': {},
    })

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'wound roll', includeConnected: true }, env)

    expect(result.connected.length).toBeGreaterThan(0)
    const ids = result.connected.map((r) => r.id)
    expect(ids).toContain(connectedNode.id)
  })

  it('resolves parentUnit from parentMap on connected nodes', async () => {
    const datashetNode = makeNode({
      id: 'datasheet:blood-angels:captain',
      title: 'Captain',
      layer: 'unit',
      category: 'datasheet',
      keywords: ['blood angels'],
    })
    const abilityNode = makeNode({
      id: 'ability:blood-angels:rites',
      title: 'Rites of Battle',
      layer: 'unit',
      category: 'unit-ability',
      factionId: 'blood-angels',
    })
    const ai = createMockAI()
    const vectorize = createMockVectorize([
      { id: coreNode.id, score: 0.9, metadata: { layer: 'core', category: 'core-mechanic' } },
    ])
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/test.json': 'v1' } },
      'nodes/test.json': [coreNode, datashetNode, abilityNode],
      'refs/reverse-index.json': {
        'core:wound-roll': [
          {
            sourceId: abilityNode.id,
            rel: 'modifies',
            context: 'ability context',
            factionId: 'blood-angels',
          },
        ],
      },
      'refs/forward-index.json': {
        'ability:blood-angels:rites': [
          { targetId: datashetNode.id, rel: 'part_of', context: 'belongs to' },
        ],
      },
    })

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'wound roll', includeConnected: true }, env)

    const ability = result.connected.find((r) => r.id === abilityNode.id)
    expect(ability).toBeDefined()
    expect(ability!.parentUnit).toBe('Captain [Blood Angels only]')
  })

  it('applies subfaction sort: subfaction-matched first, then faction-matched, then generic', async () => {
    const subfactionNode = makeNode({
      id: 'faction:space-marines:blood-angels:specific',
      layer: 'faction',
      category: 'faction-ability',
      title: 'BA Specific',
      factionId: 'space-marines',
      subfaction: 'blood angels',
    })
    const factionOnlyNode = makeNode({
      id: 'faction:space-marines:generic-sm',
      layer: 'faction',
      category: 'faction-ability',
      title: 'SM Generic',
      factionId: 'space-marines',
    })
    const ai = createMockAI()
    // Generic score is highest, but subfaction should sort first
    const vectorize = createMockVectorize([
      { id: genericNode.id, score: 0.99, metadata: { layer: 'core', category: 'core-mechanic' } },
      {
        id: factionOnlyNode.id,
        score: 0.8,
        metadata: { factionId: 'space-marines', layer: 'faction', category: 'faction-ability' },
      },
      {
        id: subfactionNode.id,
        score: 0.6,
        metadata: {
          factionId: 'space-marines',
          subfaction: 'blood angels',
          layer: 'faction',
          category: 'faction-ability',
        },
      },
    ])
    const bucket = makeBucket([genericNode, factionOnlyNode, subfactionNode])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'blood angels stratagems', limit: 10 }, env)

    const subfactionIdx = result.results.findIndex((r) => r.id === subfactionNode.id)
    const factionIdx = result.results.findIndex((r) => r.id === factionOnlyNode.id)
    const genericIdx = result.results.findIndex((r) => r.id === genericNode.id)

    expect(subfactionIdx).toBeLessThan(factionIdx)
    expect(factionIdx).toBeLessThan(genericIdx)
  })

  it('includes factionId and subfaction in enriched results', async () => {
    const ai = createMockAI()
    const vectorize = createMockVectorize([
      {
        id: factionNode.id,
        score: 0.9,
        metadata: { factionId: 'necrons', layer: 'faction', category: 'faction-ability' },
      },
    ])
    const bucket = makeBucket([factionNode])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'necrons reanimation', limit: 10 }, env)

    expect(result.results).toHaveLength(1)
    expect(result.results[0]!.factionId).toBe('necrons')
  })

  it('passes faction filter to Vectorize query when faction detected', async () => {
    const ai = createMockAI()
    const vectorize = createMockVectorize([])
    const bucket = makeBucket([])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    await retrieve({ query: 'necrons advance move', limit: 10 }, env)

    const queryCall = (vectorize.query as ReturnType<typeof vi.fn>).mock.calls[0]
    // Second arg is options — should include a filter
    expect(queryCall[1]).toHaveProperty('filter')
  })

  // ── Faction browse mode ──────────────────────────────────────────────────

  it('uses faction browse when query is just a faction name (stripped query empty)', async () => {
    const baNode = makeNode({
      id: 'faction:space-marines:ba-detachment',
      layer: 'faction',
      category: 'detachment-rule',
      title: 'Rage-cursed Onslaught',
      factionId: 'space-marines',
      subfaction: 'blood angels',
    })
    const smNode = makeNode({
      id: 'faction:space-marines:gladius',
      layer: 'faction',
      category: 'detachment-rule',
      title: 'Gladius Task Force',
      factionId: 'space-marines',
    })
    const orkNode = makeNode({
      id: 'faction:orks:waaagh',
      layer: 'faction',
      category: 'faction-ability',
      title: 'Waaagh',
      factionId: 'orks',
    })
    const ai = createMockAI()
    const vectorize = createMockVectorize([]) // should NOT be called
    const bucket = createMockBucket({
      'manifest.json': {
        files: {
          'nodes/faction-space-marines.json': 'h',
          'nodes/faction-orks.json': 'h',
          'nodes/core.json': 'h',
        },
      },
      'nodes/faction-space-marines.json': [baNode, smNode],
      'nodes/faction-orks.json': [orkNode],
      'nodes/core.json': [coreNode],
    })

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'blood angels', limit: 50 }, env)

    // Should NOT call Vectorize — this is a direct R2 fetch
    expect((vectorize.query as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
    // Should return BA and generic SM content, not orks
    const ids = result.results.map((r) => r.id)
    expect(ids).toContain(baNode.id)
    expect(ids).toContain(smNode.id)
    expect(ids).not.toContain(orkNode.id)
    // BA-specific should come before generic SM
    const baIdx = result.results.findIndex((r) => r.id === baNode.id)
    const smIdx = result.results.findIndex((r) => r.id === smNode.id)
    expect(baIdx).toBeLessThan(smIdx)
  })

  it('faction browse excludes other subfactions', async () => {
    const baNode = makeNode({
      id: 'ba:1',
      layer: 'faction',
      category: 'detachment-rule',
      title: 'BA Detachment',
      factionId: 'space-marines',
      subfaction: 'blood angels',
    })
    const swNode = makeNode({
      id: 'sw:1',
      layer: 'faction',
      category: 'detachment-rule',
      title: 'SW Detachment',
      factionId: 'space-marines',
      subfaction: 'space wolves',
    })
    const ai = createMockAI()
    const vectorize = createMockVectorize([])
    const bucket = createMockBucket({
      'manifest.json': {
        files: { 'nodes/faction-space-marines.json': 'h', 'nodes/core.json': 'h' },
      },
      'nodes/faction-space-marines.json': [baNode, swNode],
      'nodes/core.json': [],
    })

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'blood angels', limit: 50 }, env)

    const ids = result.results.map((r) => r.id)
    expect(ids).toContain(baNode.id)
    expect(ids).not.toContain(swNode.id)
  })

  it('faction browse still works for non-subfaction factions like necrons', async () => {
    const ai = createMockAI()
    const vectorize = createMockVectorize([])
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/faction-necrons.json': 'h', 'nodes/core.json': 'h' } },
      'nodes/faction-necrons.json': [factionNode],
      'nodes/core.json': [coreNode],
    })

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'necrons', limit: 50 }, env)

    expect((vectorize.query as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
    expect(result.results.map((r) => r.id)).toContain(factionNode.id)
  })

  it('post-filters results by faction: keeps faction-match and generic, drops other-faction', async () => {
    const necronNode = makeNode({
      id: 'faction:necrons:rp',
      layer: 'faction',
      category: 'faction-ability',
      title: 'RP',
      factionId: 'necrons',
    })
    const orkNode = makeNode({
      id: 'faction:orks:waagh',
      layer: 'faction',
      category: 'faction-ability',
      title: 'Waaagh',
      factionId: 'orks',
    })
    const ai = createMockAI()
    const vectorize = createMockVectorize([
      { id: genericNode.id, score: 0.9, metadata: { layer: 'core', category: 'core-mechanic' } },
      {
        id: necronNode.id,
        score: 0.85,
        metadata: { factionId: 'necrons', layer: 'faction', category: 'faction-ability' },
      },
      {
        id: orkNode.id,
        score: 0.8,
        metadata: { factionId: 'orks', layer: 'faction', category: 'faction-ability' },
      },
    ])
    const bucket = makeBucket([genericNode, necronNode, orkNode])

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'necrons advance', limit: 10 }, env)

    const ids = result.results.map((r) => r.id)
    expect(ids).toContain(genericNode.id)
    expect(ids).toContain(necronNode.id)
    expect(ids).not.toContain(orkNode.id)
  })
})

// ── returnRecords tests ────────────────────────────────────────────────────────

describe('retrieve with returnRecords', () => {
  beforeEach(() => {
    resetManifestCache()
  })

  const makeDatasheet = (id: string, title: string, factionId?: string): Node =>
    makeNode({
      id,
      layer: 'unit',
      category: 'datasheet',
      title,
      factionId,
    })

  const makeWeapon = (id: string, title: string, datasheetId: string): Node =>
    makeNode({
      id,
      layer: 'unit',
      category: 'weapon',
      title,
      datasheetId,
    })

  it('returns records array when returnRecords is true', async () => {
    const datasheet = makeDatasheet('datasheet:necrons:warriors', 'Necron Warriors', 'necrons')
    const weapon = makeWeapon(
      'weapon:necrons:warriors:gauss',
      'Gauss Flayer',
      'datasheet:necrons:warriors',
    )

    const ai = createMockAI()
    // Vectorize returns the weapon — its parent datasheet is NOT in the results
    const vectorize = createMockVectorize([
      {
        id: weapon.id,
        score: 0.85,
        metadata: { layer: 'unit', category: 'weapon', datasheetId: datasheet.id },
      },
    ])
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/necrons.json': 'v1' } },
      'nodes/necrons.json': [datasheet, weapon],
      'refs/reverse-index.json': {},
      'refs/forward-index.json': {},
    })

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'gauss flayer', limit: 10, returnRecords: true }, env)

    expect(result.records).toBeDefined()
    expect(result.records!.length).toBe(1)
    expect(result.records![0]!.type).toBe('unit')
    // Primary node should be the datasheet (parent), not the weapon
    expect(result.records![0]!.primaryNode.id).toBe(datasheet.id)
    // The weapon should appear as a matched child
    expect(result.records![0]!.matchedChildIds).toContain(weapon.id)
  })

  it('returns undefined records when returnRecords is false', async () => {
    const datasheet = makeDatasheet('datasheet:necrons:warriors', 'Necron Warriors', 'necrons')

    const ai = createMockAI()
    const vectorize = createMockVectorize([
      { id: datasheet.id, score: 0.9, metadata: { layer: 'unit', category: 'datasheet' } },
    ])
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/necrons.json': 'v1' } },
      'nodes/necrons.json': [datasheet],
      'refs/reverse-index.json': {},
      'refs/forward-index.json': {},
    })

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve(
      { query: 'necron warriors', limit: 10, returnRecords: false },
      env,
    )

    expect(result.records).toBeUndefined()
  })

  it('returns undefined records when returnRecords is omitted', async () => {
    const datasheet = makeDatasheet('datasheet:necrons:warriors', 'Necron Warriors', 'necrons')

    const ai = createMockAI()
    const vectorize = createMockVectorize([
      { id: datasheet.id, score: 0.9, metadata: { layer: 'unit', category: 'datasheet' } },
    ])
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/necrons.json': 'v1' } },
      'nodes/necrons.json': [datasheet],
      'refs/reverse-index.json': {},
      'refs/forward-index.json': {},
    })

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'necron warriors', limit: 10 }, env)

    expect(result.records).toBeUndefined()
  })

  it('deduplicates: datasheet matched directly creates one unit record (not two)', async () => {
    const datasheet = makeDatasheet('datasheet:necrons:warriors', 'Necron Warriors', 'necrons')

    const ai = createMockAI()
    const vectorize = createMockVectorize([
      { id: datasheet.id, score: 0.95, metadata: { layer: 'unit', category: 'datasheet' } },
    ])
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/necrons.json': 'v1' } },
      'nodes/necrons.json': [datasheet],
      'refs/reverse-index.json': {},
      'refs/forward-index.json': {},
    })

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'necron warriors', limit: 10, returnRecords: true }, env)

    expect(result.records).toBeDefined()
    expect(result.records!.length).toBe(1)
    expect(result.records![0]!.primaryNode.id).toBe(datasheet.id)
    expect(result.records![0]!.matchedChildIds).toHaveLength(0)
  })

  it('records still available alongside results (backwards compatibility)', async () => {
    const datasheet = makeDatasheet('datasheet:necrons:warriors', 'Necron Warriors', 'necrons')

    const ai = createMockAI()
    const vectorize = createMockVectorize([
      { id: datasheet.id, score: 0.9, metadata: { layer: 'unit', category: 'datasheet' } },
    ])
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/necrons.json': 'v1' } },
      'nodes/necrons.json': [datasheet],
      'refs/reverse-index.json': {},
      'refs/forward-index.json': {},
    })

    const env: RetrieveEnv = { ai, vectorize, bucket }
    const result = await retrieve({ query: 'necron warriors', limit: 10, returnRecords: true }, env)

    // Old field still present
    expect(result.results).toBeDefined()
    expect(result.results.length).toBeGreaterThan(0)
    // New field also present
    expect(result.records).toBeDefined()
  })
})
