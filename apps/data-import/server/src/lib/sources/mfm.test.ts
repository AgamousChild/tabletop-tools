import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchAndProcessMFM, parseMfmFactionYaml } from './mfm'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

const SAMPLE_YAML = `name: Test Faction
slug: test-faction
version: "1.0"
detachments:
  - name: Combat Patrol
    dp: 2
    objective: TAKE AND HOLD
    enhancements:
      - { name: Banner of Honour, points: 25 }
      - { name: Master Tactician, points: 15, leaderTo: [Captain, Lieutenant] }
  - name: Stealth Strike
    dp: 1
    objective: DISRUPTION
    unique: Acrobatic
    enhancements: []
units:
  - name: Veteran Squad
    pricing:
      - range: "[1,)"
        label: Your Unit Costs
        costs:
          - { models: 5, points: 90 }
          - { models: 10, points: 180 }
  - name: Honored Champion
    pricing:
      - range: "[1,2]"
        label: Your 1st to 2nd Units Cost
        costs:
          - { models: 1, points: 75 }
      - range: "[3,)"
        label: Your 3rd+ Unit Costs
        costs:
          - { models: 1, points: 90 }
    role: leader
    attachTo:
      - Veteran Squad
    wargear:
      - { item: Power Sword, points: 5 }
  - name: Old Marine
    pricing:
      - range: "[1,)"
        label: Your Unit Costs
        costs:
          - { models: 1, points: 60 }
    legends: true
`

describe('parseMfmFactionYaml', () => {
  it('parses identity fields', () => {
    const f = parseMfmFactionYaml(SAMPLE_YAML)
    expect(f.slug).toBe('test-faction')
    expect(f.name).toBe('Test Faction')
    expect(f.version).toBe('1.0')
  })

  it('parses detachments with enhancements', () => {
    const f = parseMfmFactionYaml(SAMPLE_YAML)
    expect(f.detachments).toHaveLength(2)
    const cp = f.detachments[0]!
    expect(cp.name).toBe('Combat Patrol')
    expect(cp.dp).toBe(2)
    expect(cp.objective).toBe('TAKE AND HOLD')
    expect(cp.enhancements).toHaveLength(2)
    expect(cp.enhancements[1]!.leaderTo).toEqual(['Captain', 'Lieutenant'])
  })

  it('preserves unique-detachment marker', () => {
    const f = parseMfmFactionYaml(SAMPLE_YAML)
    const stealth = f.detachments.find((d) => d.name === 'Stealth Strike')!
    expect(stealth.unique).toBe('Acrobatic')
  })

  it('parses size-tier pricing (5 vs 10 models)', () => {
    const f = parseMfmFactionYaml(SAMPLE_YAML)
    const vet = f.units.find((u) => u.name === 'Veteran Squad')!
    expect(vet.pricing).toHaveLength(1)
    expect(vet.pricing[0]!.costs).toEqual([
      { models: 5, points: 90 },
      { models: 10, points: 180 },
    ])
  })

  it('parses repeat-cost via interval ranges', () => {
    const f = parseMfmFactionYaml(SAMPLE_YAML)
    const champ = f.units.find((u) => u.name === 'Honored Champion')!
    expect(champ.pricing).toHaveLength(2)
    expect(champ.pricing[0]!.range).toBe('[1,2]')
    expect(champ.pricing[1]!.range).toBe('[3,)')
    expect(champ.pricing[0]!.costs[0]!.points).toBe(75)
    expect(champ.pricing[1]!.costs[0]!.points).toBe(90)
  })

  it('captures leader role and attachTo list', () => {
    const f = parseMfmFactionYaml(SAMPLE_YAML)
    const champ = f.units.find((u) => u.name === 'Honored Champion')!
    expect(champ.role).toBe('leader')
    expect(champ.attachTo).toEqual(['Veteran Squad'])
  })

  it('captures wargear items', () => {
    const f = parseMfmFactionYaml(SAMPLE_YAML)
    const champ = f.units.find((u) => u.name === 'Honored Champion')!
    expect(champ.wargear).toEqual([{ item: 'Power Sword', points: 5 }])
  })

  it('preserves legends flag', () => {
    const f = parseMfmFactionYaml(SAMPLE_YAML)
    const old = f.units.find((u) => u.name === 'Old Marine')!
    expect(old.legends).toBe(true)
  })

  it('throws on missing required fields', () => {
    expect(() => parseMfmFactionYaml('detachments: []\nunits: []')).toThrow()
  })
})

describe('fetchAndProcessMFM', () => {
  it('skips when commit SHA matches', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: 'sha-x' }),
    })
    const result = await fetchAndProcessMFM('sha-x')
    expect(result.skipped).toBe(true)
    expect(result.factions).toHaveLength(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('fetches and parses faction YAMLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: 'sha-y' }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          tree: [
            { path: 'data/meta.yaml', type: 'blob', url: '', sha: '' }, // skipped
            { path: 'data/test-faction.yaml', type: 'blob', url: '', sha: '' },
            { path: 'README.md', type: 'blob', url: '', sha: '' }, // skipped
          ],
        }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(SAMPLE_YAML),
    })

    const result = await fetchAndProcessMFM()
    expect(result.skipped).toBe(false)
    expect(result.commitSha).toBe('sha-y')
    expect(result.factions).toHaveLength(1)
    expect(result.factions[0]!.slug).toBe('test-faction')
    expect(result.factions[0]!.units).toHaveLength(3)
  })

  it('continues on individual file parse errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: 'sha-z' }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          tree: [{ path: 'data/bad.yaml', type: 'blob', url: '', sha: '' }],
        }),
    })
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const result = await fetchAndProcessMFM()
    expect(result.skipped).toBe(false)
    expect(result.factions).toHaveLength(0)
  })
})
