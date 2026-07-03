/**
 * Worker-level tests for the /index-vectors handler. Specifically verifies the
 * Vectorize upsert metadata includes `edition` so the new pre-filter in
 * retrieve.ts can shed candidates before R2 fetch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

function makeAi(): Ai {
  return {
    run: vi.fn(
      async (_model: string, opts: { text: string[] }) =>
        ({ data: opts.text.map(() => [0.1, 0.2, 0.3]) }) as { data: number[][] },
    ),
  } as unknown as Ai
}

function makeIndex(): { upsert: ReturnType<typeof vi.fn> } & VectorizeIndex {
  return {
    upsert: vi.fn(async () => undefined),
  } as unknown as { upsert: ReturnType<typeof vi.fn> } & VectorizeIndex
}

describe('POST /index-vectors metadata', () => {
  beforeEach(() => {
    resetManifestCache()
    resetWorkerCaches()
  })

  it('includes edition in upserted vector metadata for tagged nodes', async () => {
    const ds11 = baseNode({
      id: 'datasheet:warriors',
      title: 'Necron Warriors',
      edition: '11th',
    })
    const index = makeIndex()
    const env = {
      BRAIN_BUCKET: makeBucket({
        'manifest.json': { files: { 'nodes/test.json': 'v1' } },
        'nodes/test.json': [ds11],
      }),
      BRAIN_INDEX: index,
      AI: makeAi(),
    }

    const res = await app.request('/index-vectors', { method: 'POST' }, env)
    expect(res.status).toBe(200)

    expect(index.upsert).toHaveBeenCalledTimes(1)
    const upserted = index.upsert.mock.calls[0]![0] as Array<{
      id: string
      values: number[]
      metadata: Record<string, unknown>
    }>
    expect(upserted).toHaveLength(1)
    expect(upserted[0]!.metadata.edition).toBe('11th')
  })

  it('emits "unknown" sentinel for nodes with no edition tag', async () => {
    // Vectorize $eq is exact-match — a missing field never matches. The
    // sentinel keeps untagged nodes addressable by an explicit filter
    // (e.g. callers asking for `edition: 'unknown'` would still hit them).
    const untagged = baseNode({
      id: 'datasheet:legacy',
      title: 'Legacy',
      // no edition
    })
    const index = makeIndex()
    const env = {
      BRAIN_BUCKET: makeBucket({
        'manifest.json': { files: { 'nodes/test.json': 'v1' } },
        'nodes/test.json': [untagged],
      }),
      BRAIN_INDEX: index,
      AI: makeAi(),
    }

    const res = await app.request('/index-vectors', { method: 'POST' }, env)
    expect(res.status).toBe(200)

    const upserted = index.upsert.mock.calls[0]![0] as Array<{
      metadata: Record<string, unknown>
    }>
    expect(upserted[0]!.metadata.edition).toBe('unknown')
  })

  it('composes the datasheet embedding text from datasheet + ability + weapon bodies', async () => {
    // The datasheet-content-duplication fix strips ability + weapon bodies
    // from `datasheet.content` (stored on their own nodes instead). At index
    // time we re-attach them so semantic search still surfaces the datasheet
    // for ability-text queries like "twice per battle" or "sustained hits".
    const datasheet = baseNode({
      id: '11e:000000020',
      category: 'datasheet',
      title: 'Tankbustas',
      content: 'M T SV W LD OC: 6" 4 5+ 1 7+ 2\n\nABILITIES: Bomb Squigs',
      summary: 'Tankbustas — Battleline.',
      datasheetId: '11e:000000020',
      factionId: 'orks',
      edition: '11th',
      keywords: ['infantry'],
    })
    const ability = baseNode({
      id: '11e:ability:000000020:bomb-squigs',
      category: 'unit-ability',
      title: 'Bomb Squigs',
      content: 'Twice per battle, after this unit ends a Normal move...',
      summary: 'Bomb Squigs.',
      datasheetId: '11e:000000020',
      factionId: 'orks',
      edition: '11th',
      keywords: [],
    })
    const weapon = baseNode({
      id: '11e:weapon:000000020:tankbusta-bomb',
      category: 'weapon',
      title: 'Tankbusta bomb',
      content:
        '**Range:** 12 | **Type:** Ranged\n**A:** 1 | **BS/WS:** 5+ | **S:** 8 | **AP:** -1 | **D:** D6\n\nanti-vehicle 3+, one shot',
      summary: 'Tankbusta bomb (Ranged).',
      datasheetId: '11e:000000020',
      factionId: 'orks',
      edition: '11th',
      keywords: [],
    })

    const ai = makeAi()
    const env = {
      BRAIN_BUCKET: makeBucket({
        'manifest.json': { files: { 'nodes/test.json': 'v1' } },
        'nodes/test.json': [datasheet, ability, weapon],
      }),
      BRAIN_INDEX: makeIndex(),
      AI: ai,
    }

    const res = await app.request('/index-vectors', { method: 'POST' }, env)
    expect(res.status).toBe(200)

    // The AI.run mock captures the text-to-embed passed in. The datasheet's
    // corpus (batch index 0) must include the ability body and the weapon body.
    const aiRun = ai.run as unknown as ReturnType<typeof vi.fn>
    const textsPassed = aiRun.mock.calls[0]![1].text as string[]
    // Find the datasheet corpus by title.
    const dsCorpus = textsPassed.find((t) => t.startsWith('Tankbustas.'))
    expect(dsCorpus).toBeDefined()
    expect(dsCorpus).toMatch(/Twice per battle/) // ability body appended
    expect(dsCorpus).toMatch(/anti-vehicle/) // weapon body appended

    // Non-datasheet nodes use the pre-refactor formula (title + summary +
    // keywords), so the ability body should NOT be in the ability's own
    // corpus (its `summary` is short, its own content isn't the target).
    const abilityCorpus = textsPassed.find((t) => t.startsWith('Bomb Squigs.'))
    expect(abilityCorpus).toBeDefined()
    expect(abilityCorpus).not.toMatch(/Twice per battle/)
  })

  it('preserves the rest of the metadata schema alongside edition', async () => {
    const node = baseNode({
      id: 'faction:necrons:rp',
      layer: 'faction',
      category: 'faction-ability',
      title: 'Reanimation Protocols',
      factionId: 'necrons',
      phase: 'command',
      edition: '11th',
    })
    const index = makeIndex()
    const env = {
      BRAIN_BUCKET: makeBucket({
        'manifest.json': { files: { 'nodes/test.json': 'v1' } },
        'nodes/test.json': [node],
      }),
      BRAIN_INDEX: index,
      AI: makeAi(),
    }

    const res = await app.request('/index-vectors', { method: 'POST' }, env)
    expect(res.status).toBe(200)

    const upserted = index.upsert.mock.calls[0]![0] as Array<{
      metadata: Record<string, unknown>
    }>
    const meta = upserted[0]!.metadata
    expect(meta.originalId).toBe('faction:necrons:rp')
    expect(meta.title).toBe('Reanimation Protocols')
    expect(meta.layer).toBe('faction')
    expect(meta.category).toBe('faction-ability')
    expect(meta.factionId).toBe('necrons')
    expect(meta.phase).toBe('command')
    expect(meta.edition).toBe('11th')
  })
})
