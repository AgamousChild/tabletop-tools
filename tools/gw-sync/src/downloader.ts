import { createHash } from 'node:crypto'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PdfEntry } from './types'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * Compute SHA-256 hash of a buffer.
 */
export function computeHash(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Generate a safe filename from a title.
 */
export function safeFileName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface DownloadResult {
  entry: PdfEntry
  filePath: string
  sha256: string
  changed: boolean
}

/**
 * Download a single PDF if it has changed (based on SHA-256 comparison).
 */
export async function downloadPdf(
  entry: PdfEntry,
  outputDir: string,
  existingHash?: string,
  fetchFn: typeof fetch = fetch,
): Promise<DownloadResult> {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  const fileName = `${safeFileName(entry.title)}.pdf`
  const filePath = join(outputDir, fileName)

  // If file already exists, check hash
  if (existsSync(filePath) && existingHash) {
    const existingData = readFileSync(filePath)
    const currentHash = computeHash(existingData)
    if (currentHash === existingHash) {
      // Fetch and check remote
      const response = await fetchFn(entry.url, {
        headers: { 'User-Agent': USER_AGENT },
      })
      if (!response.ok) {
        throw new Error(`Failed to download ${entry.title}: ${response.status}`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      const newHash = computeHash(buffer)

      if (newHash === existingHash) {
        return { entry, filePath, sha256: existingHash, changed: false }
      }

      writeFileSync(filePath, buffer)
      return { entry, filePath, sha256: newHash, changed: true }
    }
  }

  // Download fresh
  const response = await fetchFn(entry.url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!response.ok) {
    throw new Error(`Failed to download ${entry.title}: ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const sha256 = computeHash(buffer)

  // Check if content actually changed
  const changed = sha256 !== existingHash

  if (changed) {
    writeFileSync(filePath, buffer)
  }

  return { entry, filePath, sha256, changed }
}
