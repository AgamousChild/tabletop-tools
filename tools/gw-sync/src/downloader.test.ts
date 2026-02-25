import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { computeHash, safeFileName, downloadPdf } from './downloader'
import type { PdfEntry } from './types'

function mockFetch(body: Buffer | string, status = 200): typeof fetch {
  const buffer = typeof body === 'string' ? Buffer.from(body) : body
  return vi.fn(async () => new Response(buffer, { status })) as typeof fetch
}

describe('computeHash', () => {
  it('computes SHA-256 of buffer', () => {
    const hash = computeHash(Buffer.from('test'))
    expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')
  })

  it('returns different hashes for different content', () => {
    const h1 = computeHash(Buffer.from('content1'))
    const h2 = computeHash(Buffer.from('content2'))
    expect(h1).not.toBe(h2)
  })

  it('returns same hash for same content', () => {
    const h1 = computeHash(Buffer.from('same'))
    const h2 = computeHash(Buffer.from('same'))
    expect(h1).toBe(h2)
  })
})

describe('safeFileName', () => {
  it('converts to lowercase kebab-case', () => {
    expect(safeFileName('Core Rules')).toBe('core-rules')
  })

  it('removes special characters', () => {
    expect(safeFileName("T'au Empire")).toBe('t-au-empire')
  })

  it('strips leading/trailing hyphens', () => {
    expect(safeFileName('  Hello World!  ')).toBe('hello-world')
  })

  it('collapses multiple special chars into single hyphen', () => {
    expect(safeFileName('A & B --- C')).toBe('a-b-c')
  })
})

describe('downloadPdf', () => {
  let tempDir: string
  const entry: PdfEntry = {
    title: 'Core Rules',
    url: 'https://example.com/core-rules.pdf',
    category: 'core-rules',
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'gw-dl-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('downloads and saves new PDF', async () => {
    const content = Buffer.from('pdf-content')
    const result = await downloadPdf(entry, tempDir, undefined, mockFetch(content))

    expect(result.changed).toBe(true)
    expect(result.sha256).toBe(computeHash(content))
    expect(existsSync(result.filePath)).toBe(true)
    expect(readFileSync(result.filePath)).toEqual(content)
  })

  it('reports changed=false when hash matches', async () => {
    const content = Buffer.from('pdf-content')
    const hash = computeHash(content)

    const result = await downloadPdf(entry, tempDir, hash, mockFetch(content))

    expect(result.changed).toBe(false)
    expect(result.sha256).toBe(hash)
  })

  it('throws on non-200 response', async () => {
    const badFetch = mockFetch('', 403)
    await expect(downloadPdf(entry, tempDir, undefined, badFetch)).rejects.toThrow('Failed to download Core Rules: 403')
  })

  it('creates output directory if missing', async () => {
    const nested = join(tempDir, 'deep', 'dir')
    const content = Buffer.from('test')
    await downloadPdf(entry, nested, undefined, mockFetch(content))
    expect(existsSync(nested)).toBe(true)
  })
})
