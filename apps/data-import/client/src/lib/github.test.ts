import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listCatalogFiles, fetchCatalogXml } from './github'
import type { CatalogFile } from './github'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

describe('listCatalogFiles', () => {
  it('fetches and filters .cat files from GitHub API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { name: 'Imperium - Space Marines.cat', size: 500000, download_url: 'https://raw.githubusercontent.com/BSData/wh40k-10e/main/Imperium%20-%20Space%20Marines.cat' },
        { name: 'Orks.cat', size: 200000, download_url: 'https://raw.githubusercontent.com/BSData/wh40k-10e/main/Orks.cat' },
        { name: 'Warhammer 40,000.gst', size: 100000, download_url: 'https://raw.githubusercontent.com/BSData/wh40k-10e/main/Warhammer%2040%2C000.gst' },
        { name: 'README.md', size: 500, download_url: null },
      ],
    })

    const files = await listCatalogFiles()

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/BSData/wh40k-10e/contents?ref=main',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
    expect(files).toHaveLength(2)
    expect(files[0]!.faction).toBe('Imperium - Space Marines')
    expect(files[1]!.faction).toBe('Orks')
  })

  it('derives faction name by stripping .cat extension', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { name: 'Chaos - Death Guard.cat', size: 300000, download_url: 'https://example.com/file.cat' },
      ],
    })

    const files = await listCatalogFiles()
    expect(files[0]!.faction).toBe('Chaos - Death Guard')
  })

  it('constructs raw.githubusercontent.com download URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { name: 'Orks.cat', size: 200000, download_url: 'https://raw.githubusercontent.com/BSData/wh40k-10e/main/Orks.cat' },
      ],
    })

    const files = await listCatalogFiles('BSData/wh40k-10e', 'main')
    expect(files[0]!.downloadUrl).toBe('https://raw.githubusercontent.com/BSData/wh40k-10e/main/Orks.cat')
  })

  it('supports custom repo and branch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    await listCatalogFiles('MyOrg/my-data', 'dev')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/MyOrg/my-data/contents?ref=dev',
      expect.any(Object),
    )
  })

  it('throws on GitHub API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
    await expect(listCatalogFiles()).rejects.toThrow('GitHub API error: 404 Not Found')
  })

  it('sorts files alphabetically by faction name', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { name: 'Orks.cat', size: 200000, download_url: 'https://example.com/orks.cat' },
        { name: 'Aeldari.cat', size: 300000, download_url: 'https://example.com/aeldari.cat' },
        { name: 'Chaos - World Eaters.cat', size: 100000, download_url: 'https://example.com/we.cat' },
      ],
    })

    const files = await listCatalogFiles()
    expect(files.map((f) => f.faction)).toEqual(['Aeldari', 'Chaos - World Eaters', 'Orks'])
  })
})

describe('fetchCatalogXml', () => {
  it('fetches raw XML from download URL', async () => {
    const xml = '<catalogue>test</catalogue>'
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => xml })

    const file: CatalogFile = {
      name: 'Orks.cat',
      faction: 'Orks',
      downloadUrl: 'https://raw.githubusercontent.com/BSData/wh40k-10e/main/Orks.cat',
      size: 200000,
    }
    const result = await fetchCatalogXml(file)
    expect(result).toBe(xml)
    expect(mockFetch).toHaveBeenCalledWith(file.downloadUrl)
  })

  it('throws on fetch error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' })
    const file: CatalogFile = {
      name: 'Orks.cat',
      faction: 'Orks',
      downloadUrl: 'https://example.com/orks.cat',
      size: 200000,
    }
    await expect(fetchCatalogXml(file)).rejects.toThrow('Failed to fetch Orks.cat: 500 Server Error')
  })
})
