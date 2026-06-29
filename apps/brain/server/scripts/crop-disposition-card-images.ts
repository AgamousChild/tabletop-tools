/**
 * Crop the 11e Chapter Approved Force Disposition cards out of IMG_0007.pdf.
 *
 * Input:  one PDF (`IMG_0007.pdf`) — 3 pages at 400 DPI:
 *           page 0: 4 cards stacked top-to-bottom (priority-assets,
 *                   reconnaissance, disruption, purge-the-foe)
 *           page 1: 1 card in the upper-left quadrant (take-and-hold)
 *           page 2: blank
 *
 * Output: one PNG per card under
 *         `apps/brain/server/.local/brain-input/cards/force-disposition-images/`
 *         named `page-{1..5}.png` (1-based). Page numbers match the order in
 *         the brain parser's `FORCE_DISPOSITION_PAGE` map so the per-card
 *         source attribution → R2 image lookup line up:
 *
 *           page-1 = priority-assets
 *           page-2 = purge-the-foe
 *           page-3 = disruption
 *           page-4 = reconnaissance
 *           page-5 = take-and-hold
 *
 * Idempotent: skips files that already exist on disk. Pass `--force` to
 * overwrite. Per Rule 4, the work is exposed as `cropDispositionCardImages()`
 * so it can be called from any context; this file is just the CLI wrapper.
 *
 * The output directory is under `.local/` and is gitignored — these are GW
 * images and MUST NOT be committed (CLAUDE.md data-boundary rule).
 *
 * @see apps/brain/server/src/lib/parsers/force-dispositions.ts —
 *   `FORCE_DISPOSITION_PAGE` is the lock-step page mapping. Keep that map
 *   and the slot order below in sync.
 * @see apps/brain/server/scripts/upload-disposition-card-images.ts —
 *   uploads the cropped PNGs to R2.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { pdf } from 'pdf-to-img'
import sharp from 'sharp'

// ── Defaults ────────────────────────────────────────────────────────────────

/** Default source path on Micah's local disk. */
export const DEFAULT_SOURCE = 'C:/Users/micah/OneDrive/Documents/2026_06_29/IMG_0007.pdf'

/** Default output directory (under brain/server, .local is gitignored). */
export const DEFAULT_OUT_DIR = '.local/brain-input/cards/force-disposition-images'

/**
 * Per-card crop spec. Coordinates are FRACTIONS of the rendered page so the
 * spec is independent of DPI. The renderer always rasterises at the same
 * scale so cell heights stay proportional, but expressing the spec as
 * fractions means it survives a future DPI bump.
 *
 * Page 0 layout: 4 cards stacked top to bottom, full-width. Card height is
 * approximately 1/4 of the page. The fractions below leave small inter-card
 * gutters so we don't bleed into the next card's art.
 *
 * Page 1 layout: 1 card in the upper-left quadrant. Width is ~88% of page
 * width (the card occupies most of the row), height is ~28% (single card
 * with whitespace below).
 */
interface CardSlot {
  /** 1-based output page number. */
  page: number
  /** Disposition slug for logging/sanity. */
  slug: string
  /** 0-based PDF page index this card lives on. */
  pdfPage: number
  /** Fractional crop box on that PDF page. */
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
}

/**
 * Card slots — verified against `IMG_0007.pdf` rendered at 400 DPI
 * (3400×4400 ≈ 8.5×11" landscape).
 *
 * Page 0 has 4 cards spanning y ≈ 0..1100, 1080..2100, 2090..3120, 3110..4180
 * — almost-but-not-exactly quarter slices. The fractions below match those
 * boundaries with a small downward bias (the bottom card extends slightly
 * past the page bottom).
 *
 * Page 1 has 1 card in the top-left quadrant, ~3000px wide and ~1200px tall.
 */
export const CARD_SLOTS: readonly CardSlot[] = [
  {
    page: 1,
    slug: 'priority-assets',
    pdfPage: 0,
    leftPct: 0,
    topPct: 60 / 4400,
    widthPct: 1,
    heightPct: (1100 - 60) / 4400,
  },
  {
    page: 2,
    slug: 'purge-the-foe',
    pdfPage: 0,
    leftPct: 0,
    topPct: 3110 / 4400,
    widthPct: 1,
    heightPct: (4180 - 3110) / 4400,
  },
  {
    page: 3,
    slug: 'disruption',
    pdfPage: 0,
    leftPct: 0,
    topPct: 2090 / 4400,
    widthPct: 1,
    heightPct: (3120 - 2090) / 4400,
  },
  {
    page: 4,
    slug: 'reconnaissance',
    pdfPage: 0,
    leftPct: 0,
    topPct: 1080 / 4400,
    widthPct: 1,
    heightPct: (2100 - 1080) / 4400,
  },
  {
    page: 5,
    slug: 'take-and-hold',
    pdfPage: 1,
    leftPct: 0,
    topPct: 0,
    widthPct: 3000 / 3400,
    heightPct: 1200 / 4400,
  },
] as const

