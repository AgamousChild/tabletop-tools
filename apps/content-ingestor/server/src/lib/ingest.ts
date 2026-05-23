/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 */
import type { Db } from '@tabletop-tools/db'
import { ingestJobs } from '@tabletop-tools/db'
import { generateId } from '@tabletop-tools/server-core'
import { eq } from 'drizzle-orm'
import { submitTranscription } from './gladia'
import { extractNodes } from './extract'
import { writeNodesToBrain } from './nodes'
import { fetchArticleText } from './html'

export async function startYoutubeIngest(opts: {
  url: string
  sourceName?: string
  callbackUrl: string
  gladiaKey: string
  db: Db
  fetch?: typeof fetch
}): Promise<{ jobId: string }> {
  const jobId = generateId()

  await opts.db.insert(ingestJobs).values({
    id: jobId,
    url: opts.url,
    sourceType: 'youtube',
    sourceName: opts.sourceName ?? null,
    status: 'pending',
    createdAt: new Date(),
  })

  try {
    const { gladiaJobId } = await submitTranscription({
      youtubeUrl: opts.url,
      callbackUrl: opts.callbackUrl,
      apiKey: opts.gladiaKey,
      fetch: opts.fetch,
    })

    await opts.db
      .update(ingestJobs)
      .set({ gladiaJobId, status: 'transcribing' })
      .where(eq(ingestJobs.id, jobId))

    return { jobId }
  } catch (err) {
    await opts.db
      .update(ingestJobs)
      .set({ status: 'failed', error: err instanceof Error ? err.message : String(err) })
      .where(eq(ingestJobs.id, jobId))
    throw err
  }
}

/**
 * Save transcript from Gladia callback. Fast — just a DB write.
 */
export async function saveTranscript(opts: {
  gladiaJobId: string
  transcript: string
  db: Db
}): Promise<{ jobId: string }> {
  const [job] = await opts.db
    .select()
    .from(ingestJobs)
    .where(eq(ingestJobs.gladiaJobId, opts.gladiaJobId))
    .limit(1)

  if (!job) throw new Error(`No job found for gladiaJobId: ${opts.gladiaJobId}`)

  await opts.db
    .update(ingestJobs)
    .set({ transcript: opts.transcript, status: 'transcribed' })
    .where(eq(ingestJobs.id, job.id))

  return { jobId: job.id }
}

/**
 * Process a transcribed job: extract nodes via Claude, write to R2 + Vectorize.
 * Single step — no temporary storage needed.
 */
export async function processJob(opts: {
  jobId: string
  db: Db
  anthropicKey: string
  bucket: R2Bucket
  vectorize: VectorizeIndex
  ai: Ai
  fetch?: typeof fetch
}): Promise<{ nodesExtracted: number }> {
  const [job] = await opts.db
    .select()
    .from(ingestJobs)
    .where(eq(ingestJobs.id, opts.jobId))
    .limit(1)

  if (!job) throw new Error(`No job found: ${opts.jobId}`)
  if (!job.transcript) throw new Error(`Job ${opts.jobId} has no transcript`)

  try {
    await opts.db
      .update(ingestJobs)
      .set({ status: 'extracting' })
      .where(eq(ingestJobs.id, job.id))

    const nodes = await extractNodes({
      text: job.transcript,
      sourceUrl: job.url,
      sourceTitle: job.sourceName ?? undefined,
      apiKey: opts.anthropicKey,
      fetch: opts.fetch,
    })

    const { written } = await writeNodesToBrain({
      nodes,
      sourceUrl: job.url,
      sourceName: job.sourceName ?? job.url,
      bucket: opts.bucket,
      vectorize: opts.vectorize,
      ai: opts.ai,
    })

    await opts.db
      .update(ingestJobs)
      .set({ status: 'completed', nodesExtracted: written, completedAt: new Date() })
      .where(eq(ingestJobs.id, job.id))

    return { nodesExtracted: written }
  } catch (err) {
    await opts.db
      .update(ingestJobs)
      .set({ status: 'failed', error: err instanceof Error ? err.message : String(err) })
      .where(eq(ingestJobs.id, job.id))
    throw err
  }
}

export async function ingestWebArticle(opts: {
  url: string
  sourceName?: string
  db: Db
  anthropicKey: string
  bucket: R2Bucket
  vectorize: VectorizeIndex
  ai: Ai
  fetch?: typeof fetch
}): Promise<{ jobId: string }> {
  const jobId = generateId()

  await opts.db.insert(ingestJobs).values({
    id: jobId,
    url: opts.url,
    sourceType: 'web',
    sourceName: opts.sourceName ?? null,
    status: 'pending',
    createdAt: new Date(),
  })

  try {
    const text = await fetchArticleText(opts.url, opts.fetch)

    await opts.db
      .update(ingestJobs)
      .set({ transcript: text, status: 'extracting' })
      .where(eq(ingestJobs.id, jobId))

    const nodes = await extractNodes({
      text,
      sourceUrl: opts.url,
      sourceTitle: opts.sourceName,
      apiKey: opts.anthropicKey,
      fetch: opts.fetch,
    })

    const { written } = await writeNodesToBrain({
      nodes,
      sourceUrl: opts.url,
      sourceName: opts.sourceName ?? opts.url,
      bucket: opts.bucket,
      vectorize: opts.vectorize,
      ai: opts.ai,
    })

    await opts.db
      .update(ingestJobs)
      .set({ status: 'completed', nodesExtracted: written, completedAt: new Date() })
      .where(eq(ingestJobs.id, jobId))

    return { jobId }
  } catch (err) {
    await opts.db
      .update(ingestJobs)
      .set({ status: 'failed', error: err instanceof Error ? err.message : String(err) })
      .where(eq(ingestJobs.id, jobId))
    throw err
  }
}
