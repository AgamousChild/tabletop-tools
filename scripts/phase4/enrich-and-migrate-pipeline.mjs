/**
 * Phase 4 data migration — legacy tables → pipeline_source / pipeline_item /
 * pipeline_run / pipeline_run_item, enriching ingest_jobs rows by fetching
 * each URL for the real title + publish date + source confirmation (the
 * legacy table stored most titles as null).
 *
 * Inputs (prod legacy tables):
 *   ingest_jobs           11 rows (YouTube videos + WHC articles + 2 test fixtures)
 *   bcp_scrape_jobs       16 rows (BCP cron scrape jobs)
 *   meta_cube_status      1 row   (meta cube rebuild singleton)
 *
 * Outputs:
 *   pipeline_item          27 rows (11 content items + 16 bcp event-batches as items? no — bcp scrapes are runs not items)
 *   pipeline_run           28 rows (11 content-process runs + 16 bcp-scrape runs + 1 meta-cube run)
 *   pipeline_run_item      11 rows (link each content-process run to its item)
 *
 * Strategy:
 *   1. Fetch + enrich each ingest_jobs URL (YouTube oEmbed for videos, meta-tag
 *      parsing for web pages, hardcoded for httpbin test rows).
 *   2. Resolve source_name → pipeline_source.id (fuzzy match against the 6
 *      seeded sources; create 'test-fixtures' source for the 2 dev rows).
 *   3. Idempotent inserts (ON CONFLICT DO NOTHING). Re-runs are safe.
 *
 * Usage: node scripts/phase4/enrich-and-migrate-pipeline.mjs [--dry]
 *   --dry    print the enrichment + migration plan, don't write
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'

const args = process.argv.slice(2)
const dry = args.includes('--dry')

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const db = createClient({ url: env.TURSO_DB_URL, authToken: env.TURSO_AUTH_TOKEN })

// ── Source name → pipeline_source.id fuzzy resolver ─────────────────────

const sourceRows = (await db.execute('SELECT id, name FROM pipeline_source')).rows
const sourceByName = new Map(sourceRows.map((r) => [String(r.name).toLowerCase(), r.id]))

function resolveSourceId(name, kind, url) {
  // URL-based inference takes precedence — most reliable when name is null/ambiguous
  if (url) {
    if (url.includes('warhammer-community.com')) return 'warhammer-community'
    if (url.includes('goonhammer.com')) return 'goonhammer'
    if (url.includes('httpbin.org')) return 'test-fixtures'
  }
  if (!name) return null
  const lc = name.toLowerCase()
  if (sourceByName.has(lc)) return sourceByName.get(lc)
  if (lc === 'whc' || lc === 'warhammer') return 'warhammer-community'
  if (lc.includes('warhammer community')) return 'warhammer-community'
  if (lc.includes('auspex')) return 'auspex-tactics'
  if (lc === 'test' || lc === 'r2-test') return 'test-fixtures'
  return null
}

// Ensure test-fixtures source exists (used by httpbin dev rows so they're not orphaned)
if (!dry) {
  await db.execute({
    sql: `INSERT INTO pipeline_source (id, name, kind, url, active, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: ['test-fixtures', 'Test Fixtures', 'web', 'https://httpbin.org', 0, Math.floor(Date.now() / 1000)],
  })
}

// ── Enrichment helpers ──────────────────────────────────────────────────

/** YouTube oEmbed — no API key required. Returns { title, channel, thumbnail } or null. */
async function fetchYouTubeMeta(url) {
  try {
    const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    const res = await fetch(oembed, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return { error: `oEmbed ${res.status}` }
    const j = await res.json()
    return { title: j.title, channel: j.author_name, author_url: j.author_url }
  } catch (e) {
    return { error: e.message }
  }
}

/** Web page — parse <title> + og:title + article:published_time from HTML. */
async function fetchWebMeta(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'tabletop-tools/phase4-migrate (+contact: micah@krystendouglas.com)' },
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const html = await res.text()
    const pick = (re) => {
      const m = html.match(re)
      return m ? m[1].trim() : null
    }
    const title =
      pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<title>([^<]+)<\/title>/i) ||
      null
    const published =
      pick(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i) ||
      null
    return { title: title ? title.replace(/\s+/g, ' ').slice(0, 280) : null, published }
  } catch (e) {
    return { error: e.message }
  }
}

