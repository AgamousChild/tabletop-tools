import { describe, it, expect } from 'vitest'
import { massage } from './massage'
import type { Node } from './model'

// ── Test helper ──────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<Node>): Node {
  return {
    id: 'test:node',
    layer: 'core',
    category: 'phase-sequence',
    title: 'Test Node',
    content: 'This is a valid test node with enough content to pass the minimum length check.',
    summary: 'Test summary with enough text.',
    sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-01-01T00:00:00Z' }],
    refs: [],
    version: 1,
    keywords: [],
    ...overrides,
  }
}

// ── Pass 1 — stat-line title phantoms ────────────────────────────────────────

describe('massage — Pass 1: stat-line title phantoms', () => {
  it('drops a node whose title is just "+"', () => {
    const phantom = makeNode({ id: 'phantom:plus', title: '+' })
    const { nodes, stats } = massage([phantom])
    expect(nodes).toHaveLength(0)
    expect(stats.droppedPhantom).toBe(1)
  })

  it('drops a node with title "10\\" 2+ 6+" (stat block with quotes and digits)', () => {
    const phantom = makeNode({ id: 'phantom:stat1', title: '10" 2+ 6+' })
    const { nodes, stats } = massage([phantom])
    expect(nodes).toHaveLength(0)
    expect(stats.droppedPhantom).toBe(1)
  })

  it('drops a node with title "-3+ 7+"', () => {
    const phantom = makeNode({ id: 'phantom:stat2', title: '-3+ 7+' })
    const { nodes, stats } = massage([phantom])
    expect(nodes).toHaveLength(0)
    expect(stats.droppedPhantom).toBe(1)
  })

  it('drops a node with title "6\\" 6+ 7+"', () => {
    const phantom = makeNode({ id: 'phantom:stat3', title: '6" 6+ 7+' })
    const { nodes, stats } = massage([phantom])
    expect(nodes).toHaveLength(0)
    expect(stats.droppedPhantom).toBe(1)
  })

  it('drops a node with title containing only digits and whitespace', () => {
    const phantom = makeNode({ id: 'phantom:digits', title: '3 4 5' })
    const { nodes, stats } = massage([phantom])
    expect(nodes).toHaveLength(0)
    expect(stats.droppedPhantom).toBe(1)
  })

  it('keeps a node with title "SUSTAINED HITS"', () => {
    const node = makeNode({ id: 'real:sh', title: 'SUSTAINED HITS' })
    const { nodes, stats } = massage([node])
    expect(nodes).toHaveLength(1)
    expect(stats.droppedPhantom).toBe(0)
  })

  it('keeps a node with title "Oath of Moment"', () => {
    const node = makeNode({ id: 'real:oom', title: 'Oath of Moment' })
    const { nodes, stats } = massage([node])
    expect(nodes).toHaveLength(1)
    expect(stats.droppedPhantom).toBe(0)
  })

  it('keeps a node with title "Bladeguard Veteran Squad"', () => {
    const node = makeNode({ id: 'real:bvs', title: 'Bladeguard Veteran Squad' })
    const { nodes, stats } = massage([node])
    expect(nodes).toHaveLength(1)
    expect(stats.droppedPhantom).toBe(0)
  })

  it('keeps a node whose title starts with letters even if it contains digits', () => {
    // "M6\" A3 S4" would be a legitimate title in some theoretical world —
    // but more importantly a title like "T'au Sept" must not be dropped
    const node = makeNode({ id: 'real:tau', title: "T'au Sept" })
    const { nodes } = massage([node])
    expect(nodes).toHaveLength(1)
  })
})

// ── Pass 2 — short-content non-structural nodes ──────────────────────────────

describe('massage — Pass 2: short-content non-structural nodes', () => {
  it('drops an enhancement node with content shorter than 20 chars', () => {
    const node = makeNode({
      id: 'short:enhancement',
      category: 'enhancement',
      content: 'INVULNERABLE SAVE',   // 17 chars
    })
    const { nodes, stats } = massage([node])
    expect(nodes).toHaveLength(0)
    expect(stats.droppedShortContent).toBe(1)
  })

  it('drops a stratagem node with very short content', () => {
    const node = makeNode({
      id: 'short:stratagem',
      category: 'stratagem',
      content: 'Reroll wounds.',   // 14 chars
    })
    const { nodes, stats } = massage([node])
    expect(nodes).toHaveLength(0)
    expect(stats.droppedShortContent).toBe(1)
  })

  it('keeps a node with exactly 20 characters of content', () => {
    const node = makeNode({
      id: 'borderline:content',
      category: 'stratagem',
      content: '12345678901234567890',   // exactly 20 chars
    })
    const { nodes } = massage([node])
    expect(nodes).toHaveLength(1)
  })

  it('keeps a deployment-zone node with content shorter than 20 chars (structural)', () => {
    const node = makeNode({
      id: 'short:deployment-zone',
      category: 'deployment-zone',
      content: 'See PDF',   // 7 chars — structural, allowed
    })
    const { nodes, stats } = massage([node])
    expect(nodes).toHaveLength(1)
    expect(stats.droppedShortContent).toBe(0)
  })

  it('keeps a datasheet node with very short content (structural)', () => {
    const node = makeNode({
      id: 'short:datasheet',
      category: 'datasheet',
      content: 'See PDF.',   // 8 chars — structural, allowed
    })
    const { nodes, stats } = massage([node])
    expect(nodes).toHaveLength(1)
    expect(stats.droppedShortContent).toBe(0)
  })

  it('keeps a detachment-rule node with short content (structural)', () => {
    const node = makeNode({
      id: 'short:detachment-rule',
      category: 'detachment-rule',
      content: 'See PDF page.',   // 13 chars — structural, allowed
    })
    const { nodes, stats } = massage([node])
    expect(nodes).toHaveLength(1)
    expect(stats.droppedShortContent).toBe(0)
  })

  it('keeps a terrain-layout node with short content (structural)', () => {
    const node = makeNode({
      id: 'short:terrain-layout',
      category: 'terrain-layout',
      content: 'See diagram.',   // 12 chars — structural, allowed
    })
    const { nodes, stats } = massage([node])
    expect(nodes).toHaveLength(1)
    expect(stats.droppedShortContent).toBe(0)
  })
})

