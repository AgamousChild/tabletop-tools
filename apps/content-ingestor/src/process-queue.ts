/**
 * Process queued pipeline_items: fetch transcript/article, run LLM extraction,
 * save draft brain nodes, update pipeline_item.status to 'done' / 'failed'.
 * Wraps the batch in a single pipeline_run with pipeline='content-process'.
 *
 * Iteration order: published_at DESC (newest first across all sources).
 *
 * Usage: node --import tsx src/process-queue.ts [N] [--dry]
 *   N        max items to process (default 20)
 *   --dry    show what would be processed, don't fetch/extract/write
 */
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { createClient, type Row } from '@libsql/client'

import { fetchArticleWithBrowser } from './crawlers/playwright-web'
import { fetchArticle } from './crawlers/web'
import { saveDraft } from './drafts/store'
import { loadExistingNodes } from './extract/dedup'
import { processContent } from './extract/extract'
import { cleanTranscriptText } from './transcript/clean'
import { fetchTranscript } from './transcript/fetch'
import type { ContentSource } from './types'
import { DEFAULT_CONFIG } from './types'

const PLAYWRIGHT_SOURCES = new Set(['goonhammer'])

function loadEnv() {
  const text = readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
  return Object.fromEntries(
    text
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string]
      }),
  )
}

interface QueuedItem {
  id: string
  source_id: string
  source_kind: string
  title: string
  external_url: string
  external_id: string
  published_at: number | null
}

