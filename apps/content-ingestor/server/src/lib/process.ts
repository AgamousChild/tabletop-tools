/**
 * Process discovered content — picks up 'discovered' rows and runs them
 * through the ingest pipeline (Gladia for YouTube, direct fetch for web).
 */
import type { Db } from '@tabletop-tools/db'
import { ingestContent, ingestSources } from '@tabletop-tools/db'
import { eq, inArray } from 'drizzle-orm'

import { extractNodes } from './extract'
import { submitTranscription } from './gladia'
import { fetchArticleText } from './html'
import { writeNodesToBrain } from './nodes'

interface ProcessOpts {
  db: Db
  gladiaKey: string
  anthropicKey: string
  bucket: R2Bucket
  vectorize: VectorizeIndex
  ai: Ai
  callbackUrl: string
  batchLimit?: number
}

export interface ProcessResult {
  processed: number
  errors: string[]
}

/**
 * Process a batch of discovered content.
 * YouTube: submit to Gladia (async — callback handles transcript).
 * Web: fetch + extract + commit in one step.
 */
export async function processDiscovered(opts: ProcessOpts): Promise<ProcessResult> {
  const { db, batchLimit = 5 } = opts
  const errors: string[] = []
  let processed = 0

  // Get discovered content with source type. Also re-pick-up 'failed' rows:
  // writeNodesToBrain's R2 writes are idempotent merges by node id, and
  // extractNodes is a pure re-derivation from the same source text, so
  // replaying a failed item (e.g. one that failed because manifest.json's
  // conditional write exhausted its retries after community.json already
  // landed — see writeConditionally in lib/nodes.ts) safely converges
  // instead of leaving it permanently stranded with no path back to
  // 'discovered'. There is no retry-count/backoff column on ingestContent
  // today, so a permanently-broken URL (e.g. a 404) will keep re-entering
  // this batch on every run — same bounded batchLimit as fresh discoveries,
  // not unbounded. Tracked as a known limitation rather than adding a
  // schema migration to this fix.
  const rows = await db
    .select({
      id: ingestContent.id,
      url: ingestContent.url,
      sourceId: ingestContent.sourceId,
      sourceType: ingestSources.type,
    })
    .from(ingestContent)
    .innerJoin(ingestSources, eq(ingestContent.sourceId, ingestSources.id))
    .where(inArray(ingestContent.status, ['discovered', 'failed']))
    .orderBy(ingestContent.discoveredAt)
    .limit(batchLimit)

  for (const row of rows) {
    try {
      if (row.sourceType === 'youtube') {
        await processYouTube(row.id, row.url, opts)
      } else {
        await processWeb(row.id, row.url, opts)
      }
      processed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${row.url}: ${msg}`)
      await db
        .update(ingestContent)
        .set({ status: 'failed', error: msg, processedAt: Date.now() })
        .where(eq(ingestContent.id, row.id))
    }
  }

  // Also process any 'transcribed' YouTube content (Gladia callback completed)
  await processTranscribed(opts)

  return { processed, errors }
}

/**
 * Submit YouTube video to Gladia for transcription.
 */
async function processYouTube(contentId: string, url: string, opts: ProcessOpts): Promise<void> {
  await opts.db
    .update(ingestContent)
    .set({ status: 'transcribing' })
    .where(eq(ingestContent.id, contentId))

  const { gladiaJobId } = await submitTranscription({
    youtubeUrl: url,
    callbackUrl: opts.callbackUrl,
    apiKey: opts.gladiaKey,
  })

  await opts.db.update(ingestContent).set({ gladiaJobId }).where(eq(ingestContent.id, contentId))
}

/**
 * Fetch web article, extract nodes, write to brain. Single step.
 */
async function processWeb(contentId: string, url: string, opts: ProcessOpts): Promise<void> {
  await opts.db
    .update(ingestContent)
    .set({ status: 'extracting' })
    .where(eq(ingestContent.id, contentId))

  const text = await fetchArticleText(url)

  await opts.db
    .update(ingestContent)
    .set({ transcript: text })
    .where(eq(ingestContent.id, contentId))

  const nodes = await extractNodes({
    text,
    sourceUrl: url,
    apiKey: opts.anthropicKey,
  })

  const { written } = await writeNodesToBrain({
    nodes,
    sourceUrl: url,
    sourceName: url,
    bucket: opts.bucket,
    vectorize: opts.vectorize,
    ai: opts.ai,
  })

  await opts.db
    .update(ingestContent)
    .set({ status: 'completed', nodesExtracted: written, processedAt: Date.now() })
    .where(eq(ingestContent.id, contentId))
}

/**
 * Process YouTube content that has received transcripts via Gladia callback.
 *
 * Deliberately does NOT also re-pick-up 'failed' rows here (unlike
 * processDiscovered's main-loop query below) — this function runs
 * unconditionally right after that main loop, within the SAME
 * processDiscovered() invocation, and status updates from the main loop are
 * already committed by the time this query runs. If both queries matched
 * 'failed', a row that the main loop just failed (and left with a
 * transcript already set, e.g. from processWeb) would be picked up AGAIN
 * by this function in the same invocation — double-processing within one
 * run. The main loop's 'failed' re-pickup alone is sufficient to heal every
 * stranded case, including ones that originally failed deep in this
 * function's YouTube post-Gladia-callback path: on the next run they're
 * re-routed through processYouTube (re-submitting to Gladia), which
 * eventually lands back in 'transcribed' and flows through here again.
 * That's an extra Gladia call in the worst case, not a correctness problem.
 */
async function processTranscribed(opts: ProcessOpts): Promise<void> {
  const rows = await opts.db
    .select({
      id: ingestContent.id,
      url: ingestContent.url,
      transcript: ingestContent.transcript,
    })
    .from(ingestContent)
    .where(eq(ingestContent.status, 'transcribed'))
    .limit(opts.batchLimit ?? 5)

  for (const row of rows) {
    if (!row.transcript) continue

    try {
      await opts.db
        .update(ingestContent)
        .set({ status: 'extracting' })
        .where(eq(ingestContent.id, row.id))

      const nodes = await extractNodes({
        text: row.transcript,
        sourceUrl: row.url,
        apiKey: opts.anthropicKey,
      })

      const { written } = await writeNodesToBrain({
        nodes,
        sourceUrl: row.url,
        sourceName: row.url,
        bucket: opts.bucket,
        vectorize: opts.vectorize,
        ai: opts.ai,
      })

      await opts.db
        .update(ingestContent)
        .set({ status: 'completed', nodesExtracted: written, processedAt: Date.now() })
        .where(eq(ingestContent.id, row.id))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await opts.db
        .update(ingestContent)
        .set({ status: 'failed', error: msg, processedAt: Date.now() })
        .where(eq(ingestContent.id, row.id))
    }
  }
}