// ── Step 1: enrich ingest_jobs ─────────────────────────────────────────

const ingestJobs = (
  await db.execute(
    'SELECT id, url, source_type, source_name, title, status, nodes_extracted, error, created_at, completed_at FROM ingest_jobs ORDER BY created_at',
  )
).rows

console.log(`Enriching ${ingestJobs.length} ingest_jobs rows...`)
const enriched = []
for (const job of ingestJobs) {
  const url = String(job.url)
  let meta = {}
  if (url.includes('httpbin.org')) {
    meta = { title: `Test fixture: ${url.split('/').pop()}` }
  } else if (job.source_type === 'youtube') {
    meta = await fetchYouTubeMeta(url)
  } else if (job.source_type === 'web') {
    meta = await fetchWebMeta(url)
  }
  const resolvedTitle = job.title || meta.title || `[untitled] ${url.slice(0, 50)}`
  const sourceId = resolveSourceId(job.source_name, job.source_type, url) ?? 'test-fixtures'
  console.log(
    `  ${String(job.id).slice(0, 10).padEnd(12)} ${String(sourceId).padEnd(22)} ${meta.error ? 'ERR:' + meta.error : resolvedTitle.slice(0, 70)}`,
  )
  enriched.push({
    job,
    title: resolvedTitle,
    sourceId,
    channel: meta.channel ?? null,
    publishedAt: meta.published ?? null,
    enrichError: meta.error ?? null,
  })
}

// ── Step 2: insert pipeline_item + pipeline_run + pipeline_run_item ─────

let itemsInserted = 0
let runsInserted = 0
let linksInserted = 0

