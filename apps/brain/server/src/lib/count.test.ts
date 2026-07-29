import { beforeEach, describe, expect, test } from 'vitest'

import { count, countCached, countCacheKey, resetCubeCache } from './count'
import { buildCube } from './cube'
import type { Node } from './model'

const src = {
  type: 'wahapedia' as const,
  title: 'Wahapedia',
  retrievedAt: '2026-01-01T00:00:00Z',
}

function detachment(id: string, factionId: string, title: string, dp: number): Node {
  return {
    id,
    layer: 'faction',
    category: 'detachment',
    title,
    content: `${title} container.`,
    summary: title,
    factionId,
    edition: '11th',
    dp,
    sources: [src],
    refs: [],
    version: 1,
    keywords: ['detachment'],
  }
}

function unit(id: string, factionId: string, title: string, keywords: string[]): Node {
  return {
    id,
    layer: 'unit',
    category: 'datasheet',
    title,
    content: `${title} datasheet.`,
    summary: title,
    factionId,
    edition: '11th',
    sources: [src],
    refs: [],
    version: 1,
    keywords: [factionId, ...keywords],
  }
}

function faction(id: string, name: string): Node {
  return {
    id: `faction-root:${id}`,
    layer: 'faction',
    category: 'faction',
    title: name,
    content: `${name} root.`,
    summary: name,
    factionId: id,
    factionName: name,
    edition: '11th',
    sources: [src],
    refs: [],
    version: 1,
    keywords: [id],
  }
}

/**
 * Fake R2 bucket that serves pre-built cube tables + captures put()
 * writes so we can assert cache-write behaviour.
 */
function fakeBucket(nodes: Node[]) {
  const subfactions = [
    { id: 'dark-angels', name: 'Dark Angels', factionId: 'space-marines' },
    { id: 'blood-angels', name: 'Blood Angels', factionId: 'space-marines' },
  ]
  const cube = buildCube(nodes, subfactions)
  const store = new Map<string, string>()
  store.set('cube/fact_node.jsonl', cube.factNodesJsonl)
  store.set('cube/dim_faction.json', JSON.stringify(cube.dimFaction))
  store.set('cube/dim_keyword.json', JSON.stringify(cube.dimKeyword))
  store.set('cube/rollup_faction_dp.json', JSON.stringify(cube.rollupFactionDp))
  store.set(
    'cube/rollup_faction_category_edition.json',
    JSON.stringify(cube.rollupFactionCategoryEdition),
  )
  store.set('manifest.json', JSON.stringify({ hash: 'test-cube-v1' }))
  const puts: string[] = []
  return {
    store,
    puts,
    get: async (key: string) => {
      const v = store.get(key)
      if (v === undefined) return null
      return {
        text: async () => v,
        json: async <T>() => JSON.parse(v) as T,
      }
    },
    put: async (key: string, value: string | ArrayBuffer) => {
      puts.push(key)
      store.set(key, typeof value === 'string' ? value : '<binary>')
      return null
    },
  }
}

const smNodes = [
  faction('space-marines', 'Space Marines'),
  faction('dark-angels', 'Dark Angels'),
  faction('blood-angels', 'Blood Angels'),
  // SM detachments accessible to all chapters
  detachment('11e:det:space-marines:gladius', 'space-marines', 'Gladius', 3),
  detachment('11e:det:space-marines:anvil', 'space-marines', 'Anvil', 2),
  detachment('11e:det:space-marines:librarius', 'space-marines', 'Librarius', 1),
  // DA-only
  detachment('11e:det:dark-angels:dark-age-arsenal', 'dark-angels', 'Dark Age Arsenal', 1),
  // BA-only
  detachment('11e:det:blood-angels:red-fury', 'blood-angels', 'Red Fury', 2),
  // Units with ability keywords
  unit('u1', 'space-marines', 'Intercessor Squad', ['sustained hits']),
  unit('u2', 'space-marines', 'Terminator Squad', ['deep strike']),
  unit('u3', 'dark-angels', 'Deathwing Knights', ['deep strike']),
  unit('u4', 'dark-angels', 'Ravenwing Bikers', ['scouts']),
]

