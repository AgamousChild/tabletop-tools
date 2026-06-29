/**
 * Batch OCR every downloaded mission-card PNG and write a single `ocr.json`
 * manifest that the brain build picks up.
 *
 * Inputs:  `.local/brain-input/mission-cards/11th/...png`
 * Output:  `.local/brain-input/mission-cards/11th/ocr.json`
 *
 * Re-runs are idempotent: if `ocr.json` already lists an entry for a given
 * `relPath`, we keep the existing OCR text and skip re-OCRing that image.
 * Pass `OCR_FORCE=1` to re-OCR everything.
 *
 * Per Rule 4: the work lives in `ocrMissionCards()` so other callers can
 * trigger it programmatically.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { closeOcrWorker, ocrCard } from '../src/lib/parsers/mission-card-ocr'
import { listMissionCardImages } from '../src/lib/parsers/mission-card-urls'
import type { MissionCardOcrEntry, MissionCardOcrManifest } from '../src/lib/parsers/mission-cards'

export interface OcrRunOptions {
  /** Root directory containing the downloaded PNGs. */
  inputDir?: string
  /** Output manifest path. Defaults to `<inputDir>/ocr.json`. */
  outputPath?: string
  /** Re-OCR every card even if already in the existing manifest. */
  force?: boolean
}

export interface OcrRunResult {
  ocred: number
  skipped: number
  missing: number
  failed: number
  manifest: MissionCardOcrManifest
}

async function loadExistingManifest(path: string): Promise<Map<string, MissionCardOcrEntry>> {
  if (!existsSync(path)) return new Map()
  try {
    const text = await readFile(path, 'utf-8')
    const parsed = JSON.parse(text) as MissionCardOcrManifest
    const map = new Map<string, MissionCardOcrEntry>()
    for (const entry of parsed.cards ?? []) {
      map.set(entry.relPath, entry)
    }
    return map
  } catch {
    return new Map()
  }
}

export async function ocrMissionCards(opts: OcrRunOptions = {}): Promise<OcrRunResult> {
  const inputDir = opts.inputDir ?? '.local/brain-input/mission-cards/11th'
  const outputPath = opts.outputPath ?? join(inputDir, 'ocr.json')
  const force = opts.force ?? process.env.OCR_FORCE === '1'

  const existing = force ? new Map() : await loadExistingManifest(outputPath)
  const images = listMissionCardImages()

  const cards: MissionCardOcrEntry[] = []
  let ocred = 0
  let skipped = 0
  let missing = 0
  let failed = 0

  for (const img of images) {
    const pngPath = join(inputDir, img.relPath)
    if (!existsSync(pngPath)) {
      missing++
      continue
    }

    const prior = existing.get(img.relPath)
    if (prior && (prior.body || prior.title)) {
      cards.push(prior)
      skipped++
      continue
    }

    try {
      const { title, body } = await ocrCard(pngPath)
      cards.push({
        slug: img.slug,
        kind: img.kind,
        group: img.group,
        back: img.back,
        title,
        body,
        sourceUrl: img.url,
        ocrAt: new Date().toISOString(),
        relPath: img.relPath,
      })
      ocred++
      if ((ocred + skipped) % 5 === 0) {
        console.log(`  ${ocred + skipped}/${images.length} (${ocred} new, ${skipped} cached)`)
      }
    } catch (err) {
      failed++
      console.warn(`  OCR failed for ${img.relPath}: ${err instanceof Error ? err.message : err}`)
    }
  }

  await closeOcrWorker()

  const manifest: MissionCardOcrManifest = {
    generatedAt: new Date().toISOString(),
    cards,
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(manifest, null, 2))

  return { ocred, skipped, missing, failed, manifest }
}

async function main() {
  console.log('OCRing 11e mission cards from .local/brain-input/mission-cards/11th ...')
  const result = await ocrMissionCards()
  console.log(
    `\nDone. ${result.ocred} OCR'd, ${result.skipped} from cache, ${result.missing} missing PNGs, ${result.failed} failed`,
  )
  console.log(`Wrote ${result.manifest.cards.length} entries to ocr.json`)
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false
  const urlPath = new URL(import.meta.url).pathname.replace(/^\//, '').toLowerCase()
  const argPath = process.argv[1].replace(/\\/g, '/').toLowerCase()
  return urlPath.endsWith(argPath) || argPath.endsWith(urlPath)
})()

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
