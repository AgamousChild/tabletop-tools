/**
 * Manually add a specific URL to pipeline_item, status='queued'.
 *
 * Use when you want a URL processed that the crawlers haven't found (deep
 * category links, hand-curated picks). Source is inferred from the URL host.
 * Title + publish date are fetched (oEmbed for YouTube, og: meta for web).
 *
 * Usage: node --import tsx src/add-item.ts <url> [<url> ...]
 */
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'

import { createClient } from '@libsql/client'

import { fetchArticlePublishedDateWithBrowser } from './crawlers/playwright-web'
import { DEFAULT_CONFIG } from './types'

const HOSTS_NEEDING_PLAYWRIGHT = new Set(['www.goonhammer.com', 'goonhammer.com'])

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

function ytDateToUnix(yyyymmdd: string): number | null {
  if (!/^\d{8}$/.test(yyyymmdd)) return null
  const t = Date.parse(
    `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00Z`,
  )
  return isFinite(t) ? Math.floor(t / 1000) : null
}

interface ItemMeta {
  sourceId: string
  kind: 'video' | 'article'
  externalId: string
  title: string | null
  publishedAt: number | null
}

function inferSource(url: string): { sourceId: string; kind: 'video' | 'article' } | null {
  const u = new URL(url)
  if (u.hostname.includes('youtube.com') || u.hostname === 'youtu.be') {
    return { sourceId: 'manual', kind: 'video' } // sourceId filled in after lookup
  }
  if (u.hostname.includes('warhammer-community.com'))
    return { sourceId: 'warhammer-community', kind: 'article' }
  if (u.hostname.includes('goonhammer.com')) return { sourceId: 'goonhammer', kind: 'article' }
  return null
}

async function fetchYouTubeMeta(url: string) {
  try {
    const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    const res = await fetch(oembed, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return { title: null, channel: null }
    const j = (await res.json()) as { title?: string; author_name?: string; author_url?: string }
    const { stdout } = await execFileAsync(
      DEFAULT_CONFIG.ytdlpPath,
      ['--print', '%(upload_date)s', '--skip-download', url],
      { maxBuffer: 1 * 1024 * 1024, timeout: 30000 },
    )
    const publishedAt = ytDateToUnix(stdout.trim().split('\n').pop() ?? '')
    return { title: j.title ?? null, channel: j.author_name ?? null, publishedAt }
  } catch (err) {
    return { title: null, channel: null, publishedAt: null }
  }
}

async function fetchWebMeta(url: string) {
  const host = new URL(url).hostname
  // Goonhammer's bot detection serves a JS shell to Node fetch — use
  // Playwright to fetch the real article date.
  if (HOSTS_NEEDING_PLAYWRIGHT.has(host)) {
    const iso = await fetchArticlePublishedDateWithBrowser(url)
    // Title fetch still uses plain fetch — title selectors are present in
    // even the shell HTML (og:title is set server-side via meta).
    const r = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(20000),
    })
    const html = r.ok ? await r.text() : ''
    const titleMatch = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    )
    const title = titleMatch?.[1]?.trim() ?? null
    const publishedAt = iso ? Math.floor(Date.parse(iso) / 1000) : null
    return { title, publishedAt }
  }
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? null
  const title =
    pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<title>([^<]+)<\/title>/i) ||
    null
  // JSON-LD datePublished is the most reliable signal on both WHC and
  // Goonhammer; check it first.
  const iso =
    pick(/"datePublished"\s*:\s*"([^"]+)"/i) ||
    pick(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<time[^>]+datetime=["']([^"']+)["']/i) ||
    null
  const publishedAt = iso ? Math.floor(Date.parse(iso) / 1000) : null
  return { title, publishedAt }
}

export async function addItem(url: string) {
  const env = loadEnv()
  const db = createClient({ url: env.TURSO_DB_URL!, authToken: env.TURSO_AUTH_TOKEN! })
  const inferred = inferSource(url)
  if (!inferred) {
    console.log(`  ✗ unknown host: ${url}`)
    return null
  }

  let meta: ItemMeta
  if (inferred.kind === 'video') {
    const yt = await fetchYouTubeMeta(url)
    // Resolve sourceId by channel match (rough — exact match of pipeline_source.name first)
    const channel = yt.channel ?? null
    let sourceId = 'manual'
    if (channel) {
      const r = await db.execute({
        sql: 'SELECT id FROM pipeline_source WHERE LOWER(name) = LOWER(?) LIMIT 1',
        args: [channel],
      })
      if (r.rows.length > 0) sourceId = String(r.rows[0]!.id)
    }
    const externalId = url.match(/[?&]v=([^&]+)/)?.[1] ?? url
    meta = {
      sourceId,
      kind: 'video',
      externalId,
      title: yt.title,
      publishedAt: yt.publishedAt ?? null,
    }
  } else {
    const web = await fetchWebMeta(url)
    meta = {
      sourceId: inferred.sourceId,
      kind: 'article',
      externalId: url,
      title: web.title,
      publishedAt: web.publishedAt,
    }
  }

  const itemId = `manual-${meta.externalId.replace(/[^a-z0-9]+/gi, '-').slice(0, 80)}-${Date.now().toString(36).slice(-6)}`
  const discoveredAt = Math.floor(Date.now() / 1000)

  await db.execute({
    sql: `INSERT INTO pipeline_item (id, source_id, title, kind, external_url, external_id, status, discovered_at, published_at)
          VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)
          ON CONFLICT (source_id, external_id) DO UPDATE SET status = 'queued', title = excluded.title, published_at = excluded.published_at`,
    args: [
      itemId,
      meta.sourceId,
      meta.title?.slice(0, 280) ?? `[manual] ${url.slice(0, 60)}`,
      meta.kind,
      url,
      meta.externalId,
      discoveredAt,
      meta.publishedAt,
    ],
  })

  const dateLbl = meta.publishedAt
    ? new Date(meta.publishedAt * 1000).toISOString().slice(0, 10)
    : '????-??-??'
  console.log(`  ✓ queued: ${dateLbl} · ${meta.sourceId} · ${meta.title?.slice(0, 70) ?? url}`)
  return meta
}

const isMain =
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('content-ingestor/src/add-item.ts')

if (isMain) {
  const urls = process.argv.slice(2).filter((a) => a.startsWith('http'))
  if (urls.length === 0) {
    console.error('Usage: add-item.ts <url> [<url> ...]')
    process.exit(2)
  }
  for (const u of urls) {
    await addItem(u).catch((err) => console.error(`  ✗ ${u}: ${err.message}`))
  }
}
