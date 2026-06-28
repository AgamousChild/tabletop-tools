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

  it('preserves the rest of the metadata schema alongside edition', async () => {
    const node = baseNode({
      id: 'faction:necrons:rp',
      layer: 'faction',
      category: 'faction-ability',
      title: 'Reanimation Protocols',
      factionId: 'necrons',
      subfaction: 'sautekh',
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
    expect(meta.subfaction).toBe('sautekh')
    expect(meta.phase).toBe('command')
    expect(meta.edition).toBe('11th')
  })
})
