import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadExistingNodes, findSimilar } from './dedup'
import type { DraftNode } from '../types'

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeDraft(overrides: Partial<DraftNode> = {}): DraftNode {
  return {
    status: 'draft',
    title: 'Fishing for Crits',
    category: 'tactic',
    keywords: ['fishing', 'reroll', 'sustained hits'],
    sourceUrl: 'https://example.com',
    sourceType: 'youtube',
    confidence: 0.85,
    screenshots: [],
    summary: 'Reroll to fish for 6s.',
    content: 'Detailed explanation.',
    sourceContext: 'Source context here.',
    ...overrides,
  }
}

const EXISTING_NODES = [
  {
    id: 'community:fishing-for-crits',
    title: 'Fishing for Crits',
    keywords: ['fishing', 'reroll', 'sustained hits', 'lethal hits'],
  },
  {
    id: 'community:attack-volume',
    title: 'Attack Volume — Total Unit Output',
    keywords: ['volume', 'attacks', 'models', 'dice pool'],
  },
  {
    id: 'community:toughness-breakpoints',
    title: 'Toughness Breakpoints and Weapon Strength',
    keywords: ['toughness', 'strength', 'wound roll', 'breakpoint'],
  },
]

// ── loadExistingNodes ─────────────────────────────────────────────────────

describe('loadExistingNodes', () => {
  it('reads community.json and returns id/title/keywords for each node', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dedup-test-'))
    try {
      writeFileSync(join(dir, 'community.json'), JSON.stringify(EXISTING_NODES))
      const nodes = await loadExistingNodes(dir)
      expect(nodes).toHaveLength(3)
      expect(nodes[0]).toEqual({
        id: 'community:fishing-for-crits',
        title: 'Fishing for Crits',
        keywords: ['fishing', 'reroll', 'sustained hits', 'lethal hits'],
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns empty array when community.json does not exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dedup-test-'))
    try {
      const nodes = await loadExistingNodes(dir)
      expect(nodes).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles full community.json format with extra fields gracefully', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dedup-test-'))
    try {
      // Real community.json nodes have many more fields — verify we only extract id/title/keywords
      const fullNodes = [
        {
          id: 'community:test',
          layer: 'community',
          category: 'tactic',
          title: 'Test Node',
          content: 'Long content...',
          summary: 'Short summary.',
          sources: [],
          refs: [],
          version: 1,
          keywords: ['test', 'node'],
        },
      ]
      writeFileSync(join(dir, 'community.json'), JSON.stringify(fullNodes))
      const nodes = await loadExistingNodes(dir)
      expect(nodes).toHaveLength(1)
      expect(nodes[0]).toEqual({ id: 'community:test', title: 'Test Node', keywords: ['test', 'node'] })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── findSimilar ───────────────────────────────────────────────────────────

describe('findSimilar', () => {
  it('returns the existing node ID on exact title match (case-insensitive)', () => {
    const draft = makeDraft({ title: 'fishing for crits' })
    const result = findSimilar(draft, EXISTING_NODES)
    expect(result).toBe('community:fishing-for-crits')
  })

  it('returns the existing node ID when draft title is a substring of existing title', () => {
    const draft = makeDraft({ title: 'Attack Volume', keywords: ['unrelated'] })
    const result = findSimilar(draft, EXISTING_NODES)
    expect(result).toBe('community:attack-volume')
  })

  it('returns the existing node ID when existing title is a substring of draft title', () => {
    const draft = makeDraft({ title: 'Guide to Fishing for Crits in 40K', keywords: ['unrelated'] })
    const result = findSimilar(draft, EXISTING_NODES)
    expect(result).toBe('community:fishing-for-crits')
  })

  it('returns the existing node ID when keyword overlap exceeds 50%', () => {
    // draft has 4 keywords, 3 overlap with community:fishing-for-crits (75% > 50%)
    const draft = makeDraft({
      title: 'Completely Different Title',
      keywords: ['fishing', 'reroll', 'sustained hits', 'combo'],
    })
    const result = findSimilar(draft, EXISTING_NODES)
    expect(result).toBe('community:fishing-for-crits')
  })

  it('returns undefined when keyword overlap is exactly 50% (not strictly over)', () => {
    // draft has 2 keywords, 1 overlaps with any single existing node → 50% = not > 50%
    const draft = makeDraft({
      title: 'Unrelated Topic Entirely',
      keywords: ['fishing', 'unrelated'],
    })
    // 'fishing' appears in fishing-for-crits (1/2 = 50%, not > 50%) → undefined
    const result = findSimilar(draft, EXISTING_NODES)
    expect(result).toBeUndefined()
  })

  it('returns undefined for a draft with no title or keyword similarity', () => {
    const draft = makeDraft({
      title: 'Completely Unique Topic About Something Else',
      keywords: ['unique', 'unrelated', 'specific'],
    })
    const result = findSimilar(draft, EXISTING_NODES)
    expect(result).toBeUndefined()
  })

  it('returns undefined when existing nodes list is empty', () => {
    const draft = makeDraft()
    const result = findSimilar(draft, [])
    expect(result).toBeUndefined()
  })
})
