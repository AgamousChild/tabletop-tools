/**
 * Process discovered content — picks up 'discovered' rows and runs them
 * through the ingest pipeline (Gladia for YouTube, direct fetch for web).
 */
import type { Db } from '@tabletop-tools/db'
import { ingestContent, ingestSources } from '@tabletop-tools/db'
import { eq } from 'drizzle-orm'

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

  // Get discovered content with source type
  const rows = await db
    .select({
      id: ingestContent.id,
      url: ingestContent.url,
      sourceId: ingestContent.sourceId,
      sourceType: ingestSources.type,
    })
    .from(ingestContent)
    .innerJoin(ingestSources, eq(ingestContent.sourceId, ingestSources.id))
    .where(eq(ingestContent.status, 'discovered'))
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
