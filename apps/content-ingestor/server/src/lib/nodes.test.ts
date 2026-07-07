import { describe, expect, it, vi } from 'vitest'

import type { ExtractedNode } from './extract'
import { writeNodesToBrain } from './nodes'

interface MockR2PutOptions {
  onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string }
}

/**
 * In-memory R2 bucket mock that tracks a fake etag per key and honours
 * `onlyIf.etagMatches` conditional-write semantics: `put` returns `null`
 * (mirroring the real R2Object|null return) when the caller's etag doesn't
 * match current state, and bumps the etag on every successful write.
 */
function mockR2Bucket(existing: unknown[] = []) {
  const stored = new Map<string, string>()
  const etags = new Map<string, string>()
  let etagCounter = 0

  function setWithEtag(key: string, value: string): string {
    etagCounter += 1
    const etag = `etag-${etagCounter}`
    stored.set(key, value)
    etags.set(key, etag)
    return etag
  }

  setWithEtag('nodes/community.json', JSON.stringify(existing))
  setWithEtag('manifest.json', JSON.stringify({ files: {} }))

  return {
    get: vi.fn(async (key: string) => {
      const val = stored.get(key)
      if (val === undefined) return null
      return { json: async () => JSON.parse(val), etag: etags.get(key) }
    }),
    put: vi.fn(async (key: string, value: string, options?: MockR2PutOptions) => {
      const currentEtag = etags.get(key)
      if (options?.onlyIf?.etagMatches !== undefined) {
        if (options.onlyIf.etagMatches !== currentEtag) return null
      }
      const etag = setWithEtag(key, value)
      return { etag }
    }),
    _stored: stored,
    _etags: etags,
  }
}

function mockVectorize() {
  return {
    upsert: vi.fn(async () => {}),
  }
}

function mockAi() {
  return {
    run: vi.fn(async (_model: string, input: { text: string[] }) => ({
      data: input.text.map(() => Array.from({ length: 768 }).fill(0.1)),
    })),
  }
}

const sampleNodes: ExtractedNode[] = [
  {
    title: 'Gladius Task Force',
    category: 'detachment',
    content: 'The Gladius Task Force detachment ability...',
    summary: 'Space Marines primary detachment',
    keywords: ['space marines', 'gladius', 'detachment'],
    factionId: 'space-marines',
    edition: '11th',
  },
  {
    title: 'Oath of Moment',
    category: 'army-rule',
    content: 'At the start of your Command phase, select one enemy unit...',
    summary: 'Space Marines army rule for re-rolls',
    keywords: ['space marines', 'oath', 'reroll'],
    factionId: 'space-marines',
    edition: '11th',
  },
]

