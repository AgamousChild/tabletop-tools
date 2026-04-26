import * as cheerio from 'cheerio'

/**
 * Fetch the HTML of a site and extract article-like links.
 * Filters to same-origin links with at least one meaningful path segment.
 * Deduplicates by URL.
 */
export async function crawlSite(
  siteUrl: string,
): Promise<Array<{ url: string; title: string }>> {
  const response = await fetch(siteUrl)
  if (!response.ok) {
    throw new Error(`crawlSite failed: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const $ = cheerio.load(html)
  const base = new URL(siteUrl)

  const seen = new Set<string>()
  const results: Array<{ url: string; title: string }> = []

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    const title = $(el).text().trim()

    // Skip anchors, javascript:, mailto:, empty
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      return
    }

    let resolved: URL
    try {
      resolved = new URL(href, base)
    } catch {
      return
    }

    // Same origin only
    if (resolved.origin !== base.origin) return

    // Must have a path with at least 2 segments (e.g. /articles/something)
    const segments = resolved.pathname.split('/').filter(Boolean)
    if (segments.length < 2) return

    const url = resolved.href
    if (seen.has(url)) return

    seen.add(url)
    results.push({ url, title: title || url })
  })

  return results
}

/**
 * Fetch an article page and extract its title and cleaned text content.
 * Removes boilerplate elements (nav, footer, aside, header, scripts, styles,
 * and elements with sidebar/ad/nav/menu class names).
 * Prefers <article> content, falls back to <main>, then <body>.
 */
export async function fetchArticle(url: string): Promise<{ title: string; content: string }> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`fetchArticle failed: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const $ = cheerio.load(html)

  // Extract title: prefer first <h1>, fall back to <title>
  const h1 = $('h1').first().text().trim()
  const titleTag = $('title').first().text().trim()
  const title = h1 || titleTag

  // Remove boilerplate elements
  $('nav, footer, aside, header, script, style').remove()
  $('.sidebar, .ad, .nav, .menu').remove()

  // Find content container in priority order
  const container = $('article').length
    ? $('article')
    : $('main').length
      ? $('main')
      : $('body')

  // Extract text, collapsing whitespace
  const raw = container.text()
  const content = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { title, content }
}
