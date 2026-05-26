import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

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
  writeFileSync(scriptPath, `
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2];
const outPath = process.argv[3];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

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
`)

  try {
    await execFileAsync('node', [scriptPath, url, htmlPath], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60000,
    })

    const result = JSON.parse(readFileSync(htmlPath, 'utf-8')) as { title: string; content: string }

    // Clean up content
    const content = result.content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    return { title: result.title, content }
  } catch (err) {
    throw new Error(`Playwright fetch failed for ${url}: ${err instanceof Error ? err.message : err}`)
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
  writeFileSync(scriptPath, `
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2];
const outPath = process.argv[3];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

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
`)

  try {
    await execFileAsync('node', [scriptPath, siteUrl, linksPath], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60000,
    })

    return JSON.parse(readFileSync(linksPath, 'utf-8'))
  } catch (err) {
    throw new Error(`Playwright crawl failed for ${siteUrl}: ${err instanceof Error ? err.message : err}`)
  }
}
