import { describe, it, expect } from 'vitest'
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
  it('normalizes all factionIds to canonical slugs', () => {
    const nodes = [
      makeNode({ id: '001', factionId: 'SM', title: 'Intercessors' }),
      makeNode({ id: '002', factionId: 'CSM', title: 'Chosen' }),
    ]
    const result = mergeSources(nodes, [])
    expect(result.nodes.find(n => n.id === '001')!.factionId).toBe('space-marines')
    expect(result.nodes.find(n => n.id === '002')!.factionId).toBe('chaos-space-marines')
  })

  it('deduplicates nodes with same ID, keeping the first occurrence', () => {
    const nodes = [
      makeNode({ id: '001', title: 'Intercessors', content: 'Game data version', keywords: ['infantry'] }),
      makeNode({ id: '001', title: 'Intercessors', content: 'BSData version', keywords: ['infantry', 'extra-kw'] }),
    ]
    const result = mergeSources(nodes, [])
    const matching = result.nodes.filter(n => n.id === '001')
    expect(matching).toHaveLength(1)
    expect(matching[0]!.content).toBe('Game data version')
    expect(matching[0]!.keywords).toContain('extra-kw')
  })

  it('includes faction name in datasheet summary for embedding disambiguation', () => {
    const nodes = [
      makeNode({ id: '001', factionId: 'death-guard', category: 'datasheet', title: 'Chaos Rhino', summary: 'Chaos Rhino — Dedicated Transports' }),
    ]
    const result = mergeSources(nodes, [])
    const rhino = result.nodes.find(n => n.id === '001')!
    expect(rhino.summary).toContain('Death Guard')
  })

  it('does NOT prefix faction name if already present in summary', () => {
    const nodes = [
      makeNode({ id: '001', factionId: 'death-guard', category: 'datasheet', title: 'Death Guard Rhino', summary: 'Death Guard Rhino — Dedicated Transports' }),
    ]
    const result = mergeSources(nodes, [])
    const rhino = result.nodes.find(n => n.id === '001')!
    expect(rhino.summary.match(/death guard/gi)?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it('appends category tag to non-datasheet nodes that share a title with a datasheet', () => {
    const nodes = [
      makeNode({ id: '001', category: 'datasheet', title: 'Assault Squad', summary: 'Assault Squad — unit' }),
      makeNode({ id: 'det:sm:x:assault-squad', category: 'faction-ability', title: 'ASSAULT SQUAD', summary: 'ASSAULT SQUAD rule text' }),
    ]
    const result = mergeSources(nodes, [])
    const rule = result.nodes.find(n => n.id === 'det:sm:x:assault-squad')!
    expect(rule.summary).toContain('faction rule')
  })

  it('removes refs where either endpoint does not exist', () => {
    const nodes = [
      makeNode({ id: '001', content: 'first', keywords: ['a'] }),
    ]
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
})
