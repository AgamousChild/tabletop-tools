import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadManifest, saveManifest, getUnprocessedEntries, markEntryProcessed } from './manifest'
import type { CrawlManifest } from '../types'

function makeManifest(overrides: Partial<CrawlManifest> = {}): CrawlManifest {
  return {
    source: 'https://www.reddit.com/r/WarhammerCompetitive',
    sourceType: 'reddit',
    lastCrawlAt: '2026-04-24T10:00:00.000Z',
    entries: [
      { url: 'https://www.reddit.com/r/test/comments/a/', title: 'Post A' },
      { url: 'https://www.reddit.com/r/test/comments/b/', title: 'Post B', processedAt: '2026-04-24T09:00:00.000Z', relevant: true, nodeCount: 2 },
      { url: 'https://www.reddit.com/r/test/comments/c/', title: 'Post C' },
    ],
    ...overrides,
  }
}

describe('loadManifest', () => {
  it('returns null when the manifest file does not exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'manifest-test-'))
    try {
      const result = await loadManifest(dir)
      expect(result).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('parses manifest.json from the directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'manifest-test-'))
    try {
      const manifest = makeManifest()
      await saveManifest(manifest, dir)
      const loaded = await loadManifest(dir)
      expect(loaded).not.toBeNull()
      expect(loaded!.source).toBe(manifest.source)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('saveManifest', () => {
  it('writes manifest.json with pretty-printed JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'manifest-test-'))
    try {
      const manifest = makeManifest()
      await saveManifest(manifest, dir)
      const { readFileSync } = await import('node:fs')
      const raw = readFileSync(join(dir, 'manifest.json'), 'utf-8')
      // Pretty-printed: should have newlines and indentation
      expect(raw).toContain('\n')
      expect(raw).toContain('  ')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('round-trips all manifest fields', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'manifest-test-'))
    try {
      const manifest = makeManifest()
      await saveManifest(manifest, dir)
      const loaded = await loadManifest(dir)
      expect(loaded).toEqual(manifest)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates the directory if it does not exist', async () => {
    const base = mkdtempSync(join(tmpdir(), 'manifest-test-'))
    const nested = join(base, 'new-subdir')
    try {
      await saveManifest(makeManifest(), nested)
      const loaded = await loadManifest(nested)
      expect(loaded).not.toBeNull()
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})

describe('getUnprocessedEntries', () => {
  it('returns only entries without processedAt', () => {
    const manifest = makeManifest()
    const unprocessed = getUnprocessedEntries(manifest)
    expect(unprocessed).toHaveLength(2)
    expect(unprocessed.map((e) => e.url)).toContain('https://www.reddit.com/r/test/comments/a/')
    expect(unprocessed.map((e) => e.url)).toContain('https://www.reddit.com/r/test/comments/c/')
  })

  it('returns empty array when all entries are processed', () => {
    const manifest = makeManifest({
      entries: [
        { url: 'https://x.com/a', title: 'A', processedAt: '2026-01-01T00:00:00.000Z', relevant: true, nodeCount: 1 },
      ],
    })
    expect(getUnprocessedEntries(manifest)).toEqual([])
  })

  it('returns all entries when none are processed', () => {
    const manifest = makeManifest({
      entries: [
        { url: 'https://x.com/a', title: 'A' },
        { url: 'https://x.com/b', title: 'B' },
      ],
    })
    expect(getUnprocessedEntries(manifest)).toHaveLength(2)
  })
})

describe('markEntryProcessed', () => {
  it('sets processedAt, relevant, and nodeCount on the matching entry', () => {
    const manifest = makeManifest()
    markEntryProcessed(manifest, 'https://www.reddit.com/r/test/comments/a/', true, 3)
    const entry = manifest.entries.find((e) => e.url === 'https://www.reddit.com/r/test/comments/a/')!
    expect(entry.relevant).toBe(true)
    expect(entry.nodeCount).toBe(3)
    expect(entry.processedAt).toBeDefined()
  })

  it('sets processedAt to a valid ISO datetime string', () => {
    const manifest = makeManifest()
    markEntryProcessed(manifest, 'https://www.reddit.com/r/test/comments/a/', false, 0)
    const entry = manifest.entries.find((e) => e.url === 'https://www.reddit.com/r/test/comments/a/')!
    expect(() => new Date(entry.processedAt!).toISOString()).not.toThrow()
  })

  it('does not mutate other entries', () => {
    const manifest = makeManifest()
    const originalB = { ...manifest.entries[1] }
    markEntryProcessed(manifest, 'https://www.reddit.com/r/test/comments/a/', true, 1)
    expect(manifest.entries[1]).toEqual(originalB)
  })

  it('is a no-op when the URL is not found', () => {
    const manifest = makeManifest()
    const before = JSON.parse(JSON.stringify(manifest.entries)) as typeof manifest.entries
    markEntryProcessed(manifest, 'https://nonexistent.com/', true, 0)
    expect(manifest.entries).toEqual(before)
  })
})
