/**
 * Enrich pipeline_items with publish dates, then promote the top N newest
 * GLOBALLY (across all sources) from status='discovered' to status='queued'.
 *
 * Two phases:
 *   1. Enrich: for each candidate (status='discovered', published_at IS NULL),
 *      fetch the publish date.
 *        - YouTube: yt-dlp --print upload_date  (one per video, ~1–2s each)
 *        - Web:     fetch HTML, parse article:published_time / pubdate
 *      To bound enrichment cost we only enrich the top M most-recently-discovered
 *      per source (we know yt-dlp returns channel videos newest-first, so the
 *      first M of each source's queue are the candidates worth dating).
 *   2. Queue: SELECT … ORDER BY published_at DESC LIMIT N → status='queued'.
 *
 * Usage: node --import tsx src/queue-newest.ts [N] [--per-source M] [--dry]
 *   N         items to queue globally (default 20)
 *   --per-source M
 *             max items per source to enrich (default 30 — covers ~1.5×N
 *             without blowing yt-dlp budget on years of back catalog)
 *   --dry     don't write
 */
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'

import { createClient, type Row } from '@libsql/client'

import { DEFAULT_CONFIG } from './types'

const execFileAsync = promisify(execFile)

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

/** yt-dlp --print upload_date returns "YYYYMMDD". Convert to Unix seconds. */
function ytDateToUnix(yyyymmdd: string): number | null {
  if (!/^\d{8}$/.test(yyyymmdd)) return null
  const y = yyyymmdd.slice(0, 4)
  const m = yyyymmdd.slice(4, 6)
  const d = yyyymmdd.slice(6, 8)
  const t = Date.parse(`${y}-${m}-${d}T00:00:00Z`)
  return isFinite(t) ? Math.floor(t / 1000) : null
}

async function fetchYouTubeUploadDate(url: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      DEFAULT_CONFIG.ytdlpPath,
      ['--print', '%(upload_date)s', '--skip-download', url],
      { maxBuffer: 1 * 1024 * 1024, timeout: 30000 },
    )
    const date = stdout.trim().split('\n').pop() ?? ''
    return ytDateToUnix(date)
  } catch {
    return null
  }
}

async function fetchWebPublishDate(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'tabletop-tools/discover (contact: micah@krystendouglas.com)' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? null
    const iso =
      pick(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<time[^>]+datetime=["']([^"']+)["']/i) ||
      null
    if (!iso) return null
    const t = Date.parse(iso)
    return isFinite(t) ? Math.floor(t / 1000) : null
  } catch {
    return null
  }
}

interface EnrichCandidate {
  id: string
  source_id: string
  source_kind: string
  external_url: string
}

export async function queueNewest(opts: { n?: number; perSource?: number; dry?: boolean } = {}) {
  const n = opts.n ?? 20
  const perSource = opts.perSource ?? 30
  const dry = opts.dry ?? false
  const env = loadEnv()
  const db = createClient({ url: env.TURSO_DB_URL!, authToken: env.TURSO_AUTH_TOKEN! })

  // ── Phase 1: enrich (fetch publish date for top M per source) ──────────

  const sources = (
    (await db.execute('SELECT id, kind FROM pipeline_source WHERE active = 1'))
      .rows as unknown as Row[]
  ).map((r) => ({ id: String(r.id), kind: String(r.kind) }))

  const candidates: EnrichCandidate[] = []
  for (const source of sources) {
    const rows = (
      await db.execute({
        sql: `SELECT id, external_url FROM pipeline_item
              WHERE source_id = ? AND status = 'discovered' AND published_at IS NULL
              ORDER BY rowid ASC
              LIMIT ?`,
        args: [source.id, perSource],
      })
    ).rows as unknown as Row[]
    for (const r of rows) {
      candidates.push({
        id: String(r.id),
        source_id: source.id,
        source_kind: source.kind,
        external_url: String(r.external_url),
      })
    }
  }
  console.log(
    `Enrichment phase: ${candidates.length} candidates across ${sources.length} sources (max ${perSource}/source)`,
  )

  let enriched = 0
  let failed = 0
  for (const c of candidates) {
    const date =
      c.source_kind === 'youtube'
        ? await fetchYouTubeUploadDate(c.external_url)
        : await fetchWebPublishDate(c.external_url)
    if (date == null) {
      failed++
      console.log(`  [no-date] ${c.source_id} · ${c.external_url.slice(0, 80)}`)
      continue
    }
    enriched++
    if (!dry) {
      await db.execute({
        sql: 'UPDATE pipeline_item SET published_at = ? WHERE id = ?',
        args: [date, c.id],
      })
    }
  }
  console.log(`  enriched: ${enriched}, no-date: ${failed}`)

  // ── Phase 2: queue top N by published_at desc ──────────────────────────
  // 11e launched 2026-01-01. Anything older is 10e content — explicitly out
  // of scope per Micah's instruction, so the cutoff is the queue gate.
  const CUTOFF_2026 = Math.floor(Date.UTC(2026, 0, 1) / 1000)

  const top = (
    await db.execute({
      sql: `SELECT id, source_id, title, published_at FROM pipeline_item
            WHERE status = 'discovered'
              AND published_at IS NOT NULL
              AND published_at >= ?
            ORDER BY published_at DESC
            LIMIT ?`,
      args: [CUTOFF_2026, n],
    })
  ).rows as unknown as Row[]
  console.log(`\nGlobal newest ${n}:`)
  for (const r of top) {
    const d = new Date(Number(r.published_at) * 1000).toISOString().slice(0, 10)
    console.log(`  ${d} · ${String(r.source_id).padEnd(22)} · ${String(r.title).slice(0, 80)}`)
  }

  let queued = 0
  if (!dry) {
    for (const r of top) {
      const result = await db.execute({
        sql: "UPDATE pipeline_item SET status = 'queued' WHERE id = ? AND status = 'discovered'",
        args: [r.id],
      })
      if ((result.rowsAffected ?? 0) > 0) queued++
    }
  } else {
    queued = top.length
  }
  console.log(`\n${dry ? '[DRY] ' : ''}=== queued ${queued} items (global newest-first) ===`)
  return { enriched, queued }
}

const isMain =
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('content-ingestor/src/queue-newest.ts')

if (isMain) {
  const nArg = process.argv.find((a) => /^\d+$/.test(a))
  const n = nArg ? parseInt(nArg, 10) : 20
  const perIdx = process.argv.indexOf('--per-source')
  const perSource = perIdx >= 0 ? parseInt(process.argv[perIdx + 1] ?? '30', 10) : 30
  const dry = process.argv.includes('--dry')
  queueNewest({ n, perSource, dry }).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
