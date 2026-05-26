import { describe, expect, it } from 'vitest'

import type { BrainManifest } from '../types'
import type { Node, NodeRef } from './model'
import { buildManifest, partitionNodes, partitionRefs } from './sync'

const makeNode = (overrides: Partial<Node>): Node => ({
  id: 'core:test',
  layer: 'core',
  category: 'core-mechanic',
  title: 'Test',
  content: 'content',
  summary: 'summary',
  sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-04-08' }],
  refs: [],
  version: 1,
  keywords: [],
  ...overrides,
})

describe('partitionNodes', () => {
  const nodes: Node[] = [
    makeNode({ id: 'core:wound-roll', layer: 'core' }),
    makeNode({
      id: 'faction:space-marines:oath',
      layer: 'faction',
      category: 'faction-ability',
      factionId: 'space-marines',
    }),
    makeNode({
      id: 'faction:necrons:reanimation',
      layer: 'faction',
      category: 'faction-ability',
      factionId: 'necrons',
    }),
    makeNode({ id: 'errata:core:p10:1', layer: 'errata', category: 'commentary' }),
    makeNode({
      id: 'balance:aeldari:fate',
      layer: 'balance',
      category: 'balance-change',
      factionId: 'aeldari',
    }),
  ]

  it('partitions core nodes into core.json', () => {
    const files = partitionNodes(nodes)
    expect(files['nodes/core.json']).toBeDefined()
    expect(files['nodes/core.json']).toHaveLength(1)
  })

  it('partitions faction nodes by factionId', () => {
    const files = partitionNodes(nodes)
    expect(files['nodes/faction-space-marines.json']).toHaveLength(1)
    expect(files['nodes/faction-necrons.json']).toHaveLength(1)
  })

  it('partitions errata and balance into their own files', () => {
    const files = partitionNodes(nodes)
    expect(files['nodes/errata.json']).toHaveLength(1)
    expect(files['nodes/balance.json']).toHaveLength(1)
  })
})

describe('partitionRefs', () => {
  it('groups refs by their source node file', () => {
    const nodeFileMap = new Map([
      ['core:wound-roll', 'nodes/core.json'],
      ['core:shooting-phase', 'nodes/core.json'],
    ])
    const refs: NodeRef[] = [
      {
        sourceId: 'core:shooting-phase',
        targetId: 'core:wound-roll',
        rel: 'part_of',
        context: 'test',
      },
    ]
    const files = partitionRefs(refs, nodeFileMap)
    expect(files['refs/core-refs.json']).toHaveLength(1)
  })

  it('puts unlinked refs in unlinked-refs.json', () => {
    const nodeFileMap = new Map<string, string>()
    const refs: NodeRef[] = [
      { sourceId: 'unknown:source', targetId: 'unknown:ref', rel: 'part_of', context: 'test' },
    ]
    const files = partitionRefs(refs, nodeFileMap)
    expect(files['refs/unlinked-refs.json']).toHaveLength(1)
  })
})

describe('buildManifest', () => {
  it('creates a manifest with file hashes', () => {
    const files: Record<string, unknown> = {
      'nodes/core.json': [{ id: 'core:test' }],
      'refs/core-refs.json': [{ sourceId: 'a', targetId: 'x', rel: 'part_of', context: 'y' }],
    }
    const manifest = buildManifest(files, null)
    expect(manifest.version).toBe(1)
    expect(manifest.files['nodes/core.json']).toBeDefined()
    expect(manifest.files['refs/core-refs.json']).toBeDefined()
    expect(manifest.updatedAt).toBeTruthy()
  })

  it('increments version from existing manifest', () => {
    const existing: BrainManifest = { version: 5, updatedAt: '', files: {} }
    const manifest = buildManifest({ 'nodes/core.json': [] }, existing)
    expect(manifest.version).toBe(6)
  })

  it('produces deterministic hashes for same content', () => {
    const files = { 'nodes/core.json': [{ id: 'core:test' }] }
    const m1 = buildManifest(files, null)
    const m2 = buildManifest(files, null)
    expect(m1.files['nodes/core.json']).toBe(m2.files['nodes/core.json'])
  })
})