// ── Pass 3 — duplicate summaries ─────────────────────────────────────────────

describe('massage — Pass 3: duplicate summaries', () => {
  const LONG_CONTENT = 'This is a valid test node with enough content to pass the minimum length check.'

  it('drops the second node when two nodes share summary+category+factionId', () => {
    const first = makeNode({
      id: 'dup:first',
      category: 'stratagem',
      factionId: 'space-marines',
      summary: 'Reroll all hit rolls for one unit this phase.',
      content: LONG_CONTENT,
    })
    const second = makeNode({
      id: 'dup:second',
      category: 'stratagem',
      factionId: 'space-marines',
      summary: 'Reroll all hit rolls for one unit this phase.',
      content: LONG_CONTENT,
    })
    const { nodes, stats } = massage([first, second])
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.id).toBe('dup:first')
    expect(stats.droppedDuplicateSummary).toBe(1)
  })

  it('keeps nodes with the same summary but different factionId', () => {
    const csm = makeNode({
      id: 'dup:csm',
      category: 'stratagem',
      factionId: 'chaos-space-marines',
      summary: 'Chaos Rhino transport rule.',
      content: LONG_CONTENT,
    })
    const dg = makeNode({
      id: 'dup:dg',
      category: 'stratagem',
      factionId: 'death-guard',
      summary: 'Chaos Rhino transport rule.',
      content: LONG_CONTENT,
    })
    const { nodes, stats } = massage([csm, dg])
    expect(nodes).toHaveLength(2)
    expect(stats.droppedDuplicateSummary).toBe(0)
  })

  it('keeps nodes with the same summary but different category', () => {
    const a = makeNode({
      id: 'dup:cat-a',
      category: 'stratagem',
      factionId: 'space-marines',
      summary: 'Same summary text for this test.',
      content: LONG_CONTENT,
    })
    const b = makeNode({
      id: 'dup:cat-b',
      category: 'enhancement',
      factionId: 'space-marines',
      summary: 'Same summary text for this test.',
      content: LONG_CONTENT,
    })
    const { nodes, stats } = massage([a, b])
    expect(nodes).toHaveLength(2)
    expect(stats.droppedDuplicateSummary).toBe(0)
  })

  it('deduplicates nodes without a factionId as a group', () => {
    const first = makeNode({
      id: 'dup:no-faction-1',
      category: 'core-mechanic',
      factionId: undefined,
      summary: 'Overwatch is resolved in the charge phase.',
      content: LONG_CONTENT,
    })
    const second = makeNode({
      id: 'dup:no-faction-2',
      category: 'core-mechanic',
      factionId: undefined,
      summary: 'Overwatch is resolved in the charge phase.',
      content: LONG_CONTENT,
    })
    const { nodes, stats } = massage([first, second])
    expect(nodes).toHaveLength(1)
    expect(stats.droppedDuplicateSummary).toBe(1)
  })
})

// ── Stats ────────────────────────────────────────────────────────────────────

describe('massage — stats', () => {
  it('returns correct counts across all three passes', () => {
    const LONG_CONTENT = 'This is a valid test node with enough content to pass the minimum length check.'

    const phantom = makeNode({ id: 'p:phantom', title: '+' })
    const shortNode = makeNode({ id: 'p:short', category: 'enhancement', content: 'Too short.' })
    const dup1 = makeNode({ id: 'p:dup1', category: 'stratagem', factionId: 'orks', summary: 'Waaagh!', content: LONG_CONTENT })
    const dup2 = makeNode({ id: 'p:dup2', category: 'stratagem', factionId: 'orks', summary: 'Waaagh!', content: LONG_CONTENT })
    const good = makeNode({ id: 'p:good', content: LONG_CONTENT })

    const { nodes, stats } = massage([phantom, shortNode, dup1, dup2, good])

    expect(stats.inputCount).toBe(5)
    expect(stats.droppedPhantom).toBe(1)
    expect(stats.droppedShortContent).toBe(1)
    expect(stats.droppedDuplicateSummary).toBe(1)
    expect(stats.outputCount).toBe(2)
    expect(nodes).toHaveLength(2)
  })

  it('returns zero drops for a clean node list', () => {
    const nodes = [
      makeNode({ id: 'clean:1' }),
      makeNode({ id: 'clean:2', title: 'Another Rule', summary: 'Unique summary two.' }),
    ]
    const { stats } = massage(nodes)
    expect(stats.droppedPhantom).toBe(0)
    expect(stats.droppedShortContent).toBe(0)
    expect(stats.droppedDuplicateSummary).toBe(0)
    expect(stats.outputCount).toBe(2)
  })
})

// ── Immutability ─────────────────────────────────────────────────────────────

describe('massage — immutability', () => {
  it('does not mutate the input array', () => {
    const phantom = makeNode({ id: 'mut:phantom', title: '6+ 7+' })
    const good = makeNode({ id: 'mut:good' })
    const input = [phantom, good]

    massage(input)

    // Original array must still contain both nodes
    expect(input).toHaveLength(2)
    expect(input[0]?.id).toBe('mut:phantom')
    expect(input[1]?.id).toBe('mut:good')
  })
})
