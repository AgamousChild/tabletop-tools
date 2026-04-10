import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkForBrainUpdates, syncBrainData } from './sync'
import type { BrainManifest } from './sync'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('./store', () => ({
  saveNodes: vi.fn().mockResolvedValue(undefined),
  saveRefs: vi.fn().mockResolvedValue(undefined),
  setBrainMeta: vi.fn().mockResolvedValue(undefined),
  getBrainMeta: vi.fn().mockResolvedValue(null),
  clearBrainData: vi.fn().mockResolvedValue(undefined),
}))

describe('checkForBrainUpdates', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns available: true when no local version', async () => {
    const manifest: BrainManifest = {
      version: 1,
      updatedAt: '2026-04-08T00:00:00Z',
      files: { 'nodes/core.json': 'hash:abc' },
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(manifest),
    })
    const result = await checkForBrainUpdates()
    expect(result.available).toBe(true)
    expect(result.manifest).toBeTruthy()
  })

  it('returns available: false on fetch error', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))
    const result = await checkForBrainUpdates()
    expect(result.available).toBe(false)
    expect(result.manifest).toBeNull()
  })

  it('returns available: false when version matches', async () => {
    const manifest: BrainManifest = {
      version: 3,
      updatedAt: '2026-04-08T00:00:00Z',
      files: {},
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(manifest),
    })
    const result = await checkForBrainUpdates(3)
    expect(result.available).toBe(false)
  })

  it('returns available: true when remote version is higher', async () => {
    const manifest: BrainManifest = {
      version: 5,
      updatedAt: '2026-04-08T00:00:00Z',
      files: {},
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(manifest),
    })
    const result = await checkForBrainUpdates(3)
    expect(result.available).toBe(true)
  })
})

describe('syncBrainData', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('downloads and saves all files from manifest', async () => {
    const manifest: BrainManifest = {
      version: 1,
      updatedAt: '2026-04-08T00:00:00Z',
      files: {
        'nodes/core.json': 'hash:abc',
      },
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'core:test', layer: 'core' }]),
    })

    const onProgress = vi.fn()
    const result = await syncBrainData(manifest, {}, onProgress)
    expect(result.errors).toHaveLength(0)
    expect(result.nodeCount).toBe(1)
    expect(onProgress).toHaveBeenCalledWith({ current: 1, total: 1, currentFile: 'nodes/core.json' })
  })

  it('skips files with matching hashes', async () => {
    const manifest: BrainManifest = {
      version: 2,
      updatedAt: '2026-04-08T00:00:00Z',
      files: {
        'nodes/core.json': 'hash:abc',
        'nodes/errata.json': 'hash:def',
      },
    }
    const localHashes: Record<string, string> = {
      'nodes/core.json': 'hash:abc',
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })

    await syncBrainData(manifest, localHashes, vi.fn())
    // Should only fetch errata.json, not core.json
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('reports errors for failed fetches', async () => {
    const manifest: BrainManifest = {
      version: 1,
      updatedAt: '2026-04-08T00:00:00Z',
      files: { 'nodes/core.json': 'hash:abc' },
    }
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    const result = await syncBrainData(manifest, {}, vi.fn())
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('handles ref files', async () => {
    const manifest: BrainManifest = {
      version: 1,
      updatedAt: '2026-04-08T00:00:00Z',
      files: {
        'refs/core-refs.json': 'hash:xyz',
      },
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ sourceId: 'a', targetId: 'b', rel: 'part_of', context: 'test' }]),
    })

    const result = await syncBrainData(manifest, {}, vi.fn())
    expect(result.refCount).toBe(1)
  })
})
