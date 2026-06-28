/**
 * Worker-level tests for the switchable edition filter on the browse endpoints.
 * Focused on the 404 + X-Available-Editions header path that lives in worker.ts
 * (not in the retrieve/edition libs). Retrieval-pipeline behaviour is covered
 * in src/lib/retrieve.test.ts and src/lib/edition.test.ts.
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

function makeEnv(nodes: Node[], opts: { defaultEdition?: string } = {}) {
  return {
    BRAIN_BUCKET: makeBucket({
      'manifest.json': { files: { 'nodes/test.json': 'v1' } },
      'nodes/test.json': nodes,
    }),
    BRAIN_INDEX: {} as VectorizeIndex,
    AI: {} as Ai,
    BRAIN_DEFAULT_EDITION: opts.defaultEdition,
  }
}

describe('GET /browse/unit/:id with edition filter', () => {
  beforeEach(() => {
    resetManifestCache()
    resetWorkerCaches()
  })

  it('returns the 11e datasheet when edition=11th', async () => {
    const ds10 = baseNode({
      id: 'datasheet:warriors',
      title: 'Necron Warriors',
      edition: '10th',
      sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
    })
    const ds11 = baseNode({
      id: 'datasheet:warriors',
      title: 'Necron Warriors',
      edition: '11th',
    })
    const env = makeEnv([ds10, ds11])

    const res = await app.request('/browse/unit/datasheet:warriors?edition=11th', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { datasheet: Node; edition: string }
    expect(json.datasheet.edition).toBe('11th')
    expect(json.edition).toBe('11th')
  })

  it('returns 404 with X-Available-Editions when requested edition is missing', async () => {
    const ds10 = baseNode({
      id: 'datasheet:old-only',
      title: 'Old Only',
      edition: '10th',
      sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
    })
    const env = makeEnv([ds10])

    const res = await app.request('/browse/unit/datasheet:old-only?edition=11th', {}, env)
    expect(res.status).toBe(404)
    expect(res.headers.get('X-Available-Editions')).toBe('10th')
    const json = (await res.json()) as { error: string; available: string[] }
    expect(json.error).toMatch(/not found/i)
    expect(json.available).toEqual(['10th'])
  })

  it('falls back to default edition from BRAIN_DEFAULT_EDITION env var', async () => {
    const ds10 = baseNode({
      id: 'datasheet:both',
      title: 'Both',
      edition: '10th',
      sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
    })
    const ds11 = baseNode({
      id: 'datasheet:both',
      title: 'Both',
      edition: '11th',
    })
    const env = makeEnv([ds10, ds11], { defaultEdition: '10th' })

    const res = await app.request('/browse/unit/datasheet:both', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { datasheet: Node; edition: string }
    expect(json.datasheet.edition).toBe('10th')
    expect(json.edition).toBe('10th')
  })

  it('returns both editions when edition=any (default when env unset)', async () => {
    const ds10 = baseNode({
      id: 'datasheet:both',
      title: 'Both',
      edition: '10th',
      sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
    })
    const ds11 = baseNode({
      id: 'datasheet:both',
      title: 'Both',
      edition: '11th',
    })
    const env = makeEnv([ds10, ds11])

    const res = await app.request('/browse/unit/datasheet:both', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { datasheet: Node; edition: string }
    expect(json.edition).toBe('any')
    // First match wins for 'any' — both are eligible, returning either is fine
    expect(['10th', '11th']).toContain(json.datasheet.edition)
  })
})

describe('GET /browse/detachment/:id with edition filter', () => {
  beforeEach(() => {
    resetManifestCache()
    resetWorkerCaches()
  })

  it('returns 404 + hint header when detachment exists only in another edition', async () => {
    const det = baseNode({
      id: 'detachment:gladius',
      category: 'detachment-rule',
      title: 'Gladius Task Force',
      edition: '10th',
      sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
    })
    const env = makeEnv([det])

    const res = await app.request('/browse/detachment/detachment:gladius?edition=11th', {}, env)
    expect(res.status).toBe(404)
    expect(res.headers.get('X-Available-Editions')).toBe('10th')
  })
})

describe('GET /browse/nodes with edition filter', () => {
  beforeEach(() => {
    resetManifestCache()
    resetWorkerCaches()
  })

  it('returns only matching-edition nodes', async () => {
    const ds10 = baseNode({
      id: 'datasheet:a',
      title: 'A',
      edition: '10th',
      sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
    })
    const ds11 = baseNode({
      id: 'datasheet:b',
      title: 'B',
      edition: '11th',
    })
    const env = makeEnv([ds10, ds11])

    const res = await app.request('/browse/nodes?layer=units&edition=11th', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: Node[]; edition: string }
    const ids = json.nodes.map((n) => n.id)
    expect(ids).toContain('datasheet:b')
    expect(ids).not.toContain('datasheet:a')
    expect(json.edition).toBe('11th')
  })
})
