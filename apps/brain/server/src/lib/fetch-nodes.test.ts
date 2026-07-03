import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchConnectedNodes, fetchNodesFromR2, resetManifestCache } from './fetch-nodes'
import type { Node } from './model'

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeNode = (overrides: Partial<Node>): Node => ({
  id: 'core:test',
  layer: 'core',
  category: 'core-mechanic',
  title: 'Test',
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

// ── fetchNodesFromR2 ─────────────────────────────────────────────────────────

describe('fetchNodesFromR2', () => {
  beforeEach(() => {
    resetManifestCache()
  })

  it('fetches nodes by ID from mock R2', async () => {
    const baNode = makeNode({
      id: 'faction:blood-angels:sustained-hits',
      factionId: 'blood-angels',
      title: 'Sustained Hits',
    })
    const coreNode = makeNode({ id: 'core:wound-roll', title: 'Wound Roll' })

    const bucket = createMockBucket({
      'manifest.json': {
        files: { 'nodes/faction-blood-angels.json': 'v1', 'nodes/core.json': 'v1' },
      },
      'nodes/faction-blood-angels.json': [baNode],
      'nodes/core.json': [coreNode],
    })

    const result = await fetchNodesFromR2(bucket, [
      'faction:blood-angels:sustained-hits',
      'core:wound-roll',
    ])
    expect(result).toHaveLength(2)
    expect(result.map((n) => n.id)).toContain('faction:blood-angels:sustained-hits')
    expect(result.map((n) => n.id)).toContain('core:wound-roll')
  })

  it('returns empty array when manifest is missing', async () => {
    const bucket = createMockBucket({})
    const result = await fetchNodesFromR2(bucket, ['faction:blood-angels:sustained-hits'])
    expect(result).toEqual([])
  })

  it('returns empty array when no nodeIds match', async () => {
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/core.json': 'v1' } },
      'nodes/core.json': [makeNode({ id: 'core:wound-roll' })],
    })
    const result = await fetchNodesFromR2(bucket, ['nonexistent:node'])
    expect(result).toEqual([])
  })

  it('caches the manifest — second call does not re-fetch manifest.json', async () => {
    const node = makeNode({ id: 'core:wound-roll' })
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/core.json': 'v1' } },
      'nodes/core.json': [node],
    })

    await fetchNodesFromR2(bucket, ['core:wound-roll'])
    await fetchNodesFromR2(bucket, ['core:wound-roll'])

    const manifestCalls = (bucket.get as ReturnType<typeof vi.fn>).mock.calls.filter(
      (args: string[]) => args[0] === 'manifest.json',
    )
    expect(manifestCalls).toHaveLength(1)
  })

  it('stops early once all nodeIds are found', async () => {
    const node = makeNode({ id: 'core:wound-roll' })
    const bucket = createMockBucket({
      'manifest.json': {
        files: { 'nodes/core.json': 'v1', 'nodes/faction-blood-angels.json': 'v1' },
      },
      'nodes/core.json': [node],
      'nodes/faction-blood-angels.json': [makeNode({ id: 'faction:blood-angels:x' })],
    })

    const result = await fetchNodesFromR2(bucket, ['core:wound-roll'])
    expect(result).toHaveLength(1)
    // Should not have fetched the second file since idSet was exhausted
    const fileCalls = (bucket.get as ReturnType<typeof vi.fn>).mock.calls.filter(
      (args: string[]) => args[0] === 'nodes/faction-blood-angels.json',
    )
    expect(fileCalls).toHaveLength(0)
  })
})

// ── fetchConnectedNodes ──────────────────────────────────────────────────────

