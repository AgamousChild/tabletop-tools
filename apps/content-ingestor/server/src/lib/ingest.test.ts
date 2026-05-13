import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient } from '@libsql/client'
import { createDbFromClient, ingestJobs } from '@tabletop-tools/db'
import { eq } from 'drizzle-orm'
import type { Db } from '@tabletop-tools/db'

vi.mock('./gladia', () => ({
  submitTranscription: vi.fn(),
}))

vi.mock('./extract', () => ({
  extractNodes: vi.fn(),
}))

vi.mock('./nodes', () => ({
  writeNodesToBrain: vi.fn(),
}))

vi.mock('./html', () => ({
  fetchArticleText: vi.fn(),
}))

import { startYoutubeIngest, completeYoutubeIngest, ingestWebArticle } from './ingest'
import { submitTranscription } from './gladia'
import { extractNodes } from './extract'
import { writeNodesToBrain } from './nodes'
import { fetchArticleText } from './html'

const CREATE_TABLE = `
CREATE TABLE ingest_jobs (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_name TEXT,
  title TEXT,
  status TEXT DEFAULT 'pending' NOT NULL,
  gladia_job_id TEXT,
  transcript TEXT,
  nodes_extracted INTEGER DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
)`

function mockBucket() {
  const stored = new Map<string, string>()
  stored.set('nodes/community.json', '[]')
  stored.set('manifest.json', '{}')
  return {
    get: vi.fn(async (key: string) => {
      const val = stored.get(key)
      if (!val) return null
      return { json: async () => JSON.parse(val) }
    }),
    put: vi.fn(async (key: string, value: string) => {
      stored.set(key, value)
    }),
  }
}

function mockVectorize() {
  return { upsert: vi.fn(async () => {}) }
}

function mockAi() {
  return {
    run: vi.fn(async (_model: string, input: { text: string[] }) => ({
      data: input.text.map(() => new Array(768).fill(0.1)),
    })),
  }
}

let db: Db
let client: ReturnType<typeof createClient>

beforeEach(async () => {
  vi.clearAllMocks()
  client = createClient({ url: ':memory:' })
  await client.execute(CREATE_TABLE)
  db = createDbFromClient(client)
})

describe('startYoutubeIngest', () => {
  it('creates a job and calls Gladia', async () => {
    vi.mocked(submitTranscription).mockResolvedValue({ gladiaJobId: 'gladia-abc' })

    const result = await startYoutubeIngest({
      url: 'https://youtube.com/watch?v=test',
      sourceName: 'Auspex Tactics',
      callbackUrl: 'https://worker.example.com/ingest/callback',
      gladiaKey: 'test-key',
      db,
    })

    expect(result.jobId).toBeTruthy()
    expect(submitTranscription).toHaveBeenCalledOnce()

    const [job] = await db.select().from(ingestJobs).where(eq(ingestJobs.id, result.jobId))
    expect(job.status).toBe('transcribing')
    expect(job.gladiaJobId).toBe('gladia-abc')
    expect(job.sourceType).toBe('youtube')
    expect(job.sourceName).toBe('Auspex Tactics')
  })

  it('marks job as failed when Gladia errors', async () => {
    vi.mocked(submitTranscription).mockRejectedValue(new Error('Gladia API error 500: Internal'))

    await expect(
      startYoutubeIngest({
        url: 'https://youtube.com/watch?v=fail',
        callbackUrl: 'https://worker.example.com/callback',
        gladiaKey: 'test-key',
        db,
      }),
    ).rejects.toThrow('Gladia API error 500')

    const jobs = await db.select().from(ingestJobs)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].status).toBe('failed')
    expect(jobs[0].error).toContain('Gladia API error 500')
  })
})

