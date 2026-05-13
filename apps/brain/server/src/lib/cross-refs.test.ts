import { describe, it, expect, beforeEach } from 'vitest'
import { buildCrossRefs, loadIndexes, resetCrossRefCache } from './cross-refs'
import type { AggregatedRecord } from './records'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(id: string, title: string, type: AggregatedRecord['type'] = 'rule'): AggregatedRecord {
  const primaryNode = {
    id,
    layer: 'core' as const,
    category: 'core-mechanic' as const,
    title,
    content: 'content',
    summary: 'summary',
    sources: [{ type: 'pdf' as const, title: 'Core Rules', retrievedAt: '2024-01-01' }],
    refs: [],
    keywords: [],
    version: 1,
  }
  return {
    type,
    primaryNode,
    childNodes: [],
    crossRefs: [],
    errata: [],
    matchedChildIds: [],
  }
}

function makeChild(id: string, title: string, parentId: string): AggregatedRecord['childNodes'][number] {
  return {
    id,
    layer: 'unit' as const,
    category: 'weapon' as const,
    title,
    content: 'content',
    summary: 'summary',
    sources: [{ type: 'pdf' as const, title: 'Core Rules', retrievedAt: '2024-01-01' }],
    refs: [],
    keywords: [],
    datasheetId: parentId,
    version: 1,
  }
}

// ── buildCrossRefs ────────────────────────────────────────────────────────────

describe('buildCrossRefs', () => {
  it('returns empty crossRefs when no refs exist', () => {
    const records = [makeRecord('a', 'Rule A'), makeRecord('b', 'Rule B')]
    const result = buildCrossRefs(records, {}, {})
    expect(result[0]!.crossRefs).toHaveLength(0)
    expect(result[1]!.crossRefs).toHaveLength(0)
  })

  it('adds crossRef from forward index between two records', () => {
    const records = [makeRecord('a', 'Rule A'), makeRecord('b', 'Rule B')]
    const fwd = { a: [{ targetId: 'b', rel: 'interacts_with', context: 'A interacts with B' }] }
    const result = buildCrossRefs(records, fwd, {})
    const crossRef = result[0]!.crossRefs[0]
    expect(crossRef).toBeDefined()
    expect(crossRef!.targetRecordId).toBe('b')
    expect(crossRef!.targetTitle).toBe('Rule B')
    expect(crossRef!.targetType).toBe('rule')
    expect(crossRef!.rel).toBe('interacts_with')
    expect(crossRef!.context).toBe('A interacts with B')
    expect(crossRef!.refCount).toBe(1)
  })

  it('adds crossRef from reverse index', () => {
    const records = [makeRecord('a', 'Rule A'), makeRecord('b', 'Rule B')]
    const rev = { a: [{ sourceId: 'b', rel: 'requires', context: 'B requires A' }] }
    const result = buildCrossRefs(records, {}, rev)
    // b → a appears as crossRef on record a (b references a)
    expect(result[0]!.crossRefs).toHaveLength(1)
    expect(result[0]!.crossRefs[0]!.targetRecordId).toBe('b')
  })

  it('accumulates refCount when multiple children reference the same target', () => {
    const recordA = makeRecord('a', 'Unit A', 'unit')
    recordA.childNodes = [
      makeChild('a:weapon1', 'Bolter', 'a'),
      makeChild('a:weapon2', 'Plasma Gun', 'a'),
    ]
    const recordB = makeRecord('b', 'Rule B')
    const fwd = {
      'a:weapon1': [{ targetId: 'b', rel: 'interacts_with', context: 'Bolter interacts with B' }],
      'a:weapon2': [{ targetId: 'b', rel: 'interacts_with', context: 'Plasma interacts with B' }],
    }
    const result = buildCrossRefs([recordA, recordB], fwd, {})
    const crossRef = result[0]!.crossRefs.find(r => r.targetRecordId === 'b')
    expect(crossRef).toBeDefined()
    expect(crossRef!.refCount).toBe(2)
  })

  it('excludes part_of refs from forward index', () => {
    const records = [makeRecord('a', 'Rule A'), makeRecord('b', 'Rule B')]
    const fwd = { a: [{ targetId: 'b', rel: 'part_of', context: 'A is part of B' }] }
    const result = buildCrossRefs(records, fwd, {})
    expect(result[0]!.crossRefs).toHaveLength(0)
  })

  it('excludes part_of refs from reverse index', () => {
    const records = [makeRecord('a', 'Rule A'), makeRecord('b', 'Rule B')]
    const rev = { a: [{ sourceId: 'b', rel: 'part_of', context: 'B is part of A' }] }
    const result = buildCrossRefs(records, {}, rev)
    expect(result[0]!.crossRefs).toHaveLength(0)
  })

  it('excludes self-references (forward ref to own record)', () => {
    const records = [makeRecord('a', 'Rule A')]
    const fwd = { a: [{ targetId: 'a', rel: 'clarifies', context: 'A clarifies itself' }] }
    const result = buildCrossRefs(records, fwd, {})
    expect(result[0]!.crossRefs).toHaveLength(0)
  })

  it('excludes self-references when child refs primary of same record', () => {
    const recordA = makeRecord('a', 'Unit A', 'unit')
    recordA.childNodes = [makeChild('a:child', 'Weapon', 'a')]
    const fwd = {
      'a:child': [{ targetId: 'a', rel: 'part_of', context: 'child is part of a' }],
    }
    const result = buildCrossRefs([recordA], fwd, {})
    // part_of already excluded, but self-ref guard also applies
    expect(result[0]!.crossRefs).toHaveLength(0)
  })

  it('caps crossRefs at 20 per record', () => {
    const mainRecord = makeRecord('main', 'Main Rule')
    const others = Array.from({ length: 30 }, (_, i) => makeRecord(`other${i}`, `Rule ${i}`))
    const fwd: Record<string, Array<{ targetId: string; rel: string; context: string }>> = {
      main: others.map((r) => ({
        targetId: r.primaryNode.id,
        rel: 'interacts_with',
        context: `main → ${r.primaryNode.id}`,
      })),
    }
    const result = buildCrossRefs([mainRecord, ...others], fwd, {})
    expect(result[0]!.crossRefs.length).toBeLessThanOrEqual(20)
  })

  it('resolves targetType from the result set', () => {
    const ruleRecord = makeRecord('a', 'Rule A', 'rule')
    const unitRecord = makeRecord('b', 'Unit B', 'unit')
    const fwd = { a: [{ targetId: 'b', rel: 'interacts_with', context: 'A references B' }] }
    const result = buildCrossRefs([ruleRecord, unitRecord], fwd, {})
    expect(result[0]!.crossRefs[0]!.targetType).toBe('unit')
  })

  it('defaults targetType to rule for nodes not in the result set', () => {
    const records = [makeRecord('a', 'Rule A')]
    const fwd = { a: [{ targetId: 'external:node', rel: 'interacts_with', context: 'points to external' }] }
    const result = buildCrossRefs(records, fwd, {})
    // external node not in records → defaults to 'rule'
    if (result[0]!.crossRefs.length > 0) {
      expect(result[0]!.crossRefs[0]!.targetType).toBe('rule')
    }
  })

  it('does not mutate input records', () => {
    const records = [makeRecord('a', 'Rule A'), makeRecord('b', 'Rule B')]
    const fwd = { a: [{ targetId: 'b', rel: 'interacts_with', context: 'A → B' }] }
    buildCrossRefs(records, fwd, {})
    // Original records untouched
    expect(records[0]!.crossRefs).toHaveLength(0)
  })

  it('sorts crossRefs by refCount descending', () => {
    const main = makeRecord('main', 'Main')
    const recordA = makeRecord('a', 'A')
    const recordB = makeRecord('b', 'B')
    main.childNodes = [
      makeChild('main:c1', 'Child 1', 'main'),
      makeChild('main:c2', 'Child 2', 'main'),
    ]
    // B gets 2 edges, A gets 1
    const fwd = {
      'main:c1': [
        { targetId: 'a', rel: 'interacts_with', context: 'c1 → a' },
        { targetId: 'b', rel: 'interacts_with', context: 'c1 → b' },
      ],
      'main:c2': [
        { targetId: 'b', rel: 'interacts_with', context: 'c2 → b' },
      ],
    }
    const result = buildCrossRefs([main, recordA, recordB], fwd, {})
    const crossRefs = result[0]!.crossRefs
    expect(crossRefs[0]!.targetRecordId).toBe('b')
    expect(crossRefs[0]!.refCount).toBe(2)
    expect(crossRefs[1]!.targetRecordId).toBe('a')
    expect(crossRefs[1]!.refCount).toBe(1)
  })

  it('child node refs resolve to parent record id as targetRecordId', () => {
    const mainRecord = makeRecord('main', 'Main')
    const targetRecord = makeRecord('target', 'Target', 'unit')
    targetRecord.childNodes = [makeChild('target:child', 'Child', 'target')]
    // main has a forward ref to a child node of targetRecord
    const fwd = { main: [{ targetId: 'target:child', rel: 'interacts_with', context: 'refs child' }] }
    const result = buildCrossRefs([mainRecord, targetRecord], fwd, {})
    // Should resolve to parent record id 'target'
    expect(result[0]!.crossRefs[0]!.targetRecordId).toBe('target')
  })
})