/** PDF render scale. 400 DPI ≈ scale 5.5 against the 72 DPI default. */
export const DEFAULT_RENDER_SCALE = 400 / 72

// ── Implementation ───────────────────────────────────────────────────────────

export interface CropResult {
  written: number
  skipped: number
  outDir: string
  pages: { page: number; slug: string; path: string; status: 'written' | 'skipped' }[]
}

export interface CropOptions {
  source?: string
  outDir?: string
  /** PDF render scale (default: 400 DPI ≈ scale 5.5). */
  scale?: number
  force?: boolean
  log?: (msg: string) => void
}

/**
 * Render `IMG_0007.pdf` to per-page PNGs and crop out the 5 force-disposition
 * card images. Returns per-page status.
 *
 * The PDF is rendered lazily: each output page only triggers a render of the
 * PDF page it lives on. We cache rendered PDF pages in memory across the
 * 5-card loop so the page-0 render only happens once.
 */
export async function cropDispositionCardImages(opts: CropOptions = {}): Promise<CropResult> {
  const source = opts.source ?? DEFAULT_SOURCE
  const outDir = resolve(opts.outDir ?? DEFAULT_OUT_DIR)
  const scale = opts.scale ?? DEFAULT_RENDER_SCALE
  const force = opts.force ?? false
  const log = opts.log ?? ((msg) => console.log(msg))

  if (!existsSync(source)) {
    throw new Error(`Source PDF not found: ${source}`)
  }

  await mkdir(outDir, { recursive: true })
  await mkdir(dirname(outDir), { recursive: true })

  // Short-circuit when every output already exists and force=false. Avoids
  // rendering the PDF (a cold pdf-to-img invocation takes a few seconds).
  const allExist = CARD_SLOTS.every((slot) => existsSync(`${outDir}/page-${slot.page}.png`))
  if (allExist && !force) {
    const pages = CARD_SLOTS.map((slot) => ({
      page: slot.page,
      slug: slot.slug,
      path: `${outDir}/page-${slot.page}.png`,
      status: 'skipped' as const,
    }))
    log(`All ${CARD_SLOTS.length} pages already exist (use --force to overwrite).`)
    return { written: 0, skipped: CARD_SLOTS.length, outDir, pages }
  }

  // pdf-to-img returns Buffers (PNG-encoded). Cache per pdfPage so we only
  // pay the rasterise cost once across multiple card slots on the same page.
  const pageCache = new Map<number, Buffer>()

  async function renderPdfPage(pdfPage0: number): Promise<Buffer> {
    const cached = pageCache.get(pdfPage0)
    if (cached) return cached
    const buf = await readFile(source)
    const doc = await pdf(buf, { scale })
    // doc is 1-indexed in pdf-to-img; our pdfPage is 0-based.
    const png = await doc.getPage(pdfPage0 + 1)
    pageCache.set(pdfPage0, png)
    return png
  }

  const pages: CropResult['pages'] = []
  let written = 0
  let skipped = 0

  for (const slot of CARD_SLOTS) {
    const outPath = `${outDir}/page-${slot.page}.png`
    if (!force && existsSync(outPath)) {
      pages.push({ page: slot.page, slug: slot.slug, path: outPath, status: 'skipped' })
      skipped++
      log(`  SKIP  page-${slot.page}.png (${slot.slug}) — exists`)
      continue
    }

    const pdfPng = await renderPdfPage(slot.pdfPage)
    const meta = await sharp(pdfPng).metadata()
    const w = meta.width
    const h = meta.height
    if (!w || !h) {
      throw new Error(
        `Could not read dimensions of rendered PDF page ${slot.pdfPage} for ${slot.slug}`,
      )
    }

    // Clamp to integer pixel coords, and clamp to page bounds so a slot that
    // extends past the rendered page doesn't blow up sharp's extract().
    const left = Math.max(0, Math.round(w * slot.leftPct))
    const top = Math.max(0, Math.round(h * slot.topPct))
    let width = Math.round(w * slot.widthPct)
    let height = Math.round(h * slot.heightPct)
    width = Math.min(width, w - left)
    height = Math.min(height, h - top)

    await sharp(pdfPng).extract({ left, top, width, height }).png().toFile(outPath)

    pages.push({ page: slot.page, slug: slot.slug, path: outPath, status: 'written' })
    written++
    log(`  WRITE page-${slot.page}.png (${slot.slug}) ${width}×${height}`)
  }

  log(`\nDone. ${written} written, ${skipped} skipped. Out: ${outDir}`)
  return { written, skipped, outDir, pages }
}

// ── CLI wrapper ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  const sourceIdx = process.argv.indexOf('--source')
  const outDirIdx = process.argv.indexOf('--out-dir')
  const source = sourceIdx >= 0 ? process.argv[sourceIdx + 1] : undefined
  const outDir = outDirIdx >= 0 ? process.argv[outDirIdx + 1] : undefined

  console.log('Cropping 11e force-disposition card images...\n')
  await cropDispositionCardImages({ source, outDir, force })
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
