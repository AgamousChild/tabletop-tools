/**
 * OCR module for 11e mission card PNGs. Wraps `tesseract.js` and returns the
 * title (top of card) and body (rules text) separately so downstream parsing
 * doesn't conflate the two.
 *
 * The cards have a consistent layout: a coloured title bar at the top with the
 * card name in ALL CAPS, then a body of rules text below. We split the OCR
 * output on the first line that contains only ALL-CAPS words — that's the
 * title; everything else is body.
 *
 * Reuses a checked-in copy of `eng.traineddata` when present at the repo
 * root. Falls back to tesseract.js's default CDN download otherwise; this
 * is fine for offline-after-first-run usage.
 *
 * @see apps/brain/server/scripts/ocr-mission-cards.ts — batch driver
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { createWorker, PSM, type Worker } from 'tesseract.js'

export interface CardOcrResult {
  /** Card title — best-guess top-of-card line, ALL CAPS expected. May be empty. */
  title: string
  /** Body text — everything below the title, joined as one normalized string. */
  body: string
  /** Full unfiltered OCR text. Preserved so post-processing can re-segment if needed. */
  raw: string
}

/**
 * Find the trained-data directory. Covers the two common cwds: repo root
 * (where the checked-in copy lives) and `apps/brain/server` (which is the
 * cwd CLAUDE.md's deploy steps cd into).
 *
 * Returns `null` to mean "let tesseract.js fetch the default file" rather than
 * pointing at a missing directory (which would just trigger a confusing error).
 */
function findLangPath(): string | null {
  const candidates = [process.cwd(), resolve(process.cwd(), '../..')]
  for (const dir of candidates) {
    if (existsSync(resolve(dir, 'eng.traineddata'))) return dir
  }
  return null
}

/**
 * Cached worker — Tesseract initialisation is the slow part of OCR. Reusing a
 * single worker across a batch of cards is ~10x faster than spinning one up
 * per card. The batch driver calls `closeOcrWorker()` when done.
 */
let workerPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (workerPromise) return workerPromise
  workerPromise = (async () => {
    const langPath = findLangPath()
    // PSM 6 = "uniform block of text". Mission cards are basically rectangular
    // text blocks with a header bar; SPARSE_TEXT under-segments them and we
    // lose the title-vs-body split. PSM 6 has been more reliable in practice.
    const opts = langPath ? { langPath } : {}
    const worker = await createWorker('eng', 1, opts)
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
    return worker
  })()
  return workerPromise
}

/** Release the cached worker. Safe to call multiple times; no-op if uninitialised. */
export async function closeOcrWorker(): Promise<void> {
  if (!workerPromise) return
  const worker = await workerPromise
  workerPromise = null
  await worker.terminate()
}

/**
 * Split raw OCR text into `{ title, body }`. The title is the first non-empty
 * line that is (a) mostly uppercase letters and (b) shorter than the rest of
 * the text. If no clear title is found we treat the whole thing as body and
 * leave title empty — downstream code uses the URL slug as a fallback.
 */
export function splitTitleAndBody(raw: string): { title: string; body: string } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) return { title: '', body: '' }

  // Walk down looking for an ALL-CAPS-ish line. Allow digits, punctuation,
  // spaces; require at least one letter and >=50% uppercase among letters.
  let titleIdx = -1
  for (let i = 0; i < Math.min(lines.length, 4); i++) {
    const line = lines[i]!
    const letters = line.match(/[A-Za-z]/g) ?? []
    if (letters.length < 2) continue
    const uppers = letters.filter((c) => c === c.toUpperCase()).length
    if (uppers / letters.length >= 0.7 && line.length <= 60) {
      titleIdx = i
      break
    }
  }

  if (titleIdx < 0) {
    return { title: '', body: lines.join(' ').replace(/\s+/g, ' ').trim() }
  }

  const title = lines[titleIdx]!
  const body = lines
    .slice(titleIdx + 1)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { title, body }
}

/**
 * OCR a single card image. Returns `{ title, body, raw }`.
 *
 * Throws if the PNG cannot be read; callers should wrap in try/catch and
 * record a per-card failure rather than aborting the batch.
 */
export async function ocrCard(pngPath: string): Promise<CardOcrResult> {
  const worker = await getWorker()
  const {
    data: { text },
  } = await worker.recognize(pngPath)
  const raw = text
  const { title, body } = splitTitleAndBody(raw)
  return { title, body, raw }
}
