import { describe, it, expect } from 'vitest'
import { matchErrataToTargets, findErrataForNode } from './errata-linker'
import type { Node } from './model'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<Node> & { id: string; title: string }): Node {
  const defaults: Node = {
    id: overrides.id,
    layer: 'core',
    category: 'core-mechanic',
    title: overrides.title,
    content: 'Default content text.',
    summary: 'Default summary.',
    phase: undefined,
    factionId: undefined,
    detachmentId: undefined,
    datasheetId: undefined,
    sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2024-01-01' }],
    refs: [],
    effectiveDate: undefined,
    supersededBy: undefined,
    version: 1,
    subfaction: undefined,
    keywords: [],
  }
  return { ...defaults, ...overrides }
}

function makeErrataNode(overrides: Partial<Node> & { id: string; title: string }): Node {
  return makeNode({
    layer: 'errata',
    category: 'faq',
    sources: [{ type: 'faq', title: 'FAQ 2024', page: 3, retrievedAt: '2024-01-01' }],
    ...overrides,
  })
}

// ── matchErrataToTargets ─────────────────────────────────────────────────────

describe('matchErrataToTargets', () => {
  it('exact title match scores 1.0', () => {
    const errata = makeErrataNode({
      id: 'errata-1',
      title: 'Fight First',
      content: 'Clarifies fight first rule.',
    })
    const targets = [
      makeNode({ id: 'rule-1', title: 'Fight First' }),
      makeNode({ id: 'rule-2', title: 'Fight Last' }),
    ]
    const matches = matchErrataToTargets(errata, targets)
    expect(matches).toHaveLength(1)
    expect(matches[0].targetId).toBe('rule-1')
    expect(matches[0].score).toBe(1.0)
  })

  it('exact title match is case and punctuation insensitive', () => {
    const errata = makeErrataNode({
      id: 'errata-1',
      title: 'Fight First!',
      content: 'Clarification text.',
    })
    const targets = [makeNode({ id: 'rule-1', title: 'fight first' })]
    const matches = matchErrataToTargets(errata, targets)
    expect(matches).toHaveLength(1)
    expect(matches[0].score).toBe(1.0)
  })

  it('substring title match scores 0.8', () => {
    const errata = makeErrataNode({
      id: 'errata-1',
      title: 'Charging',
      content: 'Some errata about charging.',
    })
    const targets = [
      makeNode({ id: 'rule-1', title: 'Charging and the Charge Phase' }),
      makeNode({ id: 'rule-2', title: 'Movement Phase' }),
    ]
    const matches = matchErrataToTargets(errata, targets)
    expect(matches).toHaveLength(1)
    expect(matches[0].targetId).toBe('rule-1')
    expect(matches[0].score).toBe(0.8)
  })

  it('target title as substring of errata title scores 0.8', () => {
    const errata = makeErrataNode({
      id: 'errata-1',
      title: 'Advance Move Clarification',
      content: 'Some errata text.',
    })
    const targets = [makeNode({ id: 'rule-1', title: 'Advance Move' })]
    const matches = matchErrataToTargets(errata, targets)
    expect(matches).toHaveLength(1)
    expect(matches[0].score).toBe(0.8)
  })

  it('content reference match scores 0.5', () => {
    const errata = makeErrataNode({
      id: 'errata-1',
      title: 'General Clarification',
      content: 'The Overwatch rule is clarified as follows: you may only fire Overwatch once per phase.',
    })
    const targets = [
      makeNode({ id: 'rule-1', title: 'Overwatch' }),
      makeNode({ id: 'rule-2', title: 'Rapid Fire' }),
    ]
    const matches = matchErrataToTargets(errata, targets)
    const overwatchMatch = matches.find(m => m.targetId === 'rule-1')
    expect(overwatchMatch).toBeDefined()
    expect(overwatchMatch!.score).toBe(0.5)
    expect(matches.find(m => m.targetId === 'rule-2')).toBeUndefined()
  })

  it('keyword overlap match scores 0.3', () => {
    const errata = makeErrataNode({
      id: 'errata-1',
      title: 'Unrelated Title',
      content: 'Some unrelated content.',
      keywords: ['blast', 'templates', 'shooting'],
    })
    const targets = [
      makeNode({ id: 'rule-1', title: 'Some Rule', keywords: ['blast', 'templates'] }),
      makeNode({ id: 'rule-2', title: 'Other Rule', keywords: ['melee'] }),
    ]
    const matches = matchErrataToTargets(errata, targets)
    const kwMatch = matches.find(m => m.targetId === 'rule-1')
    expect(kwMatch).toBeDefined()
    expect(kwMatch!.score).toBe(0.3)
    expect(matches.find(m => m.targetId === 'rule-2')).toBeUndefined()
  })

  it('requires at least 2 keywords for keyword overlap match', () => {
    const errata = makeErrataNode({
      id: 'errata-1',
      title: 'Unrelated Title',
      content: 'Some unrelated content.',
      keywords: ['blast'],
    })
    const targets = [makeNode({ id: 'rule-1', title: 'Some Rule', keywords: ['blast'] })]
    const matches = matchErrataToTargets(errata, targets)
    expect(matches).toHaveLength(0)
  })

  it('returns empty array when nothing matches', () => {
    const errata = makeErrataNode({
      id: 'errata-1',
      title: 'Completely Unrelated',
      content: 'Nothing matches here.',
      keywords: ['foo'],
    })
    const targets = [makeNode({ id: 'rule-1', title: 'Movement Phase', keywords: ['bar'] })]
    const matches = matchErrataToTargets(errata, targets)
    expect(matches).toHaveLength(0)
  })

  it('results are sorted by score descending', () => {
    const errata = makeErrataNode({
      id: 'errata-1',
      title: 'Fight First',
      content: 'The Consolidate rule is also relevant. Mentions Overwatch.',
      keywords: ['fight', 'melee', 'close-combat'],
    })
    const targets = [
      makeNode({ id: 'rule-exact', title: 'Fight First' }),
      makeNode({ id: 'rule-content', title: 'Overwatch', keywords: [] }),
      makeNode({ id: 'rule-kw', title: 'Some Rule', keywords: ['fight', 'melee', 'close-combat'] }),
    ]
    const matches = matchErrataToTargets(errata, targets)
    // Scores should be descending
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score)
    }
    expect(matches[0].targetId).toBe('rule-exact')
    expect(matches[0].score).toBe(1.0)
  })

  it('handles short titles without false positives (min 4 chars)', () => {
    const errata = makeErrataNode({
      id: 'errata-1',
      title: 'AP',
      content: 'Short title, should not match via substring.',
    })
    const targets = [
      makeNode({ id: 'rule-1', title: 'AP Weapon Profiles' }),
    ]
    const matches = matchErrataToTargets(errata, targets)
    // "AP" is only 2 chars (after normalize), below 4-char minimum for substring
    expect(matches).toHaveLength(0)
  })

  it('ignores self as a potential match', () => {
    const errata = makeErrataNode({
      id: 'errata-1',
      title: 'Fight First',
      content: 'Clarifies fight first.',
    })
    // If errata is included in targetNodes, it should still match targets with same title
    const targets = [makeNode({ id: 'rule-1', title: 'Fight First' })]
    const matches = matchErrataToTargets(errata, targets)
    expect(matches.every(m => m.targetId !== errata.id)).toBe(true)
  })
})

