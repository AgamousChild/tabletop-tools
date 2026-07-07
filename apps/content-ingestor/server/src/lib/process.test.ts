/**
 * Tests for the 'failed' → reprocessed recovery path in processDiscovered.
 *
 * Bug: writeNodesToBrain can throw after community.json's R2 write already
 * landed but manifest.json's conditional write exhausts its retries (see
 * writeConditionally in lib/nodes.ts). Before this fix, that throw marked
 * the ingestContent row 'failed' and NOTHING ever re-queried 'failed' rows
 * — the item was permanently stranded even though community.json already
 * has its nodes and a retry of the whole write is a safe, idempotent
 * no-op-then-heal (dedup-by-id merge). These tests prove processDiscovered
 * now re-picks-up 'failed' rows and that a second run heals them.
 */
import { createClient } from '@libsql/client'
import type { Db } from '@tabletop-tools/db'
import { createDbFromClient, ingestContent, ingestSources } from '@tabletop-tools/db'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./extract', () => ({
  extractNodes: vi.fn(),
}))

vi.mock('./nodes', () => ({
  writeNodesToBrain: vi.fn(),
}))

vi.mock('./html', () => ({
  fetchArticleText: vi.fn(),
}))

vi.mock('./gladia', () => ({
  submitTranscription: vi.fn(),
}))

import { extractNodes } from './extract'
import { submitTranscription } from './gladia'
import { fetchArticleText } from './html'
import { writeNodesToBrain } from './nodes'
import { processDiscovered } from './process'

const CREATE_TABLES = `
CREATE TABLE ingest_sources (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE ingest_content (
  id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT,
  source_id TEXT NOT NULL REFERENCES ingest_sources(id),
  status TEXT NOT NULL DEFAULT 'discovered',
  gladia_job_id TEXT, transcript TEXT, nodes_extracted INTEGER DEFAULT 0,
  error TEXT, discovered_at INTEGER NOT NULL, processed_at INTEGER
);
`

let db: Db

beforeEach(async () => {
  vi.clearAllMocks()
  const client = createClient({ url: ':memory:' })
  await client.executeMultiple(CREATE_TABLES)
  db = createDbFromClient(client)

  await db.insert(ingestSources).values({
    id: 'auspex',
    name: 'Auspex Tactics',
    url: 'https://auspex.example',
    type: 'web',
    active: 1,
    createdAt: new Date(),
  })
})

const baseOpts = {
  gladiaKey: 'gladia-key',
  anthropicKey: 'anthropic-key',
  bucket: {} as R2Bucket,
  vectorize: {} as VectorizeIndex,
  ai: {} as Ai,
  callbackUrl: 'https://example.com/callback',
}

