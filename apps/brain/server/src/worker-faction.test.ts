/**
 * Worker-level tests for the chapter → parent-faction expansion on browse.
 *
 * Covers /browse/nodes?faction= — the endpoint that a Blood Angels player hits
 * when filtering the Unit browse view. Post-PR-B, chapter datasheets moved to
 * factionId=<chapter-slug> and generic SM units (Rhino, Intercessor Squad)
 * stayed under factionId=space-marines. Without expansion, the Blood Angels
 * player only sees ~39 chapter datasheets and none of the ~500 shared units
 * they'd actually build with. See PR C of the scalar-to-ref refactor plan.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { resetSubfactionCache } from './lib/factions'
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

function makeEnv(nodes: Node[], subfactionRows: unknown[]) {
  return {
    BRAIN_BUCKET: makeBucket({
      'manifest.json': { files: { 'nodes/test.json': 'v1', 'dim/subfactions.json': 'v1' } },
      'nodes/test.json': nodes,
      'dim/subfactions.json': subfactionRows,
    }),
    BRAIN_INDEX: {} as VectorizeIndex,
    AI: {} as Ai,
  }
}

const smChapterRows = [
  { id: 'blood-angels', name: 'Blood Angels', factionId: 'space-marines' },
  { id: 'dark-angels', name: 'Dark Angels', factionId: 'space-marines' },
  { id: 'space-wolves', name: 'Space Wolves', factionId: 'space-marines' },
  { id: 'black-templars', name: 'Black Templars', factionId: 'space-marines' },
  { id: 'deathwatch', name: 'Deathwatch', factionId: 'space-marines' },
]

describe('GET /browse/nodes?faction= — chapter expansion', () => {
  beforeEach(() => {
    resetManifestCache()
    resetWorkerCaches()
    resetSubfactionCache()
  })

  it('Blood Angels browse includes BOTH chapter datasheets AND shared SM units (the fix)', async () => {
    const nodes = [
      baseNode({ id: 'ds:lemartes', title: 'Lemartes', factionId: 'blood-angels' }),
      baseNode({ id: 'ds:sanguinary-guard', title: 'Sanguinary Guard', factionId: 'blood-angels' }),
      baseNode({ id: 'ds:rhino', title: 'Rhino', factionId: 'space-marines' }),
      baseNode({
        id: 'ds:intercessor-squad',
        title: 'Intercessor Squad',
        factionId: 'space-marines',
      }),
      baseNode({ id: 'ds:ork-boyz', title: 'Ork Boyz', factionId: 'orks' }),
    ]
    const env = makeEnv(nodes, smChapterRows)

    const res = await app.request('/browse/nodes?layer=units&faction=blood-angels', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: Node[]; total: number }
    const titles = json.nodes.map((n) => n.title).sort()

    // Chapter-specific + shared SM units are all present
    expect(titles).toContain('Lemartes')
    expect(titles).toContain('Sanguinary Guard')
    expect(titles).toContain('Rhino')
    expect(titles).toContain('Intercessor Squad')
    // Other factions are excluded
    expect(titles).not.toContain('Ork Boyz')
    expect(json.total).toBe(4)
  })

  it('Orks browse stays scoped to orks — no expansion for non-chapter factions', async () => {
    const nodes = [
      baseNode({ id: 'ds:ork-boyz', title: 'Ork Boyz', factionId: 'orks' }),
      baseNode({ id: 'ds:warboss', title: 'Warboss', factionId: 'orks' }),
      baseNode({ id: 'ds:rhino', title: 'Rhino', factionId: 'space-marines' }),
      baseNode({ id: 'ds:lemartes', title: 'Lemartes', factionId: 'blood-angels' }),
    ]
    const env = makeEnv(nodes, smChapterRows)

    const res = await app.request('/browse/nodes?layer=units&faction=orks', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: Node[]; total: number }
    const titles = json.nodes.map((n) => n.title).sort()

    expect(titles).toContain('Ork Boyz')
    expect(titles).toContain('Warboss')
    expect(titles).not.toContain('Rhino')
    expect(titles).not.toContain('Lemartes')
    expect(json.total).toBe(2)
  })

  it('unknown factionId returns just that faction (no expansion, no crash)', async () => {
    const nodes = [
      baseNode({ id: 'ds:rhino', title: 'Rhino', factionId: 'space-marines' }),
      baseNode({ id: 'ds:mystery', title: 'Mystery Unit', factionId: 'not-a-real-faction' }),
    ]
    const env = makeEnv(nodes, smChapterRows)

    const res = await app.request('/browse/nodes?layer=units&faction=not-a-real-faction', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: Node[]; total: number }
    expect(json.total).toBe(1)
    expect(json.nodes[0].title).toBe('Mystery Unit')
  })

  it('no faction param → no filter (existing behavior preserved)', async () => {
    const nodes = [
      baseNode({ id: 'ds:rhino', title: 'Rhino', factionId: 'space-marines' }),
      baseNode({ id: 'ds:ork-boyz', title: 'Ork Boyz', factionId: 'orks' }),
    ]
    const env = makeEnv(nodes, smChapterRows)

    const res = await app.request('/browse/nodes?layer=units', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: Node[]; total: number }
    expect(json.total).toBe(2)
  })

  it('chapter expansion respects the edition filter', async () => {
    const nodes = [
      baseNode({
        id: 'ds:lemartes',
        title: 'Lemartes',
        factionId: 'blood-angels',
        edition: '11th',
      }),
      baseNode({
        id: 'ds:rhino-11',
        title: 'Rhino',
        factionId: 'space-marines',
        edition: '11th',
      }),
      baseNode({
        id: 'ds:rhino-10',
        title: 'Rhino (10e)',
        factionId: 'space-marines',
        edition: '10th',
        sources: [{ type: 'wahapedia', title: 'Wahapedia', retrievedAt: '2026-01-01' }],
      }),
    ]
    const env = makeEnv(nodes, smChapterRows)

    const res = await app.request(
      '/browse/nodes?layer=units&faction=blood-angels&edition=11th',
      {},
      env,
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { nodes: Node[] }
    const titles = json.nodes.map((n) => n.title)
    expect(titles).toContain('Lemartes')
    expect(titles).toContain('Rhino')
    expect(titles).not.toContain('Rhino (10e)')
  })
})
