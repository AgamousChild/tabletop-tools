import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadMetadata, saveMetadata, hasChanged } from './metadata'

describe('metadata', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wahapedia-meta-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('loadMetadata', () => {
    it('returns default when file does not exist', () => {
      const meta = loadMetadata(join(tempDir, 'nonexistent.json'))
      expect(meta).toEqual({
        lastUpdate: null,
        lastSyncedAt: null,
        csvFiles: {},
      })
    })

    it('loads existing metadata', () => {
      const path = join(tempDir, 'metadata.json')
      const data = {
        lastUpdate: '2024-01-15',
        lastSyncedAt: '2024-01-15T10:00:00Z',
        csvFiles: { Factions: { downloadedAt: '2024-01-15T10:00:00Z', rowCount: 30 } },
      }
      saveMetadata(path, data)
      expect(loadMetadata(path)).toEqual(data)
    })

    it('returns default for corrupted JSON', () => {
      const path = join(tempDir, 'bad.json')
      require('node:fs').writeFileSync(path, 'not json', 'utf-8')
      expect(loadMetadata(path)).toEqual({
        lastUpdate: null,
        lastSyncedAt: null,
        csvFiles: {},
      })
    })
  })

  describe('saveMetadata', () => {
    it('creates parent directories', () => {
      const path = join(tempDir, 'deep', 'nested', 'metadata.json')
      saveMetadata(path, { lastUpdate: 'x', lastSyncedAt: 'y', csvFiles: {} })
      expect(existsSync(path)).toBe(true)
    })

    it('roundtrips metadata', () => {
      const path = join(tempDir, 'metadata.json')
      const meta = {
        lastUpdate: '2024-06-01',
        lastSyncedAt: '2024-06-01T12:00:00Z',
        csvFiles: {
          Datasheets: { downloadedAt: '2024-06-01T12:00:00Z', rowCount: 500 },
        },
      }
      saveMetadata(path, meta)
      expect(loadMetadata(path)).toEqual(meta)
    })
  })

  describe('hasChanged', () => {
    it('returns true when lastUpdate differs', () => {
      const stored = { lastUpdate: '2024-01-01', lastSyncedAt: null, csvFiles: {} }
      expect(hasChanged(stored, '2024-02-01')).toBe(true)
    })

    it('returns false when lastUpdate matches', () => {
      const stored = { lastUpdate: '2024-01-01', lastSyncedAt: null, csvFiles: {} }
      expect(hasChanged(stored, '2024-01-01')).toBe(false)
    })

    it('returns true when stored has null lastUpdate', () => {
      const stored = { lastUpdate: null, lastSyncedAt: null, csvFiles: {} }
      expect(hasChanged(stored, '2024-01-01')).toBe(true)
    })
  })
})
