import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadMetadata, saveMetadata, needsUpdate, updatePdfEntry } from './metadata'
import type { PdfMetadata, SyncMetadata } from './types'

describe('metadata', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'gw-meta-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('loadMetadata', () => {
    it('returns default when file does not exist', () => {
      const meta = loadMetadata(join(tempDir, 'nonexistent.json'))
      expect(meta).toEqual({ lastScrapedAt: null, pdfs: {} })
    })

    it('loads existing metadata', () => {
      const path = join(tempDir, 'metadata.json')
      const data: SyncMetadata = {
        lastScrapedAt: '2024-01-01T00:00:00Z',
        pdfs: {
          'https://example.com/test.pdf': {
            title: 'Test',
            url: 'https://example.com/test.pdf',
            category: 'core-rules',
            sha256: 'abc123',
            downloadedAt: '2024-01-01T00:00:00Z',
            markdownFile: 'test.md',
          },
        },
      }
      saveMetadata(path, data)
      expect(loadMetadata(path)).toEqual(data)
    })

    it('returns default for corrupted JSON', () => {
      const path = join(tempDir, 'bad.json')
      writeFileSync(path, '{invalid', 'utf-8')
      expect(loadMetadata(path)).toEqual({ lastScrapedAt: null, pdfs: {} })
    })
  })

  describe('saveMetadata', () => {
    it('creates parent directories', () => {
      const path = join(tempDir, 'deep', 'nested', 'metadata.json')
      saveMetadata(path, { lastScrapedAt: null, pdfs: {} })
      expect(existsSync(path)).toBe(true)
    })
  })

  describe('needsUpdate', () => {
    const stored: SyncMetadata = {
      lastScrapedAt: null,
      pdfs: {
        'https://example.com/test.pdf': {
          title: 'Test', url: 'https://example.com/test.pdf',
          category: 'core-rules', sha256: 'abc123',
          downloadedAt: '2024-01-01', markdownFile: 'test.md',
        },
      },
    }

    it('returns true for new URL', () => {
      expect(needsUpdate(stored, 'https://example.com/new.pdf', 'xyz')).toBe(true)
    })

    it('returns true when hash differs', () => {
      expect(needsUpdate(stored, 'https://example.com/test.pdf', 'different')).toBe(true)
    })

    it('returns false when hash matches', () => {
      expect(needsUpdate(stored, 'https://example.com/test.pdf', 'abc123')).toBe(false)
    })
  })

  describe('updatePdfEntry', () => {
    it('adds new entry', () => {
      const meta: SyncMetadata = { lastScrapedAt: null, pdfs: {} }
      const entry: PdfMetadata = {
        title: 'Test', url: 'https://example.com/test.pdf',
        category: 'core-rules', sha256: 'abc',
        downloadedAt: '2024-01-01', markdownFile: 'test.md',
      }
      const updated = updatePdfEntry(meta, entry.url, entry)
      expect(updated.pdfs['https://example.com/test.pdf']).toEqual(entry)
    })

    it('overwrites existing entry', () => {
      const existing: PdfMetadata = {
        title: 'Old', url: 'https://example.com/test.pdf',
        category: 'core-rules', sha256: 'old',
        downloadedAt: '2024-01-01', markdownFile: 'test.md',
      }
      const meta: SyncMetadata = { lastScrapedAt: null, pdfs: { [existing.url]: existing } }
      const newEntry: PdfMetadata = { ...existing, sha256: 'new', title: 'Updated' }
      const updated = updatePdfEntry(meta, existing.url, newEntry)
      expect(updated.pdfs[existing.url].sha256).toBe('new')
      expect(updated.pdfs[existing.url].title).toBe('Updated')
    })
  })
})
