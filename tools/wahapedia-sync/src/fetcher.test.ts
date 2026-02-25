import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fetchCsv, fetchLastUpdate, downloadAllCsvs } from './fetcher'

function mockFetch(responses: Record<string, string | { status: number }>): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    const body = responses[urlStr]

    if (body === undefined) {
      return new Response('Not Found', { status: 404 })
    }

    if (typeof body === 'object' && 'status' in body) {
      return new Response('Error', { status: body.status })
    }

    return new Response(body, { status: 200 })
  }) as typeof fetch
}

describe('fetchCsv', () => {
  it('fetches and returns CSV content', async () => {
    const content = 'id|name\n1|Test'
    const fetch = mockFetch({
      'https://wahapedia.ru/wh40k10ed/Factions.csv': content,
    })

    const result = await fetchCsv('Factions', fetch)
    expect(result).toBe(content)
  })

  it('throws on non-200 response', async () => {
    const fetch = mockFetch({
      'https://wahapedia.ru/wh40k10ed/Factions.csv': { status: 403 },
    })

    await expect(fetchCsv('Factions', fetch)).rejects.toThrow('Failed to fetch Factions: 403')
  })

  it('sends User-Agent header', async () => {
    const fetch = vi.fn(async () => new Response('ok', { status: 200 })) as typeof globalThis.fetch
    await fetchCsv('Factions', fetch)

    expect(fetch).toHaveBeenCalledWith(
      'https://wahapedia.ru/wh40k10ed/Factions.csv',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
      }),
    )
  })
})

describe('fetchLastUpdate', () => {
  it('extracts last_update value', async () => {
    const fetch = mockFetch({
      'https://wahapedia.ru/wh40k10ed/Last_update.csv': 'last_update\n2024-06-15 10:30:00',
    })

    const result = await fetchLastUpdate(fetch)
    expect(result).toBe('2024-06-15 10:30:00')
  })

  it('throws on empty CSV', async () => {
    const fetch = mockFetch({
      'https://wahapedia.ru/wh40k10ed/Last_update.csv': 'last_update',
    })

    await expect(fetchLastUpdate(fetch)).rejects.toThrow('empty or malformed')
  })
})

describe('downloadAllCsvs', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wahapedia-fetch-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('downloads all CSV files to disk', async () => {
    const responses: Record<string, string> = {}
    const csvFiles = [
      'Last_update', 'Factions', 'Datasheets', 'Datasheets_models',
      'Datasheets_abilities', 'Datasheets_unit_composition', 'Datasheets_wargear',
      'Abilities', 'Stratagems', 'Detachment_abilities', 'Enhancements',
      'Wargear_list', 'Source',
    ]
    for (const name of csvFiles) {
      responses[`https://wahapedia.ru/wh40k10ed/${name}.csv`] = `id|name\n1|${name}`
    }

    const fetch = mockFetch(responses)
    const results = await downloadAllCsvs(tempDir, fetch)

    expect(results).toHaveLength(13)
    expect(existsSync(join(tempDir, 'Factions.csv'))).toBe(true)
    expect(readFileSync(join(tempDir, 'Factions.csv'), 'utf-8')).toBe('id|name\n1|Factions')

    const factionsResult = results.find((r) => r.fileName === 'Factions')
    expect(factionsResult?.rowCount).toBe(1)
  })

  it('creates output directory if missing', async () => {
    const nested = join(tempDir, 'deep', 'dir')
    const responses: Record<string, string> = {}
    const csvFiles = [
      'Last_update', 'Factions', 'Datasheets', 'Datasheets_models',
      'Datasheets_abilities', 'Datasheets_unit_composition', 'Datasheets_wargear',
      'Abilities', 'Stratagems', 'Detachment_abilities', 'Enhancements',
      'Wargear_list', 'Source',
    ]
    for (const name of csvFiles) {
      responses[`https://wahapedia.ru/wh40k10ed/${name}.csv`] = `col\nval`
    }

    await downloadAllCsvs(nested, mockFetch(responses))
    expect(existsSync(nested)).toBe(true)
  })
})