// ── findErrataForNode ────────────────────────────────────────────────────────

describe('findErrataForNode', () => {
  it('returns errata with matching title', () => {
    const node = makeNode({ id: 'rule-1', title: 'Fight First' })
    const allErrata = [
      makeErrataNode({ id: 'errata-1', title: 'Fight First', content: 'Clarification text.' }),
      makeErrataNode({ id: 'errata-2', title: 'Rapid Fire', content: 'Other errata.' }),
    ]
    const result = findErrataForNode(node, allErrata)
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('errata-1')
  })

  it('returns errata whose content mentions the node title', () => {
    const node = makeNode({ id: 'rule-1', title: 'Overwatch' })
    const allErrata = [
      makeErrataNode({
        id: 'errata-1',
        title: 'General FAQ',
        content: 'When using Overwatch, the following applies: ...',
      }),
    ]
    const result = findErrataForNode(node, allErrata)
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('errata-1')
  })

  it('returns errata with clarifies ref to the node', () => {
    const node = makeNode({ id: 'rule-42', title: 'Some Obscure Rule' })
    const allErrata = [
      makeErrataNode({
        id: 'errata-1',
        title: 'Completely Different Title',
        content: 'Unrelated content.',
        refs: [{ sourceId: 'errata-1', targetId: 'rule-42', rel: 'clarifies', context: 'direct ref' }],
      }),
    ]
    const result = findErrataForNode(node, allErrata)
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('errata-1')
  })

  it('returns empty array when no errata matches', () => {
    const node = makeNode({ id: 'rule-1', title: 'Movement Phase' })
    const allErrata = [
      makeErrataNode({ id: 'errata-1', title: 'Rapid Fire', content: 'Some errata.' }),
    ]
    const result = findErrataForNode(node, allErrata)
    expect(result).toHaveLength(0)
  })

  it('returns correct ErrataAnnotation shape', () => {
    const node = makeNode({ id: 'rule-1', title: 'Fight First' })
    const allErrata = [
      makeErrataNode({
        id: 'errata-1',
        title: 'Fight First',
        content: 'The fight first rule is clarified.',
        sources: [{ type: 'faq', title: 'FAQ 2024', page: 7, retrievedAt: '2024-01-01' }],
      }),
    ]
    const result = findErrataForNode(node, allErrata)
    expect(result).toHaveLength(1)
    const annotation = result[0]
    expect(annotation.nodeId).toBe('errata-1')
    expect(annotation.title).toBe('Fight First')
    expect(annotation.content).toBe('The fight first rule is clarified.')
    expect(annotation.source.type).toBe('faq')
    expect(annotation.source.title).toBe('FAQ 2024')
    expect(annotation.source.page).toBe(7)
  })

  it('deduplicates when multiple criteria match the same errata', () => {
    const node = makeNode({ id: 'rule-1', title: 'Fight First' })
    const allErrata = [
      makeErrataNode({
        id: 'errata-1',
        title: 'Fight First',
        // content also mentions "Fight First" AND has a clarifies ref
        content: 'Fight First is clarified here.',
        refs: [{ sourceId: 'errata-1', targetId: 'rule-1', rel: 'clarifies', context: 'direct' }],
      }),
    ]
    const result = findErrataForNode(node, allErrata)
    expect(result).toHaveLength(1)
  })

  it('node title must be at least 4 chars to match via content mention', () => {
    const node = makeNode({ id: 'rule-1', title: 'AP' })
    const allErrata = [
      makeErrataNode({
        id: 'errata-1',
        title: 'Weapon Profiles',
        content: 'AP modifiers are applied during wound rolls.',
      }),
    ]
    const result = findErrataForNode(node, allErrata)
    // "AP" normalizes to "ap" (2 chars) — below 4-char minimum
    expect(result).toHaveLength(0)
  })
})