for (const e of enriched) {
  const itemId = `item-${e.job.id}`
  const runId = `run-${e.job.id}`
  const status = e.job.status === 'completed' ? 'done' : e.job.status === 'failed' ? 'failed' : e.job.status
  const summary = e.job.status === 'failed'
    ? `failed: ${e.job.error ?? 'unknown error'}`
    : `${e.job.nodes_extracted ?? 0} brain nodes extracted`

  // Derive external_id: YouTube video id from URL, otherwise the URL itself
  const externalId = e.job.source_type === 'youtube'
    ? (String(e.job.url).match(/[?&]v=([^&]+)/)?.[1] ?? String(e.job.url))
    : String(e.job.url)
  // published_at: parsed ISO from web page meta → seconds; else null
  const publishedAt = e.publishedAt ? Math.floor(new Date(e.publishedAt).getTime() / 1000) : null

  if (!dry) {
    // pipeline_item — the discovered piece of content
    // ON CONFLICT DO NOTHING covers both: duplicate id, or duplicate (source_id, external_id) — same URL processed multiple times. In that case the second ingest_jobs row becomes another pipeline_run linked to the SAME pipeline_item, which is the right model.
    await db.execute({
      sql: `INSERT INTO pipeline_item (id, source_id, title, kind, external_url, external_id, status, discovered_at, published_at, processed_at, result_summary, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT DO NOTHING`,
      args: [
        itemId,
        e.sourceId,
        e.title,
        e.job.source_type === 'youtube' ? 'video' : 'article',
        e.job.url,
        externalId,
        status,
        e.job.created_at,
        publishedAt,
        e.job.completed_at,
        summary,
        e.job.error ?? null,
      ],
    })
    // pipeline_run — the content-process run that handled this item
    await db.execute({
      sql: `INSERT INTO pipeline_run (id, pipeline, trigger, status, started_at, finished_at, found, processed, failed, triggered_by, summary, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [
        runId,
        'content-process',
        'manual',
        e.job.status === 'failed' ? 'failed' : 'ok',
        e.job.created_at,
        e.job.completed_at,
        1,
        e.job.status === 'completed' ? 1 : 0,
        e.job.status === 'failed' ? 1 : 0,
        'legacy-migration',
        `processed "${e.title.slice(0, 80)}" → ${e.job.nodes_extracted ?? 0} brain nodes`,
        e.job.error ?? null,
      ],
    })
    // Resolve the actual itemId via the unique (source_id, external_id) key —
    // in the dup-URL case the inserted item kept its original id, so the
    // run_item must point at THAT id, not our locally-generated one.
    const actualItem = await db.execute({
      sql: 'SELECT id FROM pipeline_item WHERE source_id=? AND external_id=?',
      args: [e.sourceId, externalId],
    })
    const resolvedItemId = String(actualItem.rows[0]?.id ?? itemId)
    await db.execute({
      sql: `INSERT INTO pipeline_run_item (run_id, item_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
      args: [runId, resolvedItemId],
    })
  }
  itemsInserted++
  runsInserted++
  linksInserted++
}

// ── Step 3: migrate bcp_scrape_jobs → pipeline_run ──────────────────────

const bcpJobs = (await db.execute('SELECT * FROM bcp_scrape_jobs ORDER BY started_at')).rows
console.log(`\nMigrating ${bcpJobs.length} bcp_scrape_jobs → pipeline_run`)
for (const j of bcpJobs) {
  const runId = `run-bcp-${j.id}`
  const status = j.status === 'completed' ? 'ok' : j.status === 'failed' ? 'failed' : j.status
  const summary = `found ${j.events_found ?? 0} events, scraped ${j.events_scraped ?? 0}, ${j.pairings_scraped ?? 0} pairings, ${j.lists_scraped ?? 0} lists`
  if (!dry) {
    await db.execute({
      sql: `INSERT INTO pipeline_run (id, pipeline, trigger, status, started_at, finished_at, found, processed, failed, triggered_by, summary, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [
        runId,
        'bcp-scrape',
        j.triggered_by ?? 'cron',
        status,
        j.started_at,
        j.completed_at,
        j.events_found ?? 0,
        j.events_scraped ?? 0,
        0,
        j.triggered_by ?? 'cron',
        summary,
        j.errors ?? null,
      ],
    })
  }
  runsInserted++
}

// ── Step 4: migrate meta_cube_status → pipeline_run ─────────────────────

const metaRows = (await db.execute('SELECT * FROM meta_cube_status')).rows
console.log(`\nMigrating ${metaRows.length} meta_cube_status → pipeline_run`)
for (const m of metaRows) {
  const runId = `run-meta-cube-${m.id}`
  const startedSec = m.last_started_at ? Math.floor(Number(m.last_started_at) / 1000) : null
  const finishedSec = m.last_completed_at ? Math.floor(Number(m.last_completed_at) / 1000) : null
  if (!dry) {
    await db.execute({
      sql: `INSERT INTO pipeline_run (id, pipeline, trigger, status, started_at, finished_at, found, processed, failed, triggered_by, summary, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [
        runId,
        'meta-cube',
        'cron',
        m.status === 'complete' ? 'ok' : m.status,
        startedSec,
        finishedSec,
        0,
        0,
        0,
        'cron',
        `meta cube rebuild (last_event_id=${m.last_event_id ?? 'none'})`,
        null,
      ],
    })
  }
  runsInserted++
}

console.log(`\n${dry ? '[DRY] ' : ''}=== Migration summary ===`)
console.log(`  pipeline_item:      ${itemsInserted}`)
console.log(`  pipeline_run:       ${runsInserted}`)
console.log(`  pipeline_run_item:  ${linksInserted}`)