describe('count', () => {
  beforeEach(() => resetCubeCache())

  test('counts all detachments accessible to Dark Angels via faction filter', async () => {
    const bucket = fakeBucket(smNodes)
    const r = await count(bucket, { category: 'detachment', faction: 'dark-angels' })
    // DA sees: 3 SM detachments + 1 DA-only = 4 total
    expect(r.count).toBe(4)
  })

  test('populates dpRollup + Strike Force combos for detachment questions', async () => {
    const bucket = fakeBucket(smNodes)
    const r = await count(bucket, {
      category: 'detachment',
      faction: 'dark-angels',
      edition: '11th',
    })
    expect(r.dpRollup).toBeDefined()
    expect(r.dpRollup).toHaveLength(1)
    const da = r.dpRollup![0]!
    expect(da.factionId).toBe('dark-angels')
    expect(da.total).toBe(4)
    expect(da.dp1).toBe(2) // Librarius + Dark Age Arsenal
    expect(da.dp2).toBe(1) // Anvil
    expect(da.dp3).toBe(1) // Gladius
    // combos: 1 (3pt) + 1×2 (2+1) + C(2,3)=0 = 3
    expect(da.combosStrikeForce).toBe(3)
  })

  test('faction filter chapter-expands (DA sees SM detachments AND blocks BA-only)', async () => {
    const bucket = fakeBucket(smNodes)
    const r = await count(bucket, {
      category: 'detachment',
      faction: 'dark-angels',
      includePool: true,
    })
    const titles = r.pool!.map((p) => p.title).sort()
    // BA-only "Red Fury" must NOT appear
    expect(titles).not.toContain('Red Fury')
    // But all SM detachments should
    expect(titles).toContain('Gladius')
    expect(titles).toContain('Anvil')
    expect(titles).toContain('Librarius')
    expect(titles).toContain('Dark Age Arsenal')
  })

  test('keyword filter matches ability tags case-insensitively', async () => {
    const bucket = fakeBucket(smNodes)
    const r = await count(bucket, {
      category: 'datasheet',
      keyword: 'SUSTAINED HITS',
      faction: 'dark-angels',
    })
    // Intercessor (SM, sustained hits) — accessible to DA via chapter expansion
    expect(r.count).toBe(1)
  })

  test('keyword deep strike matches multiple units across the SM family for DA', async () => {
    const bucket = fakeBucket(smNodes)
    const r = await count(bucket, {
      category: 'datasheet',
      keyword: 'deep strike',
      faction: 'dark-angels',
    })
    // Terminator (SM, deep strike) + Deathwing Knights (DA, deep strike) = 2
    expect(r.count).toBe(2)
  })

  test('group=faction returns per-faction rows for detachment queries (via rollup)', async () => {
    const bucket = fakeBucket(smNodes)
    const r = await count(bucket, {
      category: 'detachment',
      edition: '11th',
      group: 'faction',
    })
    expect(r.groups).toBeDefined()
    const daRow = r.groups!.find((g) => g.factionId === 'dark-angels')
    expect(daRow).toBeDefined()
    expect(daRow!.count).toBe(4)
    expect(daRow!.combosStrikeForce).toBe(3)
  })

  test('cubeVersion mirrors manifest hash', async () => {
    const bucket = fakeBucket(smNodes)
    const r = await count(bucket, { category: 'detachment' })
    expect(r.cubeVersion).toBe('test-cube-v1')
  })

  test('countCacheKey is stable across equal queries', () => {
    const a = countCacheKey({ category: 'detachment', faction: 'orks', keyword: 'MoB Rule' }, 'v1')
    const b = countCacheKey({ category: 'detachment', faction: 'orks', keyword: 'mob rule' }, 'v1')
    expect(a).toBe(b)
    const c = countCacheKey({ category: 'detachment', faction: 'orks' }, 'v1')
    expect(a).not.toBe(c)
  })

  test('countCacheKey rolls over when cube version changes', () => {
    const q = { category: 'detachment', faction: 'orks' }
    expect(countCacheKey(q, 'v1')).not.toBe(countCacheKey(q, 'v2'))
  })
})

describe('countCached', () => {
  beforeEach(() => resetCubeCache())

  test('first call computes + writes cache; second call reads cache', async () => {
    const bucket = fakeBucket(smNodes)
    const q = { category: 'detachment', faction: 'dark-angels' }
    const r1 = await countCached(bucket, q)
    expect(r1.count).toBe(4)
    expect(bucket.puts).toHaveLength(1)
    expect(bucket.puts[0]).toContain('cache/count/test-cube-v1/')

    const r2 = await countCached(bucket, q)
    expect(r2.count).toBe(4)
    // No new put — we read from cache.
    expect(bucket.puts).toHaveLength(1)
  })
})
