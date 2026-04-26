import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CrawlManifest, CrawlEntry } from '../types'

const MANIFEST_FILE = 'manifest.json'

/**
 * Load the manifest from dir/manifest.json.
 * Returns null if the file does not exist.
 */
export async function loadManifest(dir: string): Promise<CrawlManifest | null> {
  const filePath = join(dir, MANIFEST_FILE)
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as CrawlManifest
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/**
 * Write a manifest to dir/manifest.json, creating dir if needed.
 */
export async function saveManifest(manifest: CrawlManifest, dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, MANIFEST_FILE)
  writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf-8')
}

/**
 * Return all entries in the manifest that have not yet been processed
 * (i.e., processedAt is undefined).
 */
export function getUnprocessedEntries(manifest: CrawlManifest): CrawlEntry[] {
  return manifest.entries.filter((entry) => entry.processedAt === undefined)
}

/**
 * Mark a manifest entry as processed by URL.
 * Updates processedAt to now, sets relevant and nodeCount.
 * No-op if the URL is not found.
 */
export function markEntryProcessed(
  manifest: CrawlManifest,
  url: string,
  relevant: boolean,
  nodeCount: number,
): void {
  const entry = manifest.entries.find((e) => e.url === url)
  if (!entry) return
  entry.processedAt = new Date().toISOString()
  entry.relevant = relevant
  entry.nodeCount = nodeCount
}
