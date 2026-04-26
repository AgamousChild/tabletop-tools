import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import {
  draftToMarkdown,
  markdownToDraft,
  saveDraft,
  loadDrafts,
  updateDraftStatus,
} from './store'
import type { DraftNode } from '../types'

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeDraft(overrides: Partial<DraftNode> = {}): DraftNode {
  return {
    status: 'draft',
    title: 'Blast Template Tactics',
    category: 'tactic',
    keywords: ['blast', 'template', 'area-denial'],
    sourceUrl: 'https://example.com/article',
    sourceType: 'article',
    sourceChannel: 'BestChannel40K',
    timestamp: '12:34',
    confidence: 0.87,
    screenshots: [
      { file: '/path/to/frame.png', timestamp: '12:34', timestampSec: 754, caption: 'Key moment' },
    ],
    summary: 'Use blast templates to maximise hits on clustered infantry.',
    content: 'Position your unit so the large end covers the most models...',
    sourceContext: 'Extracted from tournament recap video.',
    similarTo: 'node-001',
    ...overrides,
  }
}

// ── draftToMarkdown / markdownToDraft ─────────────────────────────────────

describe('draftToMarkdown', () => {
  it('produces valid YAML frontmatter with --- delimiters', () => {
    const md = draftToMarkdown(makeDraft())
    expect(md).toMatch(/^---\n/)
    expect(md).toMatch(/\n---\n/)
  })

  it('includes all required frontmatter fields', () => {
    const draft = makeDraft()
    const md = draftToMarkdown(draft)
    expect(md).toContain('status: draft')
    expect(md).toContain('title: Blast Template Tactics')
    expect(md).toContain('category: tactic')
    expect(md).toContain('sourceUrl: https://example.com/article')
    expect(md).toContain('sourceType: article')
    expect(md).toContain('confidence: 0.87')
  })

  it('serialises the screenshots array in frontmatter', () => {
    const draft = makeDraft()
    const md = draftToMarkdown(draft)
    expect(md).toContain('screenshots:')
    // Values are quoted to handle colons in Windows paths and captions
    expect(md).toContain('file: "/path/to/frame.png"')
    expect(md).toContain('caption: "Key moment"')
  })

  it('includes ## Summary, ## Content, and ## Source Context sections', () => {
    const md = draftToMarkdown(makeDraft())
    expect(md).toContain('## Summary')
    expect(md).toContain('## Content')
    expect(md).toContain('## Source Context')
  })

  it('puts summary/content/sourceContext text under the correct headers', () => {
    const draft = makeDraft()
    const md = draftToMarkdown(draft)
    const summaryIdx = md.indexOf('## Summary')
    const contentIdx = md.indexOf('## Content')
    const contextIdx = md.indexOf('## Source Context')
    // Text should appear after the heading
    expect(md.slice(summaryIdx)).toContain(draft.summary)
    expect(md.slice(contentIdx)).toContain(draft.content)
    expect(md.slice(contextIdx)).toContain(draft.sourceContext)
  })
})