describe('writeNodesToBrain', () => {
  it('writes new nodes to R2 and indexes in Vectorize', async () => {
    const bucket = mockR2Bucket()
    const vectorize = mockVectorize()
    const ai = mockAi()

    const result = await writeNodesToBrain({
      nodes: sampleNodes,
      sourceUrl: 'https://youtube.com/watch?v=abc',
      sourceName: 'Auspex Tactics',
      bucket: bucket as any,
      vectorize: vectorize as any,
      ai: ai as any,
    })

    expect(result.written).toBe(2)
    expect(bucket.put).toHaveBeenCalledWith(
      'nodes/community.json',
      expect.any(String),
      expect.anything(),
    )
    expect(bucket.put).toHaveBeenCalledWith('manifest.json', expect.any(String), expect.anything())
    expect(ai.run).toHaveBeenCalled()
    expect(vectorize.upsert).toHaveBeenCalled()

    const written = JSON.parse(bucket._stored.get('nodes/community.json')!)
    expect(written).toHaveLength(2)
    expect(written[0].id).toBe('community:gladius-task-force')
    expect(written[0].layer).toBe('community')
    expect(written[0].sources[0].type).toBe('youtube')
  })

  it('deduplicates against existing nodes', async () => {
    const existing = [
      { id: 'community:gladius-task-force', title: 'Gladius Task Force', layer: 'community' },
    ]
    const bucket = mockR2Bucket(existing)
    const vectorize = mockVectorize()
    const ai = mockAi()

    const result = await writeNodesToBrain({
      nodes: sampleNodes,
      sourceUrl: 'https://youtube.com/watch?v=abc',
      sourceName: 'Auspex',
      bucket: bucket as any,
      vectorize: vectorize as any,
      ai: ai as any,
    })

    expect(result.written).toBe(1) // Only Oath of Moment, Gladius already exists
    const written = JSON.parse(bucket._stored.get('nodes/community.json')!)
    expect(written).toHaveLength(2) // 1 existing + 1 new
  })

  it("defaults edition to '11th' when LLM omits it (CLAUDE.md Rule 5)", async () => {
    const untaggedNode: ExtractedNode = {
      title: 'Precision Attack Timing',
      category: 'tactic',
      content: 'Precision attacks resolve before character look-out-sirs...',
      summary: 'Tactical note on attack ordering.',
      keywords: ['precision', 'character', 'attack'],
      // factionId and edition deliberately omitted — simulates LLM output
    }
    const bucket = mockR2Bucket()
    const vectorize = mockVectorize()
    const ai = mockAi()

    await writeNodesToBrain({
      nodes: [untaggedNode],
      sourceUrl: 'https://example.com',
      sourceName: 'Test',
      bucket: bucket as any,
      vectorize: vectorize as any,
      ai: ai as any,
    })

    const written = JSON.parse(bucket._stored.get('nodes/community.json')!)
    expect(written).toHaveLength(1)
    expect(written[0].edition).toBe('11th')
    expect(written[0].factionId).toBeUndefined()
  })

  it('returns 0 when all nodes are duplicates', async () => {
    const existing = [{ id: 'community:gladius-task-force' }, { id: 'community:oath-of-moment' }]
    const bucket = mockR2Bucket(existing)
    const vectorize = mockVectorize()
    const ai = mockAi()

    const result = await writeNodesToBrain({
      nodes: sampleNodes,
      sourceUrl: 'https://example.com',
      sourceName: 'Test',
      bucket: bucket as any,
      vectorize: vectorize as any,
      ai: ai as any,
    })

    expect(result.written).toBe(0)
    expect(vectorize.upsert).not.toHaveBeenCalled()
  })

  it('retries on R2 conditional-write conflict so a concurrent writer is not clobbered', async () => {
    // Simulates two writers racing: writer B (the cron batch) commits its node
    // to R2 in between writer A's `get` and `put`. Writer A's first `put` must
    // fail (etag mismatch), then A re-reads, re-merges, and retries — so BOTH
    // writers' nodes survive in the final state instead of B's write being
    // silently lost.
    const bucket = mockR2Bucket()
    const vectorize = mockVectorize()
    const ai = mockAi()

    const originalPut = bucket.put.getMockImplementation()!
    let putCallCount = 0
    bucket.put.mockImplementation(async (key: string, value: string, options?: any) => {
      putCallCount += 1
      // On writer A's first attempt at community.json, simulate writer B
      // slipping in a concurrent commit right before A's conditional put lands.
      if (key === 'nodes/community.json' && putCallCount === 1) {
        const concurrentNode = {
          id: 'community:concurrent-writer-b-node',
          title: 'Concurrent Writer B Node',
          layer: 'community',
        }
        const current = JSON.parse(bucket._stored.get('nodes/community.json')!)
        const merged = [...current, concurrentNode]
        // Directly mutate stored state + bump etag to simulate B's commit,
        // WITHOUT going through this mock's onlyIf check (B "wins" the race).
        bucket._stored.set('nodes/community.json', JSON.stringify(merged))
        bucket._etags.set('nodes/community.json', 'etag-from-writer-b')
        // Now attempt A's original conditional put — it should fail because
        // the etag A captured at `get`-time no longer matches.
        return originalPut(key, value, options)
      }
      return originalPut(key, value, options)
    })

    const result = await writeNodesToBrain({
      nodes: sampleNodes,
      sourceUrl: 'https://youtube.com/watch?v=abc',
      sourceName: 'Auspex Tactics',
      bucket: bucket as any,
      vectorize: vectorize as any,
      ai: ai as any,
    })

    expect(result.written).toBe(2)

    const finalNodes = JSON.parse(bucket._stored.get('nodes/community.json')!) as Array<{
      id: string
    }>
    const finalIds = finalNodes.map((n) => n.id)

    // Writer B's concurrently-committed node survived the retry...
    expect(finalIds).toContain('community:concurrent-writer-b-node')
    // ...alongside both of writer A's new nodes.
    expect(finalIds).toContain('community:gladius-task-force')
    expect(finalIds).toContain('community:oath-of-moment')
    expect(finalNodes).toHaveLength(3)

    // put was retried at least once for community.json (conflict then success)
    const communityPutCalls = bucket.put.mock.calls.filter(
      (call) => call[0] === 'nodes/community.json',
    )
    expect(communityPutCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('throws after exceeding the retry bound when conflicts never resolve', async () => {
    const bucket = mockR2Bucket()
    const vectorize = mockVectorize()
    const ai = mockAi()

    // Every put to community.json fails the conditional check, forever.
    bucket.put.mockImplementation(async (key: string, _value: string, options?: any) => {
      if (key === 'nodes/community.json' && options?.onlyIf?.etagMatches !== undefined) {
        return null
      }
      return { etag: 'irrelevant' }
    })

    await expect(
      writeNodesToBrain({
        nodes: sampleNodes,
        sourceUrl: 'https://youtube.com/watch?v=abc',
        sourceName: 'Auspex Tactics',
        bucket: bucket as any,
        vectorize: vectorize as any,
        ai: ai as any,
      }),
    ).rejects.toThrow()
  })
})
