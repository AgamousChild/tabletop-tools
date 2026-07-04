/**
 * Worker-level tests for the browse endpoints — PR E of the scalar-to-ref
 * refactor plan (docs/superpowers/plans/2026-07-03-scalar-to-ref-refactor.md).
 *
 * Covers three UI-visible symptoms from the 2026-07-03 QA sweep:
 *   1. Factions layer previously surfaced tactics/rulings/detachment-rules
 *      because `?layer=faction` (singular) fell through to a NodeLayer filter.
 *      Category-filter browse now keys off NodeCategory alone.
 *   2. Sidebar `/browse/layers` counts diverged 2x from `/browse/nodes`
 *      layer-view counts because the sidebar was edition-agnostic while the
 *      layer view respected `?edition=`. Same edition filter applies to both.
 *   3. Duplicate faction badges (`DEATH GUARD DEATH GUARD`) are covered on
 *      the client side; see BrainScreen.test.tsx and UnitCard.test.tsx.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { resetManifestCache } from './lib/fetch-nodes'
import type { Node } from './lib/model'
import { app, resetWorkerCaches } from './worker'

const baseNode = (overrides: Partial<Node>): Node => ({
  id: 'test',
  layer: 'unit',
  category: 'datasheet',
  title: 'Test',
  content: 'content',
  summary: 'summary',
  sources: [{ type: 'bsdata', title: 'BSData', retrievedAt: '2026-01-01' }],
  refs: [],
  version: 1,
  keywords: [],
  edition: '11th',
  ...overrides,
})

interface FakeR2Object {
  json: <T>() => Promise<T>
  text: () => Promise<string>
}

function makeBucket(files: Record<string, unknown>): R2Bucket {
  return {
    get: async (key: string): Promise<FakeR2Object | null> => {
      const data = files[key]
      if (data === undefined) return null
      return {
        json: async <T>() => data as T,
        text: async () => JSON.stringify(data),
      }
    },
  } as unknown as R2Bucket
}

function makeEnv(nodes: Node[]) {
  return {
    BRAIN_BUCKET: makeBucket({
      'manifest.json': { files: { 'nodes/test.json': 'v1' } },
      'nodes/test.json': nodes,
    }),
    BRAIN_INDEX: {} as VectorizeIndex,
    AI: {} as Ai,
  }
}

describe('GET /browse/nodes?layer=... — category filter (Bug 1)', () => {
  beforeEach(() => {
    resetManifestCache()
    resetWorkerCaches()
  })

  it('layer=factions returns only category:faction nodes — no tactics/rulings/detachment-rules', async () => {
    const nodes = [
      baseNode({
        id: 'faction-root:space-marines',
        layer: 'faction',
        category: 'faction',
        title: 'Space Marines',
        factionId: 'space-marines',
      }),
      baseNode({
        id: 'faction-root:orks',
        layer: 'faction',
        category: 'faction',
        title: 'Orks',
        factionId: 'orks',
      }),
      // These live on layer:faction but are NOT the Factions category. They
      // must NOT surface in the Factions browse layer.
      baseNode({
        id: 'det:gladius',
        layer: 'faction',
        category: 'detachment-rule',
        title: 'Gladius Task Force',
        factionId: 'space-marines',
      }),
      baseNode({
        id: 'strat:oath',
        layer: 'faction',
        category: 'stratagem',
        title: 'Oath of Moment',
        factionId: 'space-marines',
      }),
      baseNode({
        id: 'community:tactic:x',
        layer: 'community',
        category: 'tactic',
        title: 'Some Tactic',
      }),
      baseNode({
        id: 'community:ruling:y',
        layer: 'community',
        category: 'ruling',
        title: 'Some Ruling',
      }),
    ]
    const env = makeEnv(nodes)

    const res = await app.request('/browse/nodes?layer=factions&edition=11th', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: Node[]; total: number }
    const cats = json.nodes.map((n) => n.category)
    expect(cats.every((c) => c === 'faction')).toBe(true)
    expect(json.total).toBe(2)
  })

  it('layer=faction (singular alias) returns the same faction nodes', async () => {
    // Regression: before PR E, `layer=faction` fell through to
    // `n.layer === 'faction'` — which returned every stratagem, enhancement,
    // detachment-rule etc. that lives on the faction layer, not the faction
    // records themselves.
    const nodes = [
      baseNode({
        id: 'faction-root:orks',
        layer: 'faction',
        category: 'faction',
        title: 'Orks',
        factionId: 'orks',
      }),
      baseNode({
        id: 'det:gladius',
        layer: 'faction',
        category: 'detachment-rule',
        title: 'Gladius',
        factionId: 'space-marines',
      }),
    ]
    const env = makeEnv(nodes)

    const res = await app.request('/browse/nodes?layer=faction&edition=11th', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: Node[]; total: number }
    expect(json.total).toBe(1)
    expect(json.nodes[0]!.category).toBe('faction')
  })

  it('unknown layer returns 400 rather than a NodeLayer-shaped false positive', async () => {
    const env = makeEnv([baseNode({ id: 'ds:x' })])
    const res = await app.request('/browse/nodes?layer=totally-not-a-thing', {}, env)
    expect(res.status).toBe(400)
  })
})

describe('GET /browse/layers — sidebar counts share the edition filter (Bug 2)', () => {
  beforeEach(() => {
    resetManifestCache()
    resetWorkerCaches()
  })

  it('counts respect ?edition= so sidebar and layer view agree', async () => {
    // Two Units nodes: one 11e, one 10e. Under `?edition=11th` the sidebar
    // count for Units must be 1 (matching the layer view), not 2.
    const nodes = [
      baseNode({
        id: 'ds:a',
        title: 'A',
        edition: '11th',
      }),
      baseNode({
        id: 'ds:b',
        title: 'B',
        edition: '10th',
        sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
      }),
    ]
    const env = makeEnv(nodes)

    const [sidebarRes, layerRes] = await Promise.all([
      app.request('/browse/layers?edition=11th', {}, env),
      app.request('/browse/nodes?layer=units&edition=11th', {}, env),
    ])

    expect(sidebarRes.status).toBe(200)
    expect(layerRes.status).toBe(200)
    const sidebar = (await sidebarRes.json()) as {
      layers: Array<{ id: string; count: number }>
      edition: string
    }
    const layer = (await layerRes.json()) as { total: number }

    const units = sidebar.layers.find((l) => l.id === 'units')
    expect(units).toBeDefined()
    expect(units!.count).toBe(1)
    expect(units!.count).toBe(layer.total)
    expect(sidebar.edition).toBe('11th')
  })

  it('counts drop non-matching edition nodes across edition-varying categories', async () => {
    // Datasheets vary by edition — a 10e datasheet must drop under ?edition=11th.
    // Faction records (see the dedicated block below) are edition-agnostic and
    // survive the filter, so this test uses datasheets to prove the drop path.
    const nodes = [
      baseNode({
        id: 'ds:a',
        title: 'A',
        edition: '11th',
      }),
      baseNode({
        id: 'ds:b',
        title: 'B',
        edition: '10th',
        sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
      }),
    ]
    const env = makeEnv(nodes)

    const res = await app.request('/browse/layers?edition=11th', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { layers: Array<{ id: string; count: number }> }
    const units = json.layers.find((l) => l.id === 'units')
    expect(units).toBeDefined()
    expect(units!.count).toBe(1)
  })

  it('edition=any (default when env unset) keeps the pre-PR-E total', async () => {
    const nodes = [
      baseNode({ id: 'ds:a', edition: '11th' }),
      baseNode({
        id: 'ds:b',
        edition: '10th',
        sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
      }),
    ]
    const env = makeEnv(nodes)

    const res = await app.request('/browse/layers', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      layers: Array<{ id: string; count: number }>
      edition: string
    }
    const units = json.layers.find((l) => l.id === 'units')
    expect(units!.count).toBe(2)
    expect(json.edition).toBe('any')
  })
})

describe('Factions are edition-agnostic — never dropped by ?edition= filter', () => {
  beforeEach(() => {
    resetManifestCache()
    resetWorkerCaches()
  })

  const factionNodes = (): Node[] => {
    const ids = [
      'space-marines',
      'orks',
      'aeldari',
      'chaos-daemons',
      'chaos-space-marines',
      'death-guard',
      'thousand-sons',
      'world-eaters',
      'emperors-children',
      'necrons',
      'tyranids',
      'genestealer-cults',
      'tau-empire',
      'imperial-guard',
      'imperial-knights',
      'chaos-knights',
      'grey-knights',
      'adeptus-custodes',
      'adeptus-mechanicus',
      'adeptus-sororitas',
      'agents-of-the-imperium',
      'leagues-of-votann',
      'blood-angels',
      'dark-angels',
      'space-wolves',
      'deathwatch',
      'black-templars',
      'iron-hands',
      'ultramarines',
      'salamanders',
    ]
    // Emulate the current build output: faction nodes carry `edition: '10th'`.
    // The category-based bypass in nodeMatchesEdition must let them through
    // regardless of the requested edition.
    return ids.map((fid) =>
      baseNode({
        id: `faction-root:${fid}`,
        layer: 'faction',
        category: 'faction',
        title: fid.replace(/-/g, ' ').toUpperCase(),
        factionId: fid,
        edition: '10th',
      }),
    )
  }

  it('/browse/layers?edition=11th includes the factions layer with all 30 entries', async () => {
    const env = makeEnv(factionNodes())

    const res = await app.request('/browse/layers?edition=11th', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      layers: Array<{ id: string; count: number }>
      edition: string
    }
    const factions = json.layers.find((l) => l.id === 'factions')
    expect(factions).toBeDefined()
    expect(factions!.count).toBe(30)
    expect(json.edition).toBe('11th')
  })

  it('/browse/nodes?layer=faction&edition=11th returns all 30 faction records', async () => {
    const env = makeEnv(factionNodes())

    const res = await app.request('/browse/nodes?layer=faction&edition=11th', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: Node[]; total: number }
    expect(json.total).toBe(30)
  })

  it('/browse/nodes?layer=faction&edition=10th ALSO returns all 30 faction records', async () => {
    // Even the legacy 10e view must retain the faction browse layer — the
    // faction identity is invariant across editions.
    const env = makeEnv(factionNodes())

    const res = await app.request('/browse/nodes?layer=faction&edition=10th', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: Node[]; total: number }
    expect(json.total).toBe(30)
  })

  it('faction nodes with no edition tag also survive an 11e filter (data-fix path)', async () => {
    // Once build-graph stops stamping factions, the emitted nodes have
    // `edition: undefined`. The category bypass keeps them visible.
    const nodes = factionNodes().map((n) => ({ ...n, edition: undefined }))
    const env = makeEnv(nodes)

    const res = await app.request('/browse/nodes?layer=faction&edition=11th', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: Node[]; total: number }
    expect(json.total).toBe(30)
  })
})
