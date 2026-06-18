import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Fetch an article using a headless browser (Playwright via npx).
 * This handles JavaScript-rendered content that plain fetch can't get.
 * Falls back gracefully if Playwright isn't available.
 */
export async function fetchArticleWithBrowser(
  url: string,
  tempDir?: string,
): Promise<{ title: string; content: string }> {
  const dir = tempDir ?? '.local/ingest/_temp'
  mkdirSync(dir, { recursive: true })
  const htmlPath = path.join(dir, 'page.html')

  // Write a small Node script that uses Playwright to fetch the page
  const scriptPath = path.join(dir, 'fetch-page.mjs')
  writeFileSync(
    scriptPath,
    `
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2];
const outPath = process.argv[3];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
// 'networkidle' never settles on WordPress sites with analytics/ads/comment
// widgets — use 'domcontentloaded' then optionally wait for full load.
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});

// Remove boilerplate before extracting
await page.evaluate(() => {
  document.querySelectorAll('nav, footer, aside, header, script, style, .sidebar, .ad, .nav, .menu, .comments, .related-posts, .share-buttons, .author-bio, .newsletter-signup').forEach(el => el.remove());
});

const title = await page.title();
const content = await page.evaluate(() => {
  const el = document.querySelector('article') || document.querySelector('main') || document.querySelector('.entry-content') || document.querySelector('.post-content') || document.body;
  return el ? el.innerText : '';
});

const result = JSON.stringify({ title, content });
writeFileSync(outPath, result);
await browser.close();
`,
  )

  try {
    await execFileAsync('node', [scriptPath, url, htmlPath], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60000,
    })

    const result = JSON.parse(readFileSync(htmlPath, 'utf-8')) as { title: string; content: string }

    // Clean up content
    const content = result.content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    return { title: result.title, content }
  } catch (err) {
    throw new Error(
      `Playwright fetch failed for ${url}: ${err instanceof Error ? err.message : err}`,
    )
  }
}

/**
 * Fetch only the publish date (datePublished JSON-LD) from an article URL,
 * using Playwright so bot-detection-strict sites (like Goonhammer behind
 * Cloudflare) actually return the real page rather than a JS shell.
 *
 * Returns null on any failure — caller treats "no date" as a soft signal.
 */
export async function fetchArticlePublishedDateWithBrowser(
  url: string,
  tempDir?: string,
): Promise<string | null> {
  const dir = tempDir ?? '.local/ingest/_temp'
  mkdirSync(dir, { recursive: true })
  const outPath = path.join(dir, 'date.json')
  const scriptPath = path.join(dir, 'fetch-date.mjs')
  writeFileSync(
    scriptPath,
    `
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2];
const outPath = process.argv[3];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

// Get full rendered HTML and regex it — works regardless of how the date is
// embedded (JSON-LD, og: meta, <time>, inline script JSON, Schema.org
// microdata). The fully-rendered page is what curl-with-browser-UA gets.
const html = await page.content();
const pickDate = (h) => {
  const patterns = [
    /"datePublished"\\s*:\\s*"([^"]+)"/i,
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = h.match(re);
    if (m) return m[1];
  }
  // Goonhammer renders date inline as "Jun 08 2026" — no structured markup.
  const textDate = h.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+(\\d{1,2})\\s+(20\\d{2})/);
  if (textDate) {
    const [, mon, day, year] = textDate;
    return new Date(Date.UTC(parseInt(year), {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11}[mon], parseInt(day))).toISOString();
  }
  return null;
};
const date = pickDate(html);

writeFileSync(outPath, JSON.stringify({ date, htmlLen: html.length }));
await browser.close();
`,
  )

  try {
    await execFileAsync('node', [scriptPath, url, outPath], {
      maxBuffer: 5 * 1024 * 1024,
      timeout: 60000,
    })
    const result = JSON.parse(readFileSync(outPath, 'utf-8')) as { date: string | null }
    return result.date
  } catch {
    return null
  }
}

/**
 * Crawl a site using Playwright to discover article links.
 * Handles JavaScript-rendered pages that plain fetch can't parse.
 */
export async function crawlSiteWithBrowser(
  siteUrl: string,
  tempDir?: string,
): Promise<Array<{ url: string; title: string }>> {
  const dir = tempDir ?? '.local/ingest/_temp'
  mkdirSync(dir, { recursive: true })
  const linksPath = path.join(dir, 'links.json')

  const scriptPath = path.join(dir, 'crawl-links.mjs')
  writeFileSync(
    scriptPath,
    `
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2];
const outPath = process.argv[3];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
// 'networkidle' never settles on WordPress sites with analytics/ads/comment
// widgets — they keep polling forever. 'domcontentloaded' gets us the rendered
// DOM as soon as the document parses, which is what we need for link discovery.
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
// Give client-side hydration a moment — many WP sites lazy-load article cards.
await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});

const links = await page.evaluate(() => {
  const base = new URL(window.location.href);
  return Array.from(document.querySelectorAll('a[href]'))
    .map(a => ({ url: a.href, title: a.textContent.trim() }))
    .filter(l => l.url.startsWith(base.origin) && l.title.length > 5)
    .filter(l => {
      const p = new URL(l.url).pathname;
      return p.length > 5 && !p.includes('wp-content') && !p.includes('wp-json') && !p.includes('/tag/') && !p.includes('/category/') && !p.includes('/author/') && !p.includes('#');
    })
    .filter((l, i, arr) => arr.findIndex(a => a.url === l.url) === i);
});

writeFileSync(outPath, JSON.stringify(links));
await browser.close();
`,
  )

  try {
    await execFileAsync('node', [scriptPath, siteUrl, linksPath], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60000,
    })

    return JSON.parse(readFileSync(linksPath, 'utf-8'))
  } catch (err) {
    throw new Error(
      `Playwright crawl failed for ${siteUrl}: ${err instanceof Error ? err.message : err}`,
    )
  }
}