export async function processQueue(opts: { n?: number; dry?: boolean } = {}) {
  const n = opts.n ?? 20
  const dry = opts.dry ?? false
  const env = loadEnv()
  const db = createClient({ url: env.TURSO_DB_URL!, authToken: env.TURSO_AUTH_TOKEN! })

  // Defense-in-depth: also enforce the 2026 cutoff here in case anything
  // pre-2026 sneaks past the queue step.
  const CUTOFF_2026 = Math.floor(Date.UTC(2026, 0, 1) / 1000)
  const items = (
    (
      await db.execute({
        sql: `SELECT pi.id, pi.source_id, ps.kind as source_kind, pi.title,
                     pi.external_url, pi.external_id, pi.published_at
              FROM pipeline_item pi
              JOIN pipeline_source ps ON ps.id = pi.source_id
              WHERE pi.status = 'queued'
                AND (pi.published_at IS NULL OR pi.published_at >= ?)
              ORDER BY pi.published_at DESC NULLS LAST, pi.discovered_at DESC
              LIMIT ?`,
        args: [CUTOFF_2026, n],
      })
    ).rows as unknown as Row[]
  ).map<QueuedItem>((r) => ({
    id: String(r.id),
    source_id: String(r.source_id),
    source_kind: String(r.source_kind),
    title: String(r.title),
    external_url: String(r.external_url),
    external_id: String(r.external_id),
    published_at: r.published_at == null ? null : Number(r.published_at),
  }))

  if (items.length === 0) {
    console.log('No queued items. Run queue-newest.ts first.')
    return { processed: 0, failed: 0 }
  }

  const runId = `run-process-${Date.now()}`
  const startedAt = Math.floor(Date.now() / 1000)
  if (!dry) {
    await db.execute({
      sql: `INSERT INTO pipeline_run (id, pipeline, trigger, status, started_at, found, processed, failed, triggered_by)
            VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      args: [runId, 'content-process', 'manual', 'running', startedAt, items.length, 'cli'],
    })
  }

  const existingNodes = await loadExistingNodes(DEFAULT_CONFIG.brainNodesDir)
  let processed = 0
  let failed = 0
  let totalDrafts = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const dateLbl = item.published_at
      ? new Date(item.published_at * 1000).toISOString().slice(0, 10)
      : '????-??-??'
    console.log(
      `\n[${i + 1}/${items.length}] ${dateLbl} · ${item.source_id} · ${item.title.slice(0, 70)}`,
    )
    if (dry) {
      console.log(`  [dry] would fetch + extract ${item.external_url}`)
      continue
    }

    // Mark processing
    await db.execute({
      sql: "UPDATE pipeline_item SET status = 'processing' WHERE id = ?",
      args: [item.id],
    })
    await db.execute({
      sql: 'INSERT INTO pipeline_run_item (run_id, item_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
      args: [runId, item.id],
    })

    try {
      let text: string
      if (item.source_kind === 'youtube') {
        const tDir = path.join(DEFAULT_CONFIG.dataDir, item.source_id, 'transcripts')
        mkdirSync(tDir, { recursive: true })
        const transcript = await fetchTranscript(item.external_url, DEFAULT_CONFIG.ytdlpPath, tDir)
        if (transcript.cleaned) {
          text = transcript.cleaned
        } else {
          const cleanedTranscript = await cleanTranscriptText(transcript, DEFAULT_CONFIG.llm)
          text = cleanedTranscript.cleaned ?? transcript.original.map((s) => s.text).join(' ')
        }
      } else {
        const article = PLAYWRIGHT_SOURCES.has(item.source_id)
          ? await fetchArticleWithBrowser(item.external_url)
          : await fetchArticle(item.external_url)
        text = article.content
      }

      if (text.length < 80) {
        throw new Error(`content too short (${text.length} chars)`)
      }

      const source: ContentSource = {
        url: item.external_url,
        type: item.source_kind === 'youtube' ? 'youtube' : 'article',
        channel: item.source_id,
        title: item.title,
        fetchedAt: new Date().toISOString(),
      }
      const drafts = await processContent(source, text, DEFAULT_CONFIG, existingNodes)
      // external_id is a URL for web items → invalid as a path on Windows.
      // Slugify for safe directory naming; the (source_id, external_id)
      // mapping is preserved in the DB row.
      const safeSeg = item.external_id.replace(/[^a-z0-9]+/gi, '-').slice(0, 100)
      const dDir = path.join(DEFAULT_CONFIG.dataDir, item.source_id, 'drafts', safeSeg)
      mkdirSync(dDir, { recursive: true })
      for (let j = 0; j < drafts.length; j++) {
        await saveDraft(drafts[j]!, dDir, j)
      }

      await db.execute({
        sql: `UPDATE pipeline_item SET status = 'done', processed_at = ?, result_summary = ? WHERE id = ?`,
        args: [Math.floor(Date.now() / 1000), `${drafts.length} draft node(s)`, item.id],
      })
      processed++
      totalDrafts += drafts.length
      console.log(`  ✓ ${drafts.length} draft(s)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await db.execute({
        sql: `UPDATE pipeline_item SET status = 'failed', processed_at = ?, error = ? WHERE id = ?`,
        args: [Math.floor(Date.now() / 1000), msg, item.id],
      })
      failed++
      console.log(`  ✗ ${msg}`)
    }
  }

  if (!dry) {
    const finishedAt = Math.floor(Date.now() / 1000)
    await db.execute({
      sql: `UPDATE pipeline_run SET status = ?, finished_at = ?, processed = ?, failed = ?, summary = ? WHERE id = ?`,
      args: [
        failed === items.length ? 'failed' : 'ok',
        finishedAt,
        processed,
        failed,
        `processed ${processed}/${items.length} items → ${totalDrafts} draft node(s); ${failed} failed`,
        runId,
      ],
    })
  }

  console.log(
    `\n${dry ? '[DRY] ' : ''}=== ${processed} processed (${totalDrafts} drafts), ${failed} failed ===`,
  )
  return { processed, failed, totalDrafts }
}

const isMain =
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('content-ingestor/src/process-queue.ts')

if (isMain) {
  const nArg = process.argv.find((a) => /^\d+$/.test(a))
  const n = nArg ? parseInt(nArg, 10) : 20
  const dry = process.argv.includes('--dry')
  processQueue({ n, dry }).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
