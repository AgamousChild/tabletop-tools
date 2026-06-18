/**
 * Content discovery — walks every active pipeline_source, finds new content,
 * inserts pipeline_item rows with status='discovered', wraps the sweep in a
 * single pipeline_run with pipeline='content-discovery'.
 *
 * Daily cron entry point. Local-only (depends on yt-dlp binary for YouTube
 * sources). The existing CLI commands (fetch, process, commit) continue to
 * handle the downstream stages — this module only fills the queue.
 *
 * @see docs/superpowers/specs/2026-05-28-admin-pipeline-observability-data-design.md
 */
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'

import { createClient, type Row } from '@libsql/client'

import {
  crawlSiteWithBrowser,
  fetchArticlePublishedDateWithBrowser,
} from './crawlers/playwright-web'
import { crawlSite } from './crawlers/web'
import { listChannelVideos } from './crawlers/youtube'
import { DEFAULT_CONFIG } from './types'

const execFileAsync = promisify(execFile)

/**
 * 11e launched 2026-01-01. Older content is 10e — explicitly out of scope.
 * Seed-time cutoff so we never even discover pre-2026 items.
 */
const CUTOFF_UNIX = Math.floor(Date.UTC(2026, 0, 1) / 1000)

/** Parse yt-dlp's `YYYYMMDD` upload_date to Unix seconds. */
function ytDateToUnix(yyyymmdd: string): number | null {
  if (!/^\d{8}$/.test(yyyymmdd)) return null
  const t = Date.parse(
    `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00Z`,
  )
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

/**
 * Hosts that need Playwright for date fetching — bot-detection serves a JS
 * shell to Node fetch (26KB minimal HTML, no JSON-LD).
 */
const HOSTS_NEEDING_PLAYWRIGHT_FOR_DATE = new Set(['www.goonhammer.com', 'goonhammer.com'])

async function fetchWebPublishDate(url: string): Promise<number | null> {
  if (HOSTS_NEEDING_PLAYWRIGHT_FOR_DATE.has(new URL(url).hostname)) {
    const iso = await fetchArticlePublishedDateWithBrowser(url)
    if (!iso) return null
    const t = Date.parse(iso)
    return isFinite(t) ? Math.floor(t / 1000) : null
  }
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? null
    // JSON-LD is the most reliable source — both WHC and Goonhammer put
    // datePublished there. Check it first.
    const iso =
      pick(/"datePublished"\s*:\s*"([^"]+)"/i) ||
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

/**
 * Some sources (Goonhammer) serve JS-rendered content that plain fetch +
 * Cheerio can't see. Use Playwright for these. Source ids are the toggle —
 * keeps the policy in code (one place) rather than scattered config.
 */
const PLAYWRIGHT_SOURCES = new Set(['goonhammer'])

/**
 * Some web sources don't have a single comprehensive landing page. WHC, for
 * example, splits 40k content across `/setting/warhammer-40000/` (round
 * tables, lore) AND `/downloads/warhammer-40000/` (rules releases, datasheet
 * downloads). Crawling both and merging gives full coverage without fighting
 * their JS-rendered `/all-news-and-features/` feed.
 *
 * Sources not in this map use their `pipeline_source.url` as the single crawl
 * target.
 */
const ADDITIONAL_CRAWL_URLS: Record<string, string[]> = {
  'warhammer-community': ['https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/'],
}

/**
 * Per-source URL filters — keep only the article-shaped links from each web
 * homepage/category page. Filters out language switchers, "Contact", "Privacy
 * Policy" and other site chrome that crawlSite/crawlSiteWithBrowser pick up
 * indiscriminately. Returns true if the URL looks like an article worth queueing.
 */
const WEB_URL_FILTERS: Record<string, (url: string) => boolean> = {
  'warhammer-community': (u) => /\/en-gb\/articles\/[^/]+/.test(u),
  goonhammer: (u) => {
    try {
      const path = new URL(u).pathname.replace(/\/$/, '')
      const last = path.split('/').filter(Boolean).pop() ?? ''
      // Real Goonhammer articles have 5+ hyphenated words in their slug.
      // Chrome (nav, event landing pages, category index) have ≤4 — e.g.
      // "the-goonhammer-open-uk", "how-to-support-goonhammer",
      // "warhammer-40k-11th-edition".
      return last.split('-').length >= 5
    } catch {
      return false
    }
  },
}

interface SourceRow {
  id: string
  name: string
  kind: string
  url: string
}

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

/**
 * YouTube external_id = video id (extracted from URL `v=` param).
 * Web external_id    = canonical URL (origin + pathname, no query/fragment).
 */
function externalIdOf(kind: string, url: string): string {
  if (kind === 'youtube') {
    return url.match(/[?&]v=([^&]+)/)?.[1] ?? url
  }
  return url
}

function itemKindOf(sourceKind: string): string {
  if (sourceKind === 'youtube') return 'video'
  return 'article'
}

/**
 * pipeline_item.id is globally UNIQUE. Slugifying long URLs and slicing to
 * 80 chars can collide when two URLs share a long common prefix (e.g.
 * `/the-11th-edition-space-marine-faction-packs-review-part-one` vs
 * `…-part-two`). Append an 8-char hash of the externalId for uniqueness.
 */
function genItemId(sourceId: string, externalId: string): string {
  const slug = externalId.replace(/[^a-z0-9]+/gi, '-').slice(0, 70)
  let h = 0
  for (let i = 0; i < externalId.length; i++) h = (h * 31 + externalId.charCodeAt(i)) | 0
  const hash = (h >>> 0).toString(36).padStart(7, '0').slice(0, 8)
  return `item-${sourceId}-${slug}-${hash}`
}

export async function runDiscovery(opts: { dry?: boolean } = {}): Promise<{
  runId: string
  sources: number
  found: number
  newItems: number
  failed: number
}> {
  const dry = opts.dry ?? false
  const env = loadEnv()
  const db = createClient({ url: env.TURSO_DB_URL!, authToken: env.TURSO_AUTH_TOKEN! })

  const sourcesRaw = (
    await db.execute('SELECT id, name, kind, url FROM pipeline_source WHERE active = 1')
  ).rows as unknown as Row[]
  const sources: SourceRow[] = sourcesRaw.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    kind: String(r.kind),
    url: String(r.url),
  }))
  console.log(`Walking ${sources.length} active pipeline_source rows`)

  const runId = `run-discover-${Date.now()}`
  const startedAt = Math.floor(Date.now() / 1000)

  if (!dry) {
    await db.execute({
      sql: `INSERT INTO pipeline_run (id, pipeline, trigger, status, started_at, found, processed, failed, triggered_by)
            VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?)`,
      args: [runId, 'content-discovery', 'manual', 'running', startedAt, 'cli'],
    })
  }

  let totalFound = 0
  let totalNew = 0
  let totalFailed = 0

  for (const source of sources) {
    console.log(`\n[${source.id}] crawling ${source.url}`)
    let items: Array<{ url: string; title: string }> = []
    let crawlError: string | null = null
    try {
      if (source.kind === 'youtube') {
        items = await listChannelVideos(source.url, DEFAULT_CONFIG.ytdlpPath)
      } else if (source.kind === 'web') {
        // Walk up to MAX_PAGES of WordPress `/page/N/` pagination on the
        // source's primary URL, then crawl each ADDITIONAL_CRAWL_URLS page
        // (one page only — those URLs target specific landings, not feeds).
        const MAX_PAGES = 5
        const fetcher = PLAYWRIGHT_SOURCES.has(source.id) ? crawlSiteWithBrowser : crawlSite
        const baseUrl = source.url.replace(/\/$/, '')
        const seenUrls = new Set<string>()
        const crawlOne = async (pageUrl: string, label: string) => {
          try {
            const pageItems = await fetcher(pageUrl)
            const newItems = pageItems.filter((p) => !seenUrls.has(p.url))
            for (const p of newItems) seenUrls.add(p.url)
            console.log(`  ${label}: ${pageItems.length} items (${newItems.length} new)`)
            items.push(...newItems)
            return newItems.length
          } catch (err) {
            console.log(`  ${label}: ${err instanceof Error ? err.message.slice(0, 80) : 'error'}`)
            return 0
          }
        }
        for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
          const pageUrl = pageNum === 1 ? baseUrl + '/' : `${baseUrl}/page/${pageNum}/`
          const added = await crawlOne(pageUrl, `page ${pageNum}`)
          if (pageNum > 1 && added === 0) break // pagination terminated
        }
        for (const extraUrl of ADDITIONAL_CRAWL_URLS[source.id] ?? []) {
          await crawlOne(extraUrl, `extra ${new URL(extraUrl).pathname}`)
        }
      } else {
        console.log(`  (skipping unsupported kind: ${source.kind})`)
        continue
      }
    } catch (err) {
      crawlError = err instanceof Error ? err.message : String(err)
      console.log(`  ✗ crawl failed: ${crawlError}`)
      totalFailed++
      if (!dry) {
        await db.execute({
          sql: `UPDATE pipeline_source SET last_checked_at = ?, last_error = ? WHERE id = ?`,
          args: [startedAt, crawlError, source.id],
        })
      }
      continue
    }

    const rawCount = items.length
    const urlFilter = WEB_URL_FILTERS[source.id]
    if (urlFilter && source.kind === 'web') {
      items = items.filter((i) => urlFilter(i.url))
      console.log(
        `  crawler returned ${rawCount} items → ${items.length} after article-shape filter`,
      )
    } else {
      console.log(`  crawler returned ${items.length} items`)
    }
    totalFound += items.length

    // Date-gated insert: fetch publish date per item, skip pre-2026.
    // For YouTube (newest-first) we break early on first pre-2026 hit — the
    // rest of the channel back-catalog is older still. For web we walk all
    // candidates (paginated category, newest-first).
    //
    // Cap on per-source date fetches: yt-dlp metadata is ~3s/video. Without
    // a cap an Auspex Tactics seed would fetch 4600 dates (~4 hours). 100
    // covers ~6+ months of 11e content (channels post 4–8 videos/week).
    const MAX_DATE_FETCHES_PER_SOURCE = 100
    let inserted = 0
    let skipped = 0
    let preCutoff = 0
    let dateUnknown = 0
    let datesFetched = 0
    for (const item of items) {
      if (datesFetched >= MAX_DATE_FETCHES_PER_SOURCE) {
        console.log(`  hit MAX_DATE_FETCHES_PER_SOURCE=${MAX_DATE_FETCHES_PER_SOURCE} — stopping`)
        break
      }
      const externalId = externalIdOf(source.kind, item.url)
      datesFetched++
      const publishedAt =
        source.kind === 'youtube'
          ? await fetchYouTubeUploadDate(item.url)
          : await fetchWebPublishDate(item.url)

      if (publishedAt == null) {
        dateUnknown++
        // Date unknown — leave in queue for later enrichment; skip insert for now
        continue
      }
      if (publishedAt < CUTOFF_UNIX) {
        preCutoff++
        // Both YouTube and WP category pages are newest-first. As soon as we
        // see a pre-2026 article we can stop walking this source's queue.
        console.log(
          `  reached pre-2026 cutoff at ${new Date(publishedAt * 1000).toISOString().slice(0, 10)} (${item.title.slice(0, 50)}) — stopping`,
        )
        break
      }

      const itemId = genItemId(source.id, externalId)
      if (dry) {
        const existing = await db.execute({
          sql: 'SELECT 1 FROM pipeline_item WHERE source_id=? AND external_id=?',
          args: [source.id, externalId],
        })
        if (existing.rows.length === 0) inserted++
        else skipped++
        continue
      }
      const result = await db.execute({
        sql: `INSERT INTO pipeline_item (id, source_id, title, kind, external_url, external_id, status, discovered_at, published_at)
              VALUES (?, ?, ?, ?, ?, ?, 'discovered', ?, ?)
              ON CONFLICT (source_id, external_id) DO NOTHING`,
        args: [
          itemId,
          source.id,
          item.title.slice(0, 280),
          itemKindOf(source.kind),
          item.url,
          externalId,
          startedAt,
          publishedAt,
        ],
      })
      if ((result.rowsAffected ?? 0) > 0) inserted++
      else skipped++
    }
    totalNew += inserted
    console.log(
      `  ${inserted} new · ${skipped} dup · ${preCutoff} pre-2026 · ${dateUnknown} no-date`,
    )

    if (!dry) {
      await db.execute({
        sql: `UPDATE pipeline_source SET last_checked_at = ?, last_success_at = ?, last_error = NULL WHERE id = ?`,
        args: [startedAt, startedAt, source.id],
      })
    }
  }

  const finishedAt = Math.floor(Date.now() / 1000)
  const status = totalFailed === sources.length && sources.length > 0 ? 'failed' : 'ok'
  const summary = `crawled ${sources.length} sources, discovered ${totalNew} new items (${totalFound} returned by crawlers, ${totalFailed} source crawls failed)`

  if (!dry) {
    await db.execute({
      sql: `UPDATE pipeline_run SET status=?, finished_at=?, found=?, processed=?, failed=?, summary=? WHERE id=?`,
      args: [status, finishedAt, totalFound, totalNew, totalFailed, summary, runId],
    })
  }

  console.log(`\n${dry ? '[DRY] ' : ''}=== ${summary} ===`)
  return {
    runId,
    sources: sources.length,
    found: totalFound,
    newItems: totalNew,
    failed: totalFailed,
  }
}

// ── CLI invocation ──────────────────────────────────────────────────────

const isMain =
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('content-ingestor/src/discover.ts')

if (isMain) {
  const dry = process.argv.includes('--dry')
  runDiscovery({ dry }).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
