import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Manifest } from './sync'
import { checkForUpdates, syncAllData } from './sync'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock game-data-store save functions
vi.mock('@tabletop-tools/game-data-store', () => ({
  saveUnits: vi.fn().mockResolvedValue(undefined),
  setImportMeta: vi.fn().mockResolvedValue(undefined),
  saveDetachments: vi.fn().mockResolvedValue(undefined),
  saveDetachmentAbilities: vi.fn().mockResolvedValue(undefined),
  saveStratagems: vi.fn().mockResolvedValue(undefined),
  saveEnhancements: vi.fn().mockResolvedValue(undefined),
  saveLeaderAttachments: vi.fn().mockResolvedValue(undefined),
  saveUnitCompositions: vi.fn().mockResolvedValue(undefined),
  saveUnitCosts: vi.fn().mockResolvedValue(undefined),
  saveWargearOptions: vi.fn().mockResolvedValue(undefined),
  saveUnitKeywords: vi.fn().mockResolvedValue(undefined),
  saveUnitAbilities: vi.fn().mockResolvedValue(undefined),
  saveDatasheets: vi.fn().mockResolvedValue(undefined),
  saveDatasheetWargear: vi.fn().mockResolvedValue(undefined),
  saveDatasheetModels: vi.fn().mockResolvedValue(undefined),
  saveMissions: vi.fn().mockResolvedValue(undefined),
  saveAbilities: vi.fn().mockResolvedValue(undefined),
  saveDatasheetStratagems: vi.fn().mockResolvedValue(undefined),
  saveDatasheetEnhancements: vi.fn().mockResolvedValue(undefined),
  saveDatasheetDetachmentAbilities: vi.fn().mockResolvedValue(undefined),
  setRulesImportMeta: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  mockFetch.mockReset()
})

describe('checkForUpdates', () => {
  it('returns available=true when manifest exists and version is newer', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ version: 5, updatedAt: '2024-01-15', files: [] }),
    })

    const result = await checkForUpdates(3)
    expect(result.available).toBe(true)
    expect(result.manifest?.version).toBe(5)
  })

  it('returns available=false when version matches', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ version: 3, updatedAt: '2024-01-15', files: [] }),
    })

    const result = await checkForUpdates(3)
    expect(result.available).toBe(false)
  })

  it('returns available=true when no current version', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ version: 1, updatedAt: '2024-01-15', files: [] }),
    })

    const result = await checkForUpdates()
    expect(result.available).toBe(true)
  })

  it('returns available=false on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const result = await checkForUpdates()
    expect(result.available).toBe(false)
    expect(result.manifest).toBeNull()
  })

  it('returns available=false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await checkForUpdates()
    expect(result.available).toBe(false)
    expect(result.manifest).toBeNull()
  })
})

describe('syncAllData', () => {
  it('downloads and saves all files from manifest', async () => {
    const manifest: Manifest = {
      version: 1,
      updatedAt: '2024-01-15',
      bsdata: { commitSha: 'abc', unitCount: 10, factionCount: 2 },
      files: ['bsdata-units.json', 'datasheets.json'],
    }

    // Mock fetch for data files
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('bsdata-units.json')) {
        return {
          ok: true,
          json: () => Promise.resolve([{ id: 'u1' }, { id: 'u2' }]),
        }
      }
      if (url.includes('datasheets.json')) {
        return {
          ok: true,
          json: () => Promise.resolve([{ id: 'ds1' }]),
        }
      }
      return { ok: false, status: 404 }
    })

    const progress: Array<{ current: number; total: number; currentStep: string }> = []
    const result = await syncAllData(manifest, (p) => progress.push({ ...p }))

    expect(result.unitCount).toBe(2)
    expect(result.rulesCount).toBe(1) // 1 datasheet
    expect(result.errors).toHaveLength(0)
    expect(progress.length).toBe(2)
    expect(progress[0]!.currentStep).toBe('Unit Profiles')
  })

  it('collects errors for failed files', async () => {
    const manifest: Manifest = {
      version: 1,
      updatedAt: '2024-01-15',
      files: ['bsdata-units.json'],
    }

    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const result = await syncAllData(manifest, () => {})
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Unit Profiles')
  })

  it('skips files not in STORE_MAP', async () => {
    const manifest: Manifest = {
      version: 1,
      updatedAt: '2024-01-15',
      files: ['unknown-file.json'],
    }

    const result = await syncAllData(manifest, () => {})
    expect(result.errors).toHaveLength(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
