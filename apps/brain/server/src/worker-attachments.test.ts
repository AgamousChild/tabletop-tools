/**
 * Worker-level tests for the leaders[] / support[] arrays attached to
 * /browse/unit/:id responses. The route walks the forward + reverse refs
 * indexes for can_lead and can_support and surfaces them as resolved
 * { id, title, factionId } chips on the unit endpoint.
 *
 * Character datasheets get forward refs (this character → unit).
 * Non-character datasheets get reverse refs (character → this unit).
 *
 * All fixtures are synthetic — no GW content.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { resetCrossRefCache } from './lib/cross-refs'
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

function makeEnv(nodes: Node[], refs: { fwd?: unknown; rev?: unknown } = {}) {
  return {
    BRAIN_BUCKET: makeBucket({
      'manifest.json': { files: { 'nodes/test.json': 'v1' } },
      'nodes/test.json': nodes,
      'refs/forward-index.json': refs.fwd ?? {},
      'refs/reverse-index.json': refs.rev ?? {},
    }),
    BRAIN_INDEX: {} as VectorizeIndex,
    AI: {} as Ai,
  }
}

interface UnitResponse {
  datasheet: Node
  leaders: Array<{ id: string; title: string; factionId?: string }>
  support: Array<{ id: string; title: string; factionId?: string }>
}

describe('GET /browse/unit/:id — leaders[] + support[] attachments', () => {
  beforeEach(() => {
    resetManifestCache()
    resetWorkerCaches()
    resetCrossRefCache()
  })

  it('character datasheet — leaders[] resolved from forward can_lead refs', async () => {
    const captain = baseNode({
      id: 'datasheet:cap',
      title: 'Captain (synthetic)',
      keywords: ['character', 'infantry'],
    })
    const squadA = baseNode({
      id: 'datasheet:squad-a',
      title: 'Squad Alpha',
      factionId: 'fake-faction',
    })
    const squadB = baseNode({
      id: 'datasheet:squad-b',
      title: 'Squad Beta',
      factionId: 'fake-faction',
    })

    const fwd = {
      'datasheet:cap': [
        { targetId: 'datasheet:squad-a', rel: 'can_lead', context: 'leads' },
        { targetId: 'datasheet:squad-b', rel: 'can_lead', context: 'leads' },
      ],
    }
    const env = makeEnv([captain, squadA, squadB], { fwd })

    const res = await app.request('/browse/unit/datasheet:cap', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as UnitResponse
    const ids = json.leaders.map((l) => l.id).sort()
    expect(ids).toEqual(['datasheet:squad-a', 'datasheet:squad-b'])
    const titles = json.leaders.map((l) => l.title).sort()
    expect(titles).toEqual(['Squad Alpha', 'Squad Beta'])
    expect(json.support).toEqual([])
  })

  it('character datasheet — support[] resolved from forward can_support refs', async () => {
    const lieutenant = baseNode({
      id: 'datasheet:lt',
      title: 'Lieutenant (synthetic)',
      keywords: ['character'],
    })
    const tanks = baseNode({
      id: 'datasheet:tanks',
      title: 'Tank Squadron',
    })

    const fwd = {
      'datasheet:lt': [{ targetId: 'datasheet:tanks', rel: 'can_support', context: 'supports' }],
    }
    const env = makeEnv([lieutenant, tanks], { fwd })

    const res = await app.request('/browse/unit/datasheet:lt', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as UnitResponse
    expect(json.leaders).toEqual([])
    expect(json.support).toEqual([{ id: 'datasheet:tanks', title: 'Tank Squadron' }])
  })

  it('non-character datasheet — leaders[] resolved from reverse can_lead refs', async () => {
    const squad = baseNode({
      id: 'datasheet:squad',
      title: 'Test Squad',
      keywords: ['infantry'],
    })
    const captain = baseNode({
      id: 'datasheet:cap',
      title: 'Captain Synth',
      factionId: 'fake-faction',
    })
    const chaplain = baseNode({
      id: 'datasheet:chap',
      title: 'Chaplain Synth',
      factionId: 'fake-faction',
    })

    const rev = {
      'datasheet:squad': [
        { sourceId: 'datasheet:cap', rel: 'can_lead', context: 'leads' },
        { sourceId: 'datasheet:chap', rel: 'can_lead', context: 'leads' },
      ],
    }
    const env = makeEnv([squad, captain, chaplain], { rev })

    const res = await app.request('/browse/unit/datasheet:squad', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as UnitResponse
    const ids = json.leaders.map((l) => l.id).sort()
    expect(ids).toEqual(['datasheet:cap', 'datasheet:chap'])
    expect(json.support).toEqual([])
  })

  it('non-character datasheet — support[] resolved from reverse can_support refs', async () => {
    const tanks = baseNode({
      id: 'datasheet:tanks',
      title: 'Tanks Synth',
      keywords: ['vehicle'],
    })
    const lt = baseNode({
      id: 'datasheet:lt',
      title: 'Lieutenant Synth',
    })

    const rev = {
      'datasheet:tanks': [{ sourceId: 'datasheet:lt', rel: 'can_support', context: 'supports' }],
    }
    const env = makeEnv([tanks, lt], { rev })

    const res = await app.request('/browse/unit/datasheet:tanks', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as UnitResponse
    expect(json.leaders).toEqual([])
    expect(json.support).toEqual([{ id: 'datasheet:lt', title: 'Lieutenant Synth' }])
  })

  it('returns empty arrays when no attachments exist', async () => {
    const ds = baseNode({ id: 'datasheet:lone', title: 'Lone Synth' })
    const env = makeEnv([ds])

    const res = await app.request('/browse/unit/datasheet:lone', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as UnitResponse
    expect(json.leaders).toEqual([])
    expect(json.support).toEqual([])
  })

  it('skips can_lead/can_support entries whose target node is missing', async () => {
    const captain = baseNode({
      id: 'datasheet:cap',
      title: 'Captain Synth',
      keywords: ['character'],
    })
    // squad-a exists, squad-ghost does not.
    const squadA = baseNode({ id: 'datasheet:squad-a', title: 'Squad Alpha' })

    const fwd = {
      'datasheet:cap': [
        { targetId: 'datasheet:squad-a', rel: 'can_lead', context: '' },
        { targetId: 'datasheet:squad-ghost', rel: 'can_lead', context: '' },
      ],
    }
    const env = makeEnv([captain, squadA], { fwd })

    const res = await app.request('/browse/unit/datasheet:cap', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as UnitResponse
    expect(json.leaders.map((l) => l.id)).toEqual(['datasheet:squad-a'])
  })

  it('ignores refs of unrelated rel types', async () => {
    const captain = baseNode({
      id: 'datasheet:cap',
      title: 'Captain Synth',
      keywords: ['character'],
    })
    const squad = baseNode({ id: 'datasheet:squad', title: 'Squad' })

    const fwd = {
      'datasheet:cap': [
        { targetId: 'datasheet:squad', rel: 'interacts_with', context: '' },
        { targetId: 'datasheet:squad', rel: 'requires', context: '' },
      ],
    }
    const env = makeEnv([captain, squad], { fwd })

    const res = await app.request('/browse/unit/datasheet:cap', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as UnitResponse
    expect(json.leaders).toEqual([])
    expect(json.support).toEqual([])
  })

  it('deduplicates duplicate refs to the same target', async () => {
    const captain = baseNode({
      id: 'datasheet:cap',
      title: 'Captain Synth',
      keywords: ['character'],
    })
    const squad = baseNode({ id: 'datasheet:squad', title: 'Squad Synth' })

    const fwd = {
      'datasheet:cap': [
        { targetId: 'datasheet:squad', rel: 'can_lead', context: '' },
        { targetId: 'datasheet:squad', rel: 'can_lead', context: '' },
      ],
    }
    const env = makeEnv([captain, squad], { fwd })

    const res = await app.request('/browse/unit/datasheet:cap', {}, env)
    expect(res.status).toBe(200)
    const json = (await res.json()) as UnitResponse
    expect(json.leaders).toEqual([{ id: 'datasheet:squad', title: 'Squad Synth' }])
  })
})
