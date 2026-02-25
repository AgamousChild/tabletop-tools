import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SyncMetadata, PdfMetadata } from './types'

const DEFAULT_METADATA: SyncMetadata = {
  lastScrapedAt: null,
  pdfs: {},
}

export function loadMetadata(path: string): SyncMetadata {
  if (!existsSync(path)) return { ...DEFAULT_METADATA, pdfs: {} }
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as SyncMetadata
  } catch {
    return { ...DEFAULT_METADATA, pdfs: {} }
  }
}

export function saveMetadata(path: string, metadata: SyncMetadata): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(metadata, null, 2), 'utf-8')
}

/**
 * Check if a PDF needs re-downloading by comparing SHA-256 hashes.
 */
export function needsUpdate(
  stored: SyncMetadata,
  url: string,
  newHash: string,
): boolean {
  const existing = stored.pdfs[url]
  if (!existing) return true
  return existing.sha256 !== newHash
}

export function updatePdfEntry(
  metadata: SyncMetadata,
  url: string,
  entry: PdfMetadata,
): SyncMetadata {
  return {
    ...metadata,
    pdfs: { ...metadata.pdfs, [url]: entry },
  }
}