describe('completeYoutubeIngest', () => {
  it('finds job, extracts nodes, and writes to brain', async () => {
    // Pre-create a job in transcribing state
    await db.insert(ingestJobs).values({
      id: 'job-1',
      url: 'https://youtube.com/watch?v=test',
      sourceType: 'youtube',
      sourceName: 'Test Channel',
      status: 'transcribing',
      gladiaJobId: 'gladia-xyz',
      createdAt: new Date(),
    })

    vi.mocked(extractNodes).mockResolvedValue([
      {
        title: 'Test Rule',
        category: 'tactic',
        content: 'Some content',
        summary: 'A summary',
        keywords: ['test'],
      },
    ])
    vi.mocked(writeNodesToBrain).mockResolvedValue({ written: 1 })

    const bucket = mockBucket()
    const vectorize = mockVectorize()
    const ai = mockAi()

    await completeYoutubeIngest({
      gladiaJobId: 'gladia-xyz',
      transcript: 'Full transcript text here',
      db,
      anthropicKey: 'test-anthropic-key',
      bucket: bucket as any,
      vectorize: vectorize as any,
      ai: ai as any,
    })

    expect(extractNodes).toHaveBeenCalledOnce()
    expect(writeNodesToBrain).toHaveBeenCalledOnce()

    const [job] = await db.select().from(ingestJobs).where(eq(ingestJobs.id, 'job-1'))
    expect(job.status).toBe('completed')
    expect(job.nodesExtracted).toBe(1)
    expect(job.transcript).toBe('Full transcript text here')
    expect(job.completedAt).toBeTruthy()
  })

  it('throws when no job found for gladiaJobId', async () => {
    await expect(
      completeYoutubeIngest({
        gladiaJobId: 'nonexistent',
        transcript: 'text',
        db,
        anthropicKey: 'key',
        bucket: mockBucket() as any,
        vectorize: mockVectorize() as any,
        ai: mockAi() as any,
      }),
    ).rejects.toThrow('No job found for gladiaJobId: nonexistent')
  })

  it('marks job as failed on extraction error', async () => {
    await db.insert(ingestJobs).values({
      id: 'job-2',
      url: 'https://youtube.com/watch?v=fail',
      sourceType: 'youtube',
      status: 'transcribing',
      gladiaJobId: 'gladia-fail',
      createdAt: new Date(),
    })

    vi.mocked(extractNodes).mockRejectedValue(new Error('API error 429'))

    await expect(
      completeYoutubeIngest({
        gladiaJobId: 'gladia-fail',
        transcript: 'text',
        db,
        anthropicKey: 'key',
        bucket: mockBucket() as any,
        vectorize: mockVectorize() as any,
        ai: mockAi() as any,
      }),
    ).rejects.toThrow('API error 429')

    const [job] = await db.select().from(ingestJobs).where(eq(ingestJobs.id, 'job-2'))
    expect(job.status).toBe('failed')
    expect(job.error).toContain('API error 429')
  })
})

describe('ingestWebArticle', () => {
  it('fetches article, extracts, and writes nodes', async () => {
    vi.mocked(fetchArticleText).mockResolvedValue('Article body text here')
    vi.mocked(extractNodes).mockResolvedValue([
      {
        title: 'Web Rule',
        category: 'ruling',
        content: 'Content',
        summary: 'Summary',
        keywords: ['web'],
      },
      {
        title: 'Another Rule',
        category: 'tactic',
        content: 'More content',
        summary: 'Another summary',
        keywords: ['another'],
      },
    ])
    vi.mocked(writeNodesToBrain).mockResolvedValue({ written: 2 })

    const bucket = mockBucket()
    const vectorize = mockVectorize()
    const ai = mockAi()

    const result = await ingestWebArticle({
      url: 'https://goonhammer.com/article',
      sourceName: 'Goonhammer',
      db,
      anthropicKey: 'test-key',
      bucket: bucket as any,
      vectorize: vectorize as any,
      ai: ai as any,
    })

    expect(result.jobId).toBeTruthy()
    expect(fetchArticleText).toHaveBeenCalledWith('https://goonhammer.com/article', undefined)
    expect(extractNodes).toHaveBeenCalledOnce()
    expect(writeNodesToBrain).toHaveBeenCalledOnce()

    const [job] = await db.select().from(ingestJobs).where(eq(ingestJobs.id, result.jobId))
    expect(job.status).toBe('completed')
    expect(job.nodesExtracted).toBe(2)
    expect(job.sourceType).toBe('web')
    expect(job.transcript).toBe('Article body text here')
  })

  it('marks job as failed on fetch error', async () => {
    vi.mocked(fetchArticleText).mockRejectedValue(new Error('Fetch failed with status 404'))

    await expect(
      ingestWebArticle({
        url: 'https://example.com/missing',
        db,
        anthropicKey: 'key',
        bucket: mockBucket() as any,
        vectorize: mockVectorize() as any,
        ai: mockAi() as any,
      }),
    ).rejects.toThrow('Fetch failed with status 404')

    const jobs = await db.select().from(ingestJobs)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].status).toBe('failed')
    expect(jobs[0].error).toContain('Fetch failed with status 404')
  })
})