describe('markdownToDraft', () => {
  it('round-trips a DraftNode with no data loss', () => {
    const draft = makeDraft()
    const md = draftToMarkdown(draft)
    const parsed = markdownToDraft(md)
    expect(parsed.status).toBe(draft.status)
    expect(parsed.title).toBe(draft.title)
    expect(parsed.category).toBe(draft.category)
    expect(parsed.keywords).toEqual(draft.keywords)
    expect(parsed.sourceUrl).toBe(draft.sourceUrl)
    expect(parsed.sourceType).toBe(draft.sourceType)
    expect(parsed.sourceChannel).toBe(draft.sourceChannel)
    expect(parsed.timestamp).toBe(draft.timestamp)
    expect(parsed.confidence).toBe(draft.confidence)
    expect(parsed.summary).toBe(draft.summary)
    expect(parsed.content).toBe(draft.content)
    expect(parsed.sourceContext).toBe(draft.sourceContext)
    expect(parsed.similarTo).toBe(draft.similarTo)
  })

  it('preserves the screenshots array including all fields', () => {
    const draft = makeDraft()
    const parsed = markdownToDraft(draftToMarkdown(draft))
    expect(parsed.screenshots).toHaveLength(1)
    expect(parsed.screenshots[0]!.file).toBe('/path/to/frame.png')
    expect(parsed.screenshots[0]!.timestamp).toBe('12:34')
    expect(parsed.screenshots[0]!.timestampSec).toBe(754)
    expect(parsed.screenshots[0]!.caption).toBe('Key moment')
  })

  it('handles draft with no optional fields', () => {
    const minimal = makeDraft({ sourceChannel: undefined, timestamp: undefined, similarTo: undefined, screenshots: [] })
    const parsed = markdownToDraft(draftToMarkdown(minimal))
    expect(parsed.screenshots).toEqual([])
    expect(parsed.sourceChannel).toBeUndefined()
    expect(parsed.similarTo).toBeUndefined()
  })
})

// ── saveDraft ─────────────────────────────────────────────────────────────

describe('saveDraft', () => {
  it('creates the output file at the expected path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-test-'))
    try {
      const path = await saveDraft(makeDraft(), dir, 1)
      expect(existsSync(path)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('names the file node-{padded-index}-{slug}.md', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-test-'))
    try {
      const path = await saveDraft(makeDraft({ title: 'Blast Template Tactics' }), dir, 7)
      expect(basename(path)).toBe('node-007-blast-template-tactics.md')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates the directory recursively if it does not exist', async () => {
    const base = mkdtempSync(join(tmpdir(), 'store-test-'))
    const nested = join(base, 'deep', 'nested', 'dir')
    try {
      const path = await saveDraft(makeDraft(), nested, 1)
      expect(existsSync(path)).toBe(true)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('slugifies special characters in the title', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-test-'))
    try {
      const path = await saveDraft(makeDraft({ title: 'Tau: Crisis Suits & Fish of Fury!' }), dir, 2)
      // Non-alphanumeric → hyphen, lowercase
      expect(basename(path)).toMatch(/^node-002-tau-crisis-suits-fish-of-fury/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── loadDrafts ────────────────────────────────────────────────────────────

describe('loadDrafts', () => {
  it('reads all .md files from a directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-test-'))
    try {
      await saveDraft(makeDraft({ title: 'Alpha' }), dir, 1)
      await saveDraft(makeDraft({ title: 'Beta' }), dir, 2)
      const loaded = await loadDrafts(dir)
      expect(loaded).toHaveLength(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns path and draft for each file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-test-'))
    try {
      await saveDraft(makeDraft({ title: 'Alpha' }), dir, 1)
      const loaded = await loadDrafts(dir)
      expect(loaded[0]).toHaveProperty('path')
      expect(loaded[0]).toHaveProperty('draft')
      expect(loaded[0]!.draft.title).toBe('Alpha')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns empty array for an empty directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-test-'))
    try {
      const loaded = await loadDrafts(dir)
      expect(loaded).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── updateDraftStatus ─────────────────────────────────────────────────────

describe('updateDraftStatus', () => {
  it('changes the status field in the file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-test-'))
    try {
      const path = await saveDraft(makeDraft({ status: 'draft' }), dir, 1)
      await updateDraftStatus(path, 'approved')
      const loaded = await loadDrafts(dir)
      expect(loaded[0]!.draft.status).toBe('approved')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('preserves all other fields when updating status', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-test-'))
    try {
      const draft = makeDraft()
      const path = await saveDraft(draft, dir, 1)
      await updateDraftStatus(path, 'rejected')
      const loaded = await loadDrafts(dir)
      expect(loaded[0]!.draft.title).toBe(draft.title)
      expect(loaded[0]!.draft.content).toBe(draft.content)
      expect(loaded[0]!.draft.keywords).toEqual(draft.keywords)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