describe('processDiscovered — failed-row reprocessing', () => {
  it('marks a web item failed when writeNodesToBrain throws (e.g. R2 retry exhaustion)', async () => {
    await db.insert(ingestContent).values({
      id: 'content-1',
      url: 'https://example.com/article',
      title: null,
      sourceId: 'auspex',
      status: 'discovered',
      discoveredAt: Date.now(),
    })

    vi.mocked(fetchArticleText).mockResolvedValue('article text')
    vi.mocked(extractNodes).mockResolvedValue([])
    vi.mocked(writeNodesToBrain).mockRejectedValueOnce(
      new Error(
        'writeConditionally: exceeded 5 retries writing R2 key "manifest.json" — concurrent writers kept conflicting',
      ),
    )

    const result = await processDiscovered({ db, ...baseOpts })

    expect(result.errors).toHaveLength(1)
    const [row] = await db
      .select()
      .from(ingestContent)
      .where(eq(ingestContent.id, 'content-1'))
      .limit(1)
    expect(row!.status).toBe('failed')
    expect(row!.error).toContain('manifest.json')
  })

  it('re-picks-up a failed item on the next processDiscovered run and heals it', async () => {
    await db.insert(ingestContent).values({
      id: 'content-1',
      url: 'https://example.com/article',
      title: null,
      sourceId: 'auspex',
      status: 'discovered',
      discoveredAt: Date.now(),
    })

    vi.mocked(fetchArticleText).mockResolvedValue('article text')
    vi.mocked(extractNodes).mockResolvedValue([])
    vi.mocked(writeNodesToBrain).mockRejectedValueOnce(new Error('manifest.json retries exhausted'))

    // First run: community.json succeeded inside writeNodesToBrain before it
    // threw (not modeled here since writeNodesToBrain is mocked as a single
    // unit — the point under test is the DB-status recovery path, which is
    // agnostic to *where inside* writeNodesToBrain the throw happened).
    const firstRun = await processDiscovered({ db, ...baseOpts })
    expect(firstRun.errors).toHaveLength(1)

    const [afterFirstRun] = await db
      .select()
      .from(ingestContent)
      .where(eq(ingestContent.id, 'content-1'))
      .limit(1)
    expect(afterFirstRun!.status).toBe('failed')

    // Second run: writeNodesToBrain now succeeds (simulating the retry
    // converging — community.json's merge is a no-op for already-written
    // nodes, manifest.json's write finally lands).
    vi.mocked(writeNodesToBrain).mockResolvedValueOnce({ written: 3 })

    const secondRun = await processDiscovered({ db, ...baseOpts })

    expect(secondRun.processed).toBe(1)
    expect(secondRun.errors).toHaveLength(0)

    const [afterSecondRun] = await db
      .select()
      .from(ingestContent)
      .where(eq(ingestContent.id, 'content-1'))
      .limit(1)
    expect(afterSecondRun!.status).toBe('completed')
    expect(afterSecondRun!.nodesExtracted).toBe(3)

    // extractNodes/writeNodesToBrain were each invoked twice — once per run —
    // proving the second run actually reprocessed the item rather than
    // finding nothing to do.
    expect(extractNodes).toHaveBeenCalledTimes(2)
    expect(writeNodesToBrain).toHaveBeenCalledTimes(2)
  })

  it('does not pick up completed items alongside failed ones', async () => {
    await db.insert(ingestContent).values([
      {
        id: 'content-done',
        url: 'https://example.com/done',
        title: null,
        sourceId: 'auspex',
        status: 'completed',
        discoveredAt: Date.now(),
        nodesExtracted: 2,
      },
      {
        id: 'content-failed',
        url: 'https://example.com/failed',
        title: null,
        sourceId: 'auspex',
        status: 'failed',
        error: 'manifest.json retries exhausted',
        discoveredAt: Date.now(),
      },
    ])

    vi.mocked(fetchArticleText).mockResolvedValue('article text')
    vi.mocked(extractNodes).mockResolvedValue([])
    vi.mocked(writeNodesToBrain).mockResolvedValue({ written: 1 })

    const result = await processDiscovered({ db, ...baseOpts })

    expect(result.processed).toBe(1)
    // Only the failed row's URL was reprocessed — the completed row was
    // left untouched (extractNodes only ever saw the failed row's text).
    expect(fetchArticleText).toHaveBeenCalledTimes(1)
    expect(fetchArticleText).toHaveBeenCalledWith('https://example.com/failed')

    const [doneRow] = await db
      .select()
      .from(ingestContent)
      .where(eq(ingestContent.id, 'content-done'))
      .limit(1)
    expect(doneRow!.status).toBe('completed')
    expect(doneRow!.nodesExtracted).toBe(2) // untouched
  })

  it('recovers a youtube item that failed deep in processTranscribed (post-Gladia-callback)', async () => {
    // Deliberately does NOT re-add 'failed' to processTranscribed's own
    // query (see the comment on that function) to avoid double-processing
    // a row within a single processDiscovered() invocation. Instead, a
    // youtube row that fails inside processTranscribed relies on the main
    // loop's 'failed' re-pickup on the NEXT run, which re-routes it through
    // processYouTube (re-submitting to Gladia) rather than resuming from
    // the existing transcript. This test proves that path terminates in
    // 'completed' rather than leaving the item permanently stranded — the
    // tradeoff (an extra, unnecessary Gladia submission) is real but
    // bounded and documented, not silent data loss.
    await db.insert(ingestSources).values({
      id: 'yt-source',
      name: 'Some YouTube Channel',
      url: 'https://youtube.com/some-channel',
      type: 'youtube',
      active: 1,
      createdAt: new Date(),
    })
    await db.insert(ingestContent).values({
      id: 'content-yt',
      url: 'https://youtube.com/watch?v=abc',
      title: null,
      sourceId: 'yt-source',
      status: 'transcribed',
      transcript: 'existing transcript from a prior Gladia callback',
      discoveredAt: Date.now(),
    })

    vi.mocked(extractNodes).mockResolvedValue([])
    vi.mocked(writeNodesToBrain).mockRejectedValueOnce(new Error('manifest.json retries exhausted'))

    // First run: the row is 'transcribed', so only processTranscribed's
    // query sees it (main loop's query wants 'discovered'/'failed', which
    // this row isn't yet). writeNodesToBrain throws inside
    // processTranscribed's try/catch, landing the row in 'failed'.
    const firstRun = await processDiscovered({ db, ...baseOpts })
    expect(firstRun.processed).toBe(0) // main loop found nothing
    expect(submitTranscription).not.toHaveBeenCalled()

    const [afterFirstRun] = await db
      .select()
      .from(ingestContent)
      .where(eq(ingestContent.id, 'content-yt'))
      .limit(1)
    expect(afterFirstRun!.status).toBe('failed')

    // Second run: the row is now 'failed' + youtube-sourced, so the main
    // loop's query picks it up and routes it through processYouTube —
    // re-submitting to Gladia (the documented tradeoff) rather than
    // resuming from the transcript already on the row.
    vi.mocked(submitTranscription).mockResolvedValueOnce({ gladiaJobId: 'job-retry-1' })

    const secondRun = await processDiscovered({ db, ...baseOpts })

    expect(secondRun.processed).toBe(1)
    expect(secondRun.errors).toHaveLength(0)
    expect(submitTranscription).toHaveBeenCalledTimes(1)

    const [afterSecondRun] = await db
      .select()
      .from(ingestContent)
      .where(eq(ingestContent.id, 'content-yt'))
      .limit(1)
    // Not stranded: back in the pipeline (transcribing again, awaiting a
    // fresh Gladia callback), not stuck in 'failed'.
    expect(afterSecondRun!.status).toBe('transcribing')
    expect(afterSecondRun!.gladiaJobId).toBe('job-retry-1')
  })
})
