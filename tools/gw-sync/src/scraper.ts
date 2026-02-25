import { chromium } from 'playwright'
import type { PdfEntry, DocCategory } from './types'
import { GW_DOWNLOADS_URL, CORE_RULES_KEYWORDS } from './types'

/**
 * Classify a PDF title as core-rules or faction-pack.
 */
export function classifyDocument(title: string): DocCategory {
  const lower = title.toLowerCase()
  for (const keyword of CORE_RULES_KEYWORDS) {
    if (lower.includes(keyword)) return 'core-rules'
  }
  return 'faction-pack'
}

/**
 * Normalize a PDF URL — ensure it's absolute.
 */
export function normalizePdfUrl(href: string, baseUrl: string): string {
  if (href.startsWith('http')) return href
  if (href.startsWith('//')) return `https:${href}`
  return new URL(href, baseUrl).toString()
}

/**
 * Extract a clean title from raw card text.
 */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/download\s*$/i, '')
    .replace(/^\s*warhammer 40,000\s*[-–—:]\s*/i, '')
    .trim()
}

/**
 * Launch headless Chromium, navigate to the GW downloads page,
 * wait for dynamic content, and extract all PDF links.
 */
export async function scrapePdfLinks(): Promise<PdfEntry[]> {
  const browser = await chromium.launch({
    headless: true,
  })

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    })

    const page = await context.newPage()
    console.log(`  Navigating to ${GW_DOWNLOADS_URL}...`)

    await page.goto(GW_DOWNLOADS_URL, { waitUntil: 'networkidle', timeout: 60000 })

    // Wait for content to render — GW uses Next.js SSR with dynamic hydration
    await page.waitForTimeout(3000)

    // Strategy 1: Look for download cards with PDF links
    const entries = await page.evaluate(() => {
      const results: { title: string; url: string }[] = []
      const seen = new Set<string>()

      // Find all PDF links on the page
      const links = document.querySelectorAll('a[href*=".pdf"]')
      for (const link of links) {
        const href = link.getAttribute('href')
        if (!href) continue

        const url = href.startsWith('http')
          ? href
          : href.startsWith('//')
            ? `https:${href}`
            : new URL(href, window.location.origin).toString()

        if (seen.has(url)) continue
        seen.add(url)

        // Try to find the title from nearby elements
        let title = ''

        // Walk up to find a card container
        let el: Element | null = link
        for (let i = 0; i < 5 && el; i++) {
          el = el.parentElement
          if (!el) break
          const heading = el.querySelector('h3, h4, [class*="title"], [class*="Title"]')
          if (heading?.textContent) {
            title = heading.textContent.trim()
            break
          }
        }

        // Fallback: use link text or filename
        if (!title) {
          title = link.textContent?.trim() || ''
        }
        if (!title) {
          const parts = url.split('/')
          title = decodeURIComponent(parts[parts.length - 1]).replace('.pdf', '')
        }

        results.push({ title, url })
      }

      return results
    })

    console.log(`  Found ${entries.length} PDF links`)

    const pdfEntries: PdfEntry[] = entries.map((e) => ({
      title: cleanTitle(e.title),
      url: e.url,
      category: classifyDocument(e.title),
    }))

    await browser.close()
    return pdfEntries
  } catch (error) {
    await browser.close()
    throw error
  }
}
