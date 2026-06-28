import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchAndProcessBSData, rollupChapterFaction } from './bsdata'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Minimal valid BSData XML that parseBSDataXml can handle
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<catalogue xmlns="http://www.battlescribe.net/schema/catalogueSchema">
  <selectionEntries>
    <selectionEntry id="unit1" name="Intercessors" type="unit">
      <profiles>
        <profile id="prof1" name="Intercessor" typeName="Unit">
          <characteristics>
            <characteristic name="M" typeId="m">6&quot;</characteristic>
            <characteristic name="T" typeId="t">4</characteristic>
            <characteristic name="Sv" typeId="sv">3+</characteristic>
            <characteristic name="W" typeId="w">2</characteristic>
            <characteristic name="Ld" typeId="ld">6+</characteristic>
            <characteristic name="OC" typeId="oc">2</characteristic>
          </characteristics>
        </profile>
      </profiles>
      <selectionEntries>
        <selectionEntry id="weap1" name="Bolt Rifle" type="upgrade">
          <profiles>
            <profile id="wp1" name="Bolt rifle" typeName="Ranged Weapons">
              <characteristics>
                <characteristic name="Range" typeId="range">30&quot;</characteristic>
                <characteristic name="A" typeId="a">2</characteristic>
                <characteristic name="BS" typeId="bs">3+</characteristic>
                <characteristic name="S" typeId="s">4</characteristic>
                <characteristic name="AP" typeId="ap">-1</characteristic>
                <characteristic name="D" typeId="d">1</characteristic>
              </characteristics>
            </profile>
          </profiles>
        </selectionEntry>
      </selectionEntries>
      <costs>
        <cost name="pts" typeId="pts" value="90"/>
      </costs>
    </selectionEntry>
  </selectionEntries>
</catalogue>`

beforeEach(() => {
  mockFetch.mockReset()
})

describe('rollupChapterFaction', () => {
  it.each([
    ['Ultramarines', 'ultramarines'],
    ['Imperial Fists', 'imperial-fists'],
    ['Iron Hands', 'iron-hands'],
    ['Raven Guard', 'raven-guard'],
    ['Salamanders', 'salamanders'],
    ['White Scars', 'white-scars'],
    ['Space Wolves', 'space-wolves'],
    ['Black Templars', 'black-templars'],
    ['Blood Angels', 'blood-angels'],
    ['Dark Angels', 'dark-angels'],
    ['Deathwatch', 'deathwatch'],
  ])('rolls %s up to Space Marines + subfaction %s', (chapter, subfaction) => {
    expect(rollupChapterFaction(chapter)).toEqual({ faction: 'Space Marines', subfaction })
  })

  it('leaves non-chapter factions unchanged with no subfaction', () => {
    expect(rollupChapterFaction('Tyranids')).toEqual({ faction: 'Tyranids' })
    expect(rollupChapterFaction('Chaos Daemons')).toEqual({ faction: 'Chaos Daemons' })
    expect(rollupChapterFaction('Space Marines')).toEqual({ faction: 'Space Marines' })
  })
})

describe('fetchAndProcessBSData', () => {
  it('skips when commit SHA matches', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: 'abc123' }),
    })

    const result = await fetchAndProcessBSData('abc123')
    expect(result.skipped).toBe(true)
    expect(result.commitSha).toBe('abc123')
    expect(mockFetch).toHaveBeenCalledTimes(1) // only commit check
  })

  it('fetches and parses catalog files', async () => {
    // 1. Commit SHA
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: 'def456' }),
    })

    // 2. Tree
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          tree: [
            { path: 'Imperium - Space Marines.cat', type: 'blob', url: '', sha: '' },
            { path: 'README.md', type: 'blob', url: '', sha: '' }, // non-cat, should be filtered
          ],
        }),
    })

    // 3. Raw XML fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(SAMPLE_XML),
    })

    const result = await fetchAndProcessBSData()
    expect(result.skipped).toBe(false)
    expect(result.commitSha).toBe('def456')
    expect(result.units.length).toBeGreaterThan(0)

    const unit = result.units[0]!
    expect(unit.name).toBe('Intercessors')
    expect(unit.faction).toBe('Space Marines') // "Imperium - " prefix stripped
  })

  it('throws on GitHub API failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })

    await expect(fetchAndProcessBSData()).rejects.toThrow('HTTP 403')
  })

  it('rolls up Ultramarines chapter catalog into Space Marines + subfaction', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'um1' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tree: [{ path: 'Imperium - Ultramarines.cat', type: 'blob', url: '', sha: '' }],
          }),
      })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(SAMPLE_XML) })

    const result = await fetchAndProcessBSData()
    expect(result.skipped).toBe(false)
    expect(result.units.length).toBeGreaterThan(0)

    const unit = result.units[0]!
    expect(unit.faction).toBe('Space Marines')
    expect(unit.subfaction).toBe('ultramarines')
  })

  it('rolls up Space Wolves chapter catalog into Space Marines + subfaction', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'sw1' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tree: [{ path: 'Imperium - Space Wolves.cat', type: 'blob', url: '', sha: '' }],
          }),
      })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(SAMPLE_XML) })

    const result = await fetchAndProcessBSData()
    expect(result.skipped).toBe(false)
    const unit = result.units[0]!
    expect(unit.faction).toBe('Space Marines')
    expect(unit.subfaction).toBe('space-wolves')
  })

  it('leaves non-Space-Marines factions unchanged (no subfaction field)', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'ty1' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tree: [{ path: 'Tyranids.cat', type: 'blob', url: '', sha: '' }],
          }),
      })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(SAMPLE_XML) })

    const result = await fetchAndProcessBSData()
    expect(result.skipped).toBe(false)
    const unit = result.units[0]!
    expect(unit.faction).toBe('Tyranids')
    expect(unit.subfaction).toBeUndefined()
  })

  it('continues on individual catalog parse errors', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sha: 'ghi789' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tree: [{ path: 'Bad Catalog.cat', type: 'blob', url: '', sha: '' }],
          }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

    // Should not throw — individual errors are collected
    const result = await fetchAndProcessBSData()
    expect(result.skipped).toBe(false)
    expect(result.units).toHaveLength(0) // failed catalog produces no units
  })
})
