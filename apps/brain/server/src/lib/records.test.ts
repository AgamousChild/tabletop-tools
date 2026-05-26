import { describe, expect, it, vi } from 'vitest'

import type { Node } from './model'
import { aggregateToRecords, classifyNode, fetchAllChildren } from './records'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<Node> & { id: string; category: Node['category'] }): Node {
  return {
    layer: 'core',
    title: 'Test Node',
    content: 'Test content.',
    summary: 'Test summary.',
    sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-04-08' }],
    refs: [],
    version: 1,
    keywords: [],
    ...overrides,
  }
}

function createMockBucket(files: Record<string, unknown>): any {
  return {
    get: vi.fn(async (key: string) => {
      const data = files[key]
      if (!data) return null
      return { json: async () => data, text: async () => JSON.stringify(data) }
    }),
  }
}

// ── classifyNode ─────────────────────────────────────────────────────────────

describe('classifyNode', () => {
  it('weapon with datasheetId → unit record', () => {
    const node = makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:1' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('unit')
    expect(result.containerId).toBe('ds:1')
  })

  it('unit-ability with datasheetId → unit record', () => {
    const node = makeNode({ id: 'a:1', category: 'unit-ability', datasheetId: 'ds:1' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('unit')
    expect(result.containerId).toBe('ds:1')
  })

  it('wargear-option with datasheetId → unit record', () => {
    const node = makeNode({ id: 'wg:1', category: 'wargear-option', datasheetId: 'ds:1' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('unit')
    expect(result.containerId).toBe('ds:1')
  })

  it('leader-attachment with datasheetId → unit record', () => {
    const node = makeNode({ id: 'la:1', category: 'leader-attachment', datasheetId: 'ds:1' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('unit')
    expect(result.containerId).toBe('ds:1')
  })

  it('unit-composition with datasheetId → unit record', () => {
    const node = makeNode({ id: 'uc:1', category: 'unit-composition', datasheetId: 'ds:1' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('unit')
    expect(result.containerId).toBe('ds:1')
  })

  it('datasheet → unit record (self)', () => {
    const node = makeNode({ id: 'ds:1', category: 'datasheet' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('unit')
    expect(result.containerId).toBe('ds:1')
  })

  it('faction-ability without detachmentId → army-rule', () => {
    const node = makeNode({
      id: 'faction:adepta-sororitas:acts-of-faith',
      category: 'faction-ability',
      title: 'Acts of Faith',
    })
    const result = classifyNode(node)
    expect(result.recordType).toBe('army-rule')
    expect(result.containerId).toBe('faction:adepta-sororitas:acts-of-faith')
  })

  it('faction-ability sub-rule with parenthetical title → groups under parent', () => {
    const subRule = makeNode({
      id: 'faction:adepta-sororitas:acts-of-faith:gaining-miracle-dice',
      category: 'faction-ability',
      title: 'GAINING MIRACLE DICE (Acts of Faith)',
    })
    const result = classifyNode(subRule)
    expect(result.recordType).toBe('army-rule')
    expect(result.containerId).toBe('faction:adepta-sororitas:acts-of-faith')
  })

  it('faction-ability sub-rule requires 4+ colon-separated segments', () => {
    // Only 3 segments — not a sub-rule despite parenthetical title
    const node = makeNode({
      id: 'faction:space-marines:combat-doctrines',
      category: 'faction-ability',
      title: 'Tactical Doctrine (Combat Doctrines)',
    })
    const result = classifyNode(node)
    expect(result.recordType).toBe('army-rule')
    expect(result.containerId).toBe('faction:space-marines:combat-doctrines')
  })

  it('faction-ability with detachmentId → rule (standalone)', () => {
    const node = makeNode({
      id: 'faction:space-marines:bolter-discipline',
      category: 'faction-ability',
      detachmentId: 'det:space-marines:gladius',
    })
    const result = classifyNode(node)
    expect(result.recordType).toBe('rule')
    expect(result.containerId).toBe(node.id)
  })

  it('detachment-rule → detachment', () => {
    const node = makeNode({ id: 'det:1:rule', category: 'detachment-rule' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('detachment')
    expect(result.containerId).toBe(node.id)
  })

  it('stratagem → stratagem', () => {
    const node = makeNode({ id: 'strat:1', category: 'stratagem' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('stratagem')
    expect(result.containerId).toBe(node.id)
  })

  it('enhancement → enhancement', () => {
    const node = makeNode({ id: 'enh:1', category: 'enhancement' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('enhancement')
    expect(result.containerId).toBe(node.id)
  })

  it('faq → errata', () => {
    const node = makeNode({ id: 'faq:1', category: 'faq', layer: 'errata' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('errata')
    expect(result.containerId).toBe(node.id)
  })

  it('commentary → errata', () => {
    const node = makeNode({ id: 'comm:1', category: 'commentary', layer: 'errata' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('errata')
    expect(result.containerId).toBe(node.id)
  })

  it('balance-change → balance', () => {
    const node = makeNode({ id: 'bal:1', category: 'balance-change', layer: 'balance' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('balance')
    expect(result.containerId).toBe(node.id)
  })

  it('core-mechanic → rule', () => {
    const node = makeNode({ id: 'core:1', category: 'core-mechanic' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('rule')
    expect(result.containerId).toBe(node.id)
  })

  it('primary-mission → primary-mission', () => {
    const node = makeNode({ id: 'mission:1', category: 'primary-mission' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('primary-mission')
    expect(result.containerId).toBe(node.id)
  })

  it('secondary-mission → secondary-mission', () => {
    const node = makeNode({ id: 'sec:1', category: 'secondary-mission' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('secondary-mission')
    expect(result.containerId).toBe(node.id)
  })

  it('deployment-zone → deployment-zone', () => {
    const node = makeNode({ id: 'dz:1', category: 'deployment-zone' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('deployment-zone')
    expect(result.containerId).toBe(node.id)
  })

  it('twist → twist', () => {
    const node = makeNode({ id: 'twist:1', category: 'twist' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('twist')
    expect(result.containerId).toBe(node.id)
  })

  it('challenger → challenger', () => {
    const node = makeNode({ id: 'chal:1', category: 'challenger' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('challenger')
    expect(result.containerId).toBe(node.id)
  })

  it('terrain-layout → terrain-layout', () => {
    const node = makeNode({ id: 'tl:1', category: 'terrain-layout' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('terrain-layout')
    expect(result.containerId).toBe(node.id)
  })

  it('phase-sequence → rule', () => {
    const node = makeNode({ id: 'phase:1', category: 'phase-sequence' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('rule')
    expect(result.containerId).toBe(node.id)
  })

  it('terrain → rule', () => {
    const node = makeNode({ id: 'terrain:1', category: 'terrain' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('rule')
    expect(result.containerId).toBe(node.id)
  })

  it('mission → rule', () => {
    const node = makeNode({ id: 'mission:generic', category: 'mission' })
    const result = classifyNode(node)
    expect(result.recordType).toBe('rule')
    expect(result.containerId).toBe(node.id)
  })
})

// ── aggregateToRecords ────────────────────────────────────────────────────────

describe('aggregateToRecords', () => {
  it('groups weapons under parent datasheet', () => {
    const ds = makeNode({ id: 'ds:1', category: 'datasheet', title: 'Unit' })
    const w1 = makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:1' })
    const w2 = makeNode({ id: 'w:2', category: 'weapon', datasheetId: 'ds:1' })
    const records = aggregateToRecords([w1, w2, ds], new Map())
    expect(records).toHaveLength(1)
    expect(records[0].type).toBe('unit')
    expect(records[0].primaryNode.id).toBe('ds:1')
    expect(records[0].matchedChildIds).toContain('w:1')
    expect(records[0].matchedChildIds).toContain('w:2')
  })

  it('fetches missing parent from allNodes map', () => {
    const w = makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:1' })
    const ds = makeNode({ id: 'ds:1', category: 'datasheet', title: 'Unit' })
    const records = aggregateToRecords([w], new Map([['ds:1', ds]]))
    expect(records).toHaveLength(1)
    expect(records[0].primaryNode.id).toBe('ds:1')
  })

  it('deduplicates — two weapons same datasheet → one record', () => {
    const ds = makeNode({ id: 'ds:1', category: 'datasheet' })
    const w1 = makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:1' })
    const w2 = makeNode({ id: 'w:2', category: 'weapon', datasheetId: 'ds:1' })
    const records = aggregateToRecords([w1, w2, ds], new Map())
    expect(records).toHaveLength(1)
  })

  it('preserves first-seen container order', () => {
    const ds1 = makeNode({ id: 'ds:1', category: 'datasheet', title: 'Unit A' })
    const ds2 = makeNode({ id: 'ds:2', category: 'datasheet', title: 'Unit B' })
    const strat = makeNode({ id: 'strat:1', category: 'stratagem', title: 'Strat' })
    // ds2 weapon seen first, then ds1, then strat
    const w2 = makeNode({ id: 'w:2', category: 'weapon', datasheetId: 'ds:2' })
    const w1 = makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:1' })
    const allNodes = new Map([
      ['ds:1', ds1],
      ['ds:2', ds2],
    ])
    const records = aggregateToRecords([w2, w1, strat], allNodes)
    expect(records[0].primaryNode.id).toBe('ds:2')
    expect(records[1].primaryNode.id).toBe('ds:1')
    expect(records[2].primaryNode.id).toBe('strat:1')
  })

  it('groups army rule sub-rules under parent', () => {
    const parent = makeNode({
      id: 'faction:adepta-sororitas:acts-of-faith',
      category: 'faction-ability',
      title: 'Acts of Faith',
    })
    const subRule = makeNode({
      id: 'faction:adepta-sororitas:acts-of-faith:gaining-miracle-dice',
      category: 'faction-ability',
      title: 'GAINING MIRACLE DICE (Acts of Faith)',
    })
    const allNodes = new Map([['faction:adepta-sororitas:acts-of-faith', parent]])
    const records = aggregateToRecords([subRule], allNodes)
    expect(records).toHaveLength(1)
    expect(records[0].primaryNode.id).toBe('faction:adepta-sororitas:acts-of-faith')
    expect(records[0].matchedChildIds).toContain(
      'faction:adepta-sororitas:acts-of-faith:gaining-miracle-dice',
    )
  })

  it('standalone stratagems produce individual records', () => {
    const s1 = makeNode({ id: 'strat:1', category: 'stratagem', title: 'Strat A' })
    const s2 = makeNode({ id: 'strat:2', category: 'stratagem', title: 'Strat B' })
    const records = aggregateToRecords([s1, s2], new Map())
    expect(records).toHaveLength(2)
    expect(records.map((r) => r.primaryNode.id)).toContain('strat:1')
    expect(records.map((r) => r.primaryNode.id)).toContain('strat:2')
  })

  it('skips containers where primary node not found', () => {
    const w = makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:missing' })
    const records = aggregateToRecords([w], new Map())
    expect(records).toHaveLength(0)
  })

  it('initializes crossRefs and errata as empty arrays', () => {
    const ds = makeNode({ id: 'ds:1', category: 'datasheet', title: 'Unit' })
    const records = aggregateToRecords([ds], new Map())
    expect(records).toHaveLength(1)
    expect(records[0].crossRefs).toEqual([])
    expect(records[0].errata).toEqual([])
  })

  it('datasheet in resultNodes is primary node with no matchedChildIds', () => {
    const ds = makeNode({ id: 'ds:1', category: 'datasheet', title: 'Unit' })
    const records = aggregateToRecords([ds], new Map())
    expect(records).toHaveLength(1)
    expect(records[0].primaryNode.id).toBe('ds:1')
    expect(records[0].matchedChildIds).toHaveLength(0)
  })

  it('childNodes list is populated from result nodes that are children', () => {
    const ds = makeNode({ id: 'ds:1', category: 'datasheet', title: 'Unit' })
    const w1 = makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:1', title: 'Bolter' })
    const w2 = makeNode({ id: 'w:2', category: 'weapon', datasheetId: 'ds:1', title: 'Plasma' })
    const records = aggregateToRecords([ds, w1, w2], new Map())
    expect(records[0].childNodes).toHaveLength(2)
    expect(records[0].childNodes.map((n) => n.id)).toContain('w:1')
    expect(records[0].childNodes.map((n) => n.id)).toContain('w:2')
  })

  it('unit-ability children are included in matchedChildIds', () => {
    const ds = makeNode({ id: 'ds:1', category: 'datasheet', title: 'Unit' })
    const ab = makeNode({ id: 'ab:1', category: 'unit-ability', datasheetId: 'ds:1' })
    const records = aggregateToRecords([ds, ab], new Map())
    expect(records[0].matchedChildIds).toContain('ab:1')
  })
})

// ── fetchAllChildren ──────────────────────────────────────────────────────────

describe('fetchAllChildren', () => {
  it('returns all nodes whose datasheetId is in containerIds', async () => {
    const ds1Id = 'ds:1'
    const w1 = makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:1' })
    const w2 = makeNode({ id: 'w:2', category: 'weapon', datasheetId: 'ds:1' })
    const w3 = makeNode({ id: 'w:3', category: 'weapon', datasheetId: 'ds:2' })
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/unit.json': 'v1' } },
      'nodes/unit.json': [w1, w2, w3],
    })
    const result = await fetchAllChildren(bucket, [ds1Id])
    expect(result.map((n) => n.id)).toContain('w:1')
    expect(result.map((n) => n.id)).toContain('w:2')
    expect(result.map((n) => n.id)).not.toContain('w:3')
  })

  it('returns empty array when manifest is missing', async () => {
    const bucket = createMockBucket({})
    const result = await fetchAllChildren(bucket, ['ds:1'])
    expect(result).toEqual([])
  })

  it('returns empty array when containerIds is empty', async () => {
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/unit.json': 'v1' } },
      'nodes/unit.json': [makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:1' })],
    })
    const result = await fetchAllChildren(bucket, [])
    expect(result).toEqual([])
  })

  it('returns children from multiple container IDs', async () => {
    const w1 = makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:1' })
    const w2 = makeNode({ id: 'w:2', category: 'weapon', datasheetId: 'ds:2' })
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/unit.json': 'v1' } },
      'nodes/unit.json': [w1, w2],
    })
    const result = await fetchAllChildren(bucket, ['ds:1', 'ds:2'])
    expect(result.map((n) => n.id)).toContain('w:1')
    expect(result.map((n) => n.id)).toContain('w:2')
  })

  it('scans all node files, not just the first', async () => {
    const w1 = makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:1' })
    const w2 = makeNode({ id: 'w:2', category: 'weapon', datasheetId: 'ds:1' })
    const bucket = createMockBucket({
      'manifest.json': { files: { 'nodes/file1.json': 'v1', 'nodes/file2.json': 'v1' } },
      'nodes/file1.json': [w1],
      'nodes/file2.json': [w2],
    })
    const result = await fetchAllChildren(bucket, ['ds:1'])
    expect(result.map((n) => n.id)).toContain('w:1')
    expect(result.map((n) => n.id)).toContain('w:2')
  })

  it('skips non-node files in manifest', async () => {
    const w1 = makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:1' })
    const bucket = createMockBucket({
      'manifest.json': {
        files: {
          'nodes/unit.json': 'v1',
          'refs/reverse-index.json': 'v1', // not a node file
        },
      },
      'nodes/unit.json': [w1],
    })
    const result = await fetchAllChildren(bucket, ['ds:1'])
    expect(result).toHaveLength(1)
  })
})
