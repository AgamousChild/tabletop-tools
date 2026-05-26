import { describe, expect, it, vi } from 'vitest'

import type { ExtractedNode } from './extract'
import { writeNodesToBrain } from './nodes'

function mockR2Bucket(existing: unknown[] = []) {
  const stored = new Map<string, string>()
  stored.set('nodes/community.json', JSON.stringify(existing))
  stored.set('manifest.json', JSON.stringify({ files: {} }))

  return {
    get: vi.fn(async (key: string) => {
      const val = stored.get(key)
      if (!val) return null
      return { json: async () => JSON.parse(val) }
    }),
    put: vi.fn(async (key: string, value: string) => {
      stored.set(key, value)
    }),
    _stored: stored,
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
    expect(bucket.put).toHaveBeenCalledWith('nodes/community.json', expect.any(String))
    expect(bucket.put).toHaveBeenCalledWith('manifest.json', expect.any(String))
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
})
