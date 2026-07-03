import { beforeEach, describe, expect, it } from 'vitest'

import {
  expandFactionForRetrieval,
  expandFactionsForRetrieval,
  resetSubfactionCache,
} from './factions'

interface FakeR2Object {
  json<T>(): Promise<T>
}

function makeBucket(files: Record<string, unknown>) {
  return {
    get: async (key: string): Promise<FakeR2Object | null> => {
      const data = files[key]
      if (data === undefined) return null
      return { json: async <T>() => data as T }
    },
  }
}

const smChapterRows = [
  { id: 'blood-angels', name: 'Blood Angels', factionId: 'space-marines' },
  { id: 'dark-angels', name: 'Dark Angels', factionId: 'space-marines' },
  { id: 'space-wolves', name: 'Space Wolves', factionId: 'space-marines' },
  { id: 'black-templars', name: 'Black Templars', factionId: 'space-marines' },
  { id: 'deathwatch', name: 'Deathwatch', factionId: 'space-marines' },
]

describe('expandFactionForRetrieval', () => {
  beforeEach(() => {
    resetSubfactionCache()
  })

  it('chapter query expands to include the parent faction (Blood Angels → +space-marines)', async () => {
    const bucket = makeBucket({ 'dim/subfactions.json': smChapterRows })
    const result = await expandFactionForRetrieval('blood-angels', bucket)
    expect(result).toEqual(new Set(['blood-angels', 'space-marines']))
  })

  it('non-chapter query stays scoped to just the input factionId (orks stays orks)', async () => {
    const bucket = makeBucket({ 'dim/subfactions.json': smChapterRows })
    const result = await expandFactionForRetrieval('orks', bucket)
    expect(result).toEqual(new Set(['orks']))
  })

  it('unknown factionId returns just the input (no rows match)', async () => {
    const bucket = makeBucket({ 'dim/subfactions.json': smChapterRows })
    const result = await expandFactionForRetrieval('not-a-real-faction', bucket)
    expect(result).toEqual(new Set(['not-a-real-faction']))
  })

  it('parent faction query does not re-expand upward (space-marines stays space-marines)', async () => {
    // space-marines is a factionId, not a subfaction row id — the parent walk
    // is one-hop and must not return every chapter under the same parent.
    const bucket = makeBucket({ 'dim/subfactions.json': smChapterRows })
    const result = await expandFactionForRetrieval('space-marines', bucket)
    expect(result).toEqual(new Set(['space-marines']))
  })

  it('missing dim/subfactions.json file → no expansion (fail-open)', async () => {
    const bucket = makeBucket({}) // no dim file at all
    const result = await expandFactionForRetrieval('blood-angels', bucket)
    expect(result).toEqual(new Set(['blood-angels']))
  })

  it('caches the R2 fetch per isolate (second call does not re-read)', async () => {
    let getCalls = 0
    const bucket = {
      get: async (key: string): Promise<FakeR2Object | null> => {
        getCalls++
        if (key === 'dim/subfactions.json') {
          return { json: async <T>() => smChapterRows as T }
        }
        return null
      },
    }

    await expandFactionForRetrieval('blood-angels', bucket)
    await expandFactionForRetrieval('dark-angels', bucket)
    await expandFactionForRetrieval('space-wolves', bucket)

    // One R2 read for the first call; subsequent calls hit the cache.
    expect(getCalls).toBe(1)
  })
})

describe('expandFactionsForRetrieval (batch)', () => {
  beforeEach(() => {
    resetSubfactionCache()
  })

  it('unions expansions across multiple faction slugs', async () => {
    const bucket = makeBucket({ 'dim/subfactions.json': smChapterRows })
    const result = await expandFactionsForRetrieval(['blood-angels', 'orks'], bucket)
    expect(result).toEqual(new Set(['blood-angels', 'space-marines', 'orks']))
  })

  it('empty input returns empty set', async () => {
    const bucket = makeBucket({ 'dim/subfactions.json': smChapterRows })
    const result = await expandFactionsForRetrieval([], bucket)
    expect(result.size).toBe(0)
  })
})
