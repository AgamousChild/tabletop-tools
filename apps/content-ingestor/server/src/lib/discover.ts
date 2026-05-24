/**
 * Content discovery — crawl sources to find new videos/articles.
 * Each source type has its own discovery strategy.
 */
import type { Db } from '@tabletop-tools/db'
import { ingestContent, ingestSources } from '@tabletop-tools/db'
import { generateId } from '@tabletop-tools/server-core'
import { eq } from 'drizzle-orm'

export interface DiscoveryResult {
  source: string
  discovered: number
  errors: string[]
}

/**
 * Discover new content from all active sources.
 */
export async function discoverContent(db: Db): Promise<DiscoveryResult[]> {
  const sources = await db.select().from(ingestSources).where(eq(ingestSources.active, 1))

  const results: DiscoveryResult[] = []

  for (const source of sources) {
    try {
      const urls =
        source.type === 'youtube'
          ? await discoverYouTube(source.url)
          : await discoverWeb(source.url)

      let discovered = 0
      for (const entry of urls) {
        // Skip if already known
        const existing = await db
          .select({ id: ingestContent.id })
          .from(ingestContent)
          .where(eq(ingestContent.url, entry.url))
          .limit(1)

        if (existing.length > 0) continue

        await db.insert(ingestContent).values({
          id: generateId(),
          url: entry.url,
          title: entry.title,
          sourceId: source.id,
          status: 'discovered',
          discoveredAt: Date.now(),
        })
        discovered++
      }

      results.push({ source: source.id, discovered, errors: [] })
    } catch (err) {
      results.push({
        source: source.id,
        discovered: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      })
    }
  }

  return results
}

/**
 * Discover YouTube videos via RSS feed.
 * YouTube RSS: https://www.youtube.com/feeds/videos.xml?channel_id=XXXXX
 * Returns last 15 videos — good enough for daily checks.
 *
 * We first need to resolve the channel URL to a channel ID by fetching
 * the channel page and extracting the RSS link.
 */
async function discoverYouTube(channelUrl: string): Promise<Array<{ url: string; title: string }>> {
  // Fetch the channel page to find the RSS feed link
  const channelResp = await fetch(channelUrl)
  if (!channelResp.ok) throw new Error(`Failed to fetch channel: HTTP ${channelResp.status}`)
  const html = await channelResp.text()

  // Extract channel ID from the page
  const channelIdMatch =
    html.match(/channel_id=([a-zA-Z0-9_-]+)/) ??
    html.match(/"channelId":"([a-zA-Z0-9_-]+)"/) ??
    html.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/)
  if (!channelIdMatch) throw new Error('Could not find channel ID')
  const channelId = channelIdMatch[1]!

  // Fetch RSS feed
  const rssResp = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`)
  if (!rssResp.ok) throw new Error(`RSS feed error: HTTP ${rssResp.status}`)
  const xml = await rssResp.text()

  // Parse entries from XML (simple regex — RSS is well-structured)
  const entries: Array<{ url: string; title: string }> = []
  const entryRegex = /<entry>[\s\S]*?<\/entry>/g
  let match: RegExpExecArray | null
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[0]
    const videoIdMatch = entry.match(/<yt:videoId>([^<]+)</)
    const titleMatch = entry.match(/<title>([^<]+)</)
    if (videoIdMatch && titleMatch) {
      entries.push({
        url: `https://www.youtube.com/watch?v=${videoIdMatch[1]}`,
        title: titleMatch[1]!,
      })
    }
  }

  return entries
}

/**
 * Discover web articles by fetching the site and extracting article links.
 */
async function discoverWeb(siteUrl: string): Promise<Array<{ url: string; title: string }>> {
  const resp = await fetch(siteUrl)
  if (!resp.ok) throw new Error(`Failed to fetch site: HTTP ${resp.status}`)
  const html = await resp.text()

  const base = new URL(siteUrl)
  const entries: Array<{ url: string; title: string }> = []
  const seen = new Set<string>()

  // Extract links with href and text content
  const linkRegex = /<a\s[^>]*href="([^"]*)"[^>]*>([^<]*(?:<[^/a][^>]*>[^<]*)*)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1]!
    const rawTitle = match[2]!.replace(/<[^>]+>/g, '').trim()

    // Skip empty, anchor, or asset links
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue
    if (/\.(png|jpg|jpeg|gif|svg|css|js|pdf)$/i.test(href)) continue

    // Resolve to absolute URL
    let resolved: URL
    try {
      resolved = new URL(href, base)
    } catch {
      continue
    }

    // Only same-origin links
    if (resolved.hostname !== base.hostname) continue

    // Skip very short paths (home, category indexes)
    if (resolved.pathname.split('/').filter(Boolean).length < 2) continue

    const url = resolved.toString()
    if (seen.has(url)) continue
    seen.add(url)

    if (rawTitle.length > 5) {
      entries.push({ url, title: rawTitle })
    }
  }

  return entries
}