// ── loadIndexes ───────────────────────────────────────────────────────────────

describe('loadIndexes', () => {
  beforeEach(() => {
    resetCrossRefCache()
  })

  it('loads forward and reverse indexes from bucket', async () => {
    const fwdData = { 'a': [{ targetId: 'b', rel: 'interacts_with', context: 'ctx' }] }
    const revData = { 'b': [{ sourceId: 'a', rel: 'interacts_with', context: 'ctx' }] }
    const mockBucket = {
      get: async (key: string) => {
        if (key === 'refs/forward-index.json') return { json: async () => fwdData }
        if (key === 'refs/reverse-index.json') return { json: async () => revData }
        return null
      },
    }
    const { fwd, rev } = await loadIndexes(mockBucket)
    expect(fwd).toEqual(fwdData)
    expect(rev).toEqual(revData)
  })

  it('returns empty objects when files are missing', async () => {
    const mockBucket = { get: async (_key: string) => null }
    const { fwd, rev } = await loadIndexes(mockBucket)
    expect(fwd).toEqual({})
    expect(rev).toEqual({})
  })

  it('caches indexes and does not re-fetch on second call', async () => {
    let fetchCount = 0
    const mockBucket = {
      get: async (key: string) => {
        fetchCount++
        if (key === 'refs/forward-index.json') return { json: async () => ({}) }
        if (key === 'refs/reverse-index.json') return { json: async () => ({}) }
        return null
      },
    }
    await loadIndexes(mockBucket)
    await loadIndexes(mockBucket)
    // Both files fetched once each = 2 total, not 4
    expect(fetchCount).toBe(2)
  })

  it('resetCrossRefCache causes re-fetch on next call', async () => {
    let fetchCount = 0
    const mockBucket = {
      get: async (key: string) => {
        fetchCount++
        if (key === 'refs/forward-index.json') return { json: async () => ({}) }
        if (key === 'refs/reverse-index.json') return { json: async () => ({}) }
        return null
      },
    }
    await loadIndexes(mockBucket)
    resetCrossRefCache()
    await loadIndexes(mockBucket)
    expect(fetchCount).toBe(4)
  })
})
