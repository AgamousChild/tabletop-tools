import { describe, expect, it } from 'vitest'

import { backfillEdition, inferFactionIdFromKeywords } from './backfill-edition'
import type { Node } from './model'

function makeNode(overrides: Partial<Node>): Node {
  return {
    id: 'community:test',
    layer: 'community',
    category: 'tactic',
    title: 'Test Tactic',
    content: 'Some tactical content long enough to satisfy validation requirements.',
    summary: 'Test summary.',
    sources: [{ type: 'manual', title: 'Manual', retrievedAt: '2026-06-27T00:00:00Z' }],
    refs: [],
    version: 1,
    keywords: [],
    ...overrides,
  }
}

describe('backfillEdition', () => {
  it('sets edition to 11th on a node missing edition', () => {
    const node = makeNode({ edition: undefined })
    const { nodes, stats } = backfillEdition([node])
    expect(nodes[0]!.edition).toBe('11th')
    expect(stats.editionSet).toBe(1)
  })

  it('leaves an already-tagged node unchanged', () => {
    const node = makeNode({ edition: '10th', factionId: 'space-marines' })
    const { nodes, stats } = backfillEdition([node], {
      knownFactionSlugs: new Set(['space-marines']),
    })
    expect(nodes[0]!.edition).toBe('10th')
    expect(nodes[0]!.factionId).toBe('space-marines')
    expect(stats.editionSet).toBe(0)
    expect(stats.factionIdSet).toBe(0)
    expect(stats.alreadyTagged).toBe(1)
  })

  it('infers factionId from a keyword that matches a known faction slug', () => {
    const node = makeNode({
      edition: undefined,
      factionId: undefined,
      keywords: ['necrons', 'reanimation', 'overwatch'],
    })
    const { nodes, stats } = backfillEdition([node], {
      knownFactionSlugs: new Set(['necrons', 'space-marines']),
    })
    expect(nodes[0]!.factionId).toBe('necrons')
    expect(nodes[0]!.edition).toBe('11th')
    expect(stats.editionSet).toBe(1)
    expect(stats.factionIdSet).toBe(1)
  })

  it('does not infer factionId when no keyword matches a known slug', () => {
    const node = makeNode({
      edition: undefined,
      factionId: undefined,
      keywords: ['positioning', 'overwatch', 'terrain'],
    })
    const { nodes, stats } = backfillEdition([node], {
      knownFactionSlugs: new Set(['necrons', 'space-marines']),
    })
    expect(nodes[0]!.factionId).toBeUndefined()
    expect(stats.factionIdSet).toBe(0)
  })

  it('honors a custom defaultEdition', () => {
    const node = makeNode({ edition: undefined })
    const { nodes } = backfillEdition([node], { defaultEdition: '10th' })
    expect(nodes[0]!.edition).toBe('10th')
  })
})

describe('inferFactionIdFromKeywords', () => {
  it('matches keywords that are already canonical slugs', () => {
    expect(inferFactionIdFromKeywords(['necrons'], new Set(['necrons', 'space-marines']))).toBe(
      'necrons',
    )
  })

  it("slugifies mixed-case / spaced keywords (e.g. 'Space Marines')", () => {
    expect(inferFactionIdFromKeywords(['Space Marines'], new Set(['space-marines']))).toBe(
      'space-marines',
    )
  })

  it('returns undefined when nothing matches', () => {
    expect(inferFactionIdFromKeywords(['overwatch'], new Set(['necrons']))).toBeUndefined()
  })

  it('returns undefined for an empty keyword list', () => {
    expect(inferFactionIdFromKeywords([], new Set(['necrons']))).toBeUndefined()
  })
})
