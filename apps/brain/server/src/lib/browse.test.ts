import { describe, expect, it } from 'vitest'

import { filterBrowseNodes } from './browse'
import type { Node } from './model'

const makeNode = (overrides: Partial<Node>): Node => ({
  id: 'test',
  layer: 'core',
  category: 'core-mechanic',
  title: 'Test',
  content: 'test',
  summary: 'test',
  sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-04-20' }],
  refs: [],
  version: 1,
  keywords: [],
  ...overrides,
})

describe('filterBrowseNodes', () => {
  it('excludes weapon nodes', () => {
    const nodes = [
      makeNode({ id: 'ds:1', category: 'datasheet', title: 'Unit' }),
      makeNode({ id: 'w:1', category: 'weapon', datasheetId: 'ds:1' }),
    ]
    const result = filterBrowseNodes(nodes)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ds:1')
  })

  it('excludes unit-ability nodes', () => {
    const nodes = [makeNode({ id: 'a:1', category: 'unit-ability', datasheetId: 'ds:1' })]
    expect(filterBrowseNodes(nodes)).toHaveLength(0)
  })

  it('excludes wargear-option, leader-attachment, unit-composition', () => {
    const nodes = [
      makeNode({ category: 'wargear-option' }),
      makeNode({ id: '2', category: 'leader-attachment' }),
      makeNode({ id: '3', category: 'unit-composition' }),
    ]
    expect(filterBrowseNodes(nodes)).toHaveLength(0)
  })

  it('excludes army-rule sub-rules with parenthetical title', () => {
    const nodes = [
      makeNode({ id: 'f:1', category: 'faction-ability', title: 'Acts of Faith' }),
      makeNode({
        id: 'f:2',
        category: 'faction-ability',
        title: 'GAINING MIRACLE DICE (Acts of Faith)',
      }),
    ]
    const result = filterBrowseNodes(nodes)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Acts of Faith')
  })

  it('keeps faction-ability with detachmentId even with parenthetical', () => {
    const nodes = [
      makeNode({
        category: 'faction-ability',
        detachmentId: 'det:1',
        title: 'Some Rule (Detachment)',
      }),
    ]
    expect(filterBrowseNodes(nodes)).toHaveLength(1)
  })

  it('keeps all top-level categories', () => {
    const nodes = [
      makeNode({ id: '1', category: 'datasheet' }),
      makeNode({ id: '2', category: 'stratagem' }),
      makeNode({ id: '3', category: 'enhancement' }),
      makeNode({ id: '4', category: 'detachment-rule' }),
      makeNode({ id: '5', category: 'faction-ability' }),
      makeNode({ id: '6', category: 'core-mechanic' }),
      makeNode({ id: '7', category: 'phase-sequence' }),
      makeNode({ id: '8', category: 'faq' }),
      makeNode({ id: '9', category: 'commentary' }),
      makeNode({ id: '10', category: 'balance-change' }),
      makeNode({ id: '11', category: 'primary-mission' }),
      makeNode({ id: '12', category: 'twist' }),
    ]
    expect(filterBrowseNodes(nodes)).toHaveLength(12)
  })
})