describe('fetchConnectedNodes', () => {
  beforeEach(() => {
    resetManifestCache()
  })

  // Blood Angels ability that references the core rule
  const baAbility = makeNode({
    id: 'faction:blood-angels:red-thirst',
    factionId: 'blood-angels',
    title: 'Red Thirst',
    category: 'faction-ability',
    layer: 'faction',
    keywords: ['blood angels'],
  })

  // Space Wolves ability that also references the core rule
  const swAbility = makeNode({
    id: 'faction:space-wolves:savage-fury',
    factionId: 'space-wolves',
    title: 'Savage Fury',
    category: 'faction-ability',
    layer: 'faction',
    keywords: ['space wolves'],
  })

  // Generic SM ability that also references the core rule
  const genericAbility = makeNode({
    id: 'faction:space-marines:gene-seed',
    factionId: 'space-marines',
    title: 'Gene-Seed Purity',
    category: 'faction-ability',
    layer: 'faction',
    keywords: [],
  })

  const reverseIndex = {
    'core:sustained-hits': [
      {
        sourceId: 'faction:blood-angels:red-thirst',
        rel: 'modifies',
        context: 'BA sustained hits',
        factionId: 'blood-angels',
      },
      {
        sourceId: 'faction:space-wolves:savage-fury',
        rel: 'modifies',
        context: 'SW sustained hits',
        factionId: 'space-wolves',
      },
      {
        sourceId: 'faction:space-marines:gene-seed',
        rel: 'modifies',
        context: 'Generic',
        factionId: 'space-marines',
      },
    ],
  }

  const forwardIndex = {}

  function makeBucket() {
    return createMockBucket({
      'manifest.json': {
        files: {
          'nodes/faction-blood-angels.json': 'v1',
          'nodes/faction-space-wolves.json': 'v1',
          'nodes/faction-space-marines.json': 'v1',
        },
      },
      'nodes/faction-blood-angels.json': [baAbility],
      'nodes/faction-space-wolves.json': [swAbility],
      'nodes/faction-space-marines.json': [genericAbility],
      'refs/reverse-index.json': reverseIndex,
      'refs/forward-index.json': forwardIndex,
    })
  }

  it('returns empty when depth is 0', async () => {
    const bucket = makeBucket()
    const result = await fetchConnectedNodes(bucket, ['core:sustained-hits'], 0)
    expect(result.nodes).toHaveLength(0)
    expect(result.parentMap.size).toBe(0)
  })

  it('returns empty when reverse index is missing', async () => {
    const bucket = createMockBucket({
      'refs/forward-index.json': forwardIndex,
    })
    const result = await fetchConnectedNodes(bucket, ['core:sustained-hits'], 1)
    expect(result.nodes).toHaveLength(0)
  })

  it('returns all connected nodes when no faction filter is set', async () => {
    const bucket = makeBucket()
    const result = await fetchConnectedNodes(bucket, ['core:sustained-hits'], 1)
    expect(result.nodes.length).toBeGreaterThan(0)
    const ids = result.nodes.map((n) => n.id)
    expect(ids).toContain('faction:blood-angels:red-thirst')
    expect(ids).toContain('faction:space-wolves:savage-fury')
  })

  it('filters by factionId — includes matching faction and generic (no faction)', async () => {
    const bucket = makeBucket()
    const result = await fetchConnectedNodes(bucket, ['core:sustained-hits'], 1, {
      factionId: 'blood-angels',
    })
    expect(result.nodes.length).toBeGreaterThan(0)
    const ids = result.nodes.map((n) => n.id)
    expect(ids).toContain('faction:blood-angels:red-thirst')
  })

  it('filters by factionId — excludes non-matching factions', async () => {
    const bucket = makeBucket()
    const result = await fetchConnectedNodes(bucket, ['core:sustained-hits'], 1, {
      factionId: 'blood-angels',
    })
    expect(result.nodes.length).toBeGreaterThan(0)
    const ids = result.nodes.map((n) => n.id)
    // Space Wolves node must NOT be included
    expect(ids).not.toContain('faction:space-wolves:savage-fury')
  })

  it('resolves parentMap to parent title with chapter suffix', async () => {
    const dsNode = makeNode({
      id: 'datasheet:blood-angels:captain',
      title: 'Captain',
      category: 'datasheet',
      keywords: ['blood angels'],
    })
    const abilityNode = makeNode({
      id: 'ability:blood-angels:rites-of-battle',
      title: 'Rites of Battle',
      category: 'unit-ability',
      keywords: ['blood angels'],
    })

    const revIdx = {
      'core:sustained-hits': [
        {
          sourceId: 'ability:blood-angels:rites-of-battle',
          rel: 'modifies',
          context: 'test',
          factionId: 'blood-angels',
        },
      ],
    }
    const fwdIdx = {
      'ability:blood-angels:rites-of-battle': [
        { targetId: 'datasheet:blood-angels:captain', rel: 'part_of', context: 'belongs to' },
      ],
    }

    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/faction-blood-angels.json': 'v1' } },
      'nodes/faction-blood-angels.json': [dsNode, abilityNode],
      'refs/reverse-index.json': revIdx,
      'refs/forward-index.json': fwdIdx,
    })

    const result = await fetchConnectedNodes(bucket, ['core:sustained-hits'], 1)
    expect(result.nodes.length).toBeGreaterThan(0)
    const parentTitle = result.parentMap.get('ability:blood-angels:rites-of-battle')
    expect(parentTitle).toBe('Captain [Blood Angels only]')
  })

  it('returns empty when no inbound refs exist for given nodeIds', async () => {
    const bucket = createMockBucket({
      'refs/reverse-index.json': {},
      'refs/forward-index.json': {},
    })
    const result = await fetchConnectedNodes(bucket, ['core:sustained-hits'], 1)
    expect(result.nodes).toHaveLength(0)
  })
})
