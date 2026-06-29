/**
 * Crop the 11e Chapter Approved Deployment Zone cards from a single scan.
 *
 * Input:  one JPG containing all 6 cards laid out 3 columns × 2 rows.
 *         Top row is upright; bottom row is rotated 180° because the cards
 *         were placed face-up the other way on the scanner bed.
 *
 * Output: one PNG per card under
 *         `apps/brain/server/.local/brain-input/cards/deployment-zone-images/`
 *         named `page-{1..6}.png`. Page numbers match the order in the
 *         brain parser's `DEPLOYMENT_ZONE_PAGE` map so the per-zone source
 *         attribution → R2 image lookup line up.
 *
 *         page-1 = HAMMER AND ANVIL       (top-left)
 *         page-2 = TIPPING POINT          (top-centre)
 *         page-3 = SWEEPING ENGAGEMENT    (top-right)
 *         page-4 = DAWN OF WAR            (bottom-left,  rotated 180°)
 *         page-5 = SEARCH AND DESTROY     (bottom-centre, rotated 180°)
 *         page-6 = CRUCIBLE OF BATTLE     (bottom-right, rotated 180°)
 *
 * Idempotent: skips files that already exist on disk. Pass `--force` to
 * overwrite. Per Rule 4, the work is exposed as `cropDeploymentZoneImages()`
 * so it can be called from any context; this file is just the CLI wrapper.
 *
 * The output directory is under `.local/` and is gitignored — these are GW
 * images and MUST NOT be committed (CLAUDE.md data-boundary rule).
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import sharp from 'sharp'

// ── Defaults ────────────────────────────────────────────────────────────────

/** Default source path on Micah's local disk. */
export const DEFAULT_SOURCE = 'C:/Users/micah/OneDrive/Documents/2026_06_29/IMG_0001.jpg'

/** Default output directory (under brain/server, .local is gitignored). */
export const DEFAULT_OUT_DIR = '.local/brain-input/cards/deployment-zone-images'

/**
 * Crop grid. The scan is ~1280×1656 (taller than wide), with the 3×2 grid
 * filling roughly the whole sheet. Per-cell dimensions are computed from the
 * source image at runtime — these ratios control where each card sits inside
 * the sheet, with a small inner-bleed trim to drop the scanner border / glue
 * margin between cards.
 *
 * If the output PNGs are clipped or include too much border, adjust the trim
 * fractions below and re-run with `--force`. The 0.012 / 0.015 defaults were
 * sized to keep ~1.2-1.5% of each cell off all sides; tune as needed.
 */
export interface CropSpec {
  /** 3-column × 2-row grid. */
  cols: number
  rows: number
  /** Fraction of the source image to trim before slicing (each side). */
  outerTrimLeftPct: number
  outerTrimRightPct: number
  outerTrimTopPct: number
  outerTrimBottomPct: number
  /** Fraction of each cell to trim (each side) — drops inter-card margins. */
  innerTrimPct: number
}

export const DEFAULT_CROP_SPEC: CropSpec = {
  cols: 3,
  rows: 2,
  outerTrimLeftPct: 0.0,
  outerTrimRightPct: 0.0,
  outerTrimTopPct: 0.0,
  outerTrimBottomPct: 0.0,
  innerTrimPct: 0.012,
}

/**
 * Order in which we write the 6 page PNGs. Top row left→right then bottom
 * row left→right. The bottom row gets rotated 180° before saving.
 *
 * page numbers (1-based) match `DEPLOYMENT_ZONE_PAGE` in the brain parser.
 */
interface CardSlot {
  page: number
  slug: string
  col: number // 0..cols-1
  row: number // 0..rows-1
  rotate180: boolean
}

export const CARD_SLOTS: readonly CardSlot[] = [
  { page: 1, slug: 'hammer-and-anvil', col: 0, row: 0, rotate180: false },
  { page: 2, slug: 'tipping-point', col: 1, row: 0, rotate180: false },
  { page: 3, slug: 'sweeping-engagement', col: 2, row: 0, rotate180: false },
  { page: 4, slug: 'dawn-of-war', col: 0, row: 1, rotate180: true },
  { page: 5, slug: 'search-and-destroy', col: 1, row: 1, rotate180: true },
  { page: 6, slug: 'crucible-of-battle', col: 2, row: 1, rotate180: true },
] as const

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
  spec?: CropSpec
  force?: boolean
  log?: (msg: string) => void
}

/**
 * Crop all 6 cards out of the source scan. Resolves with a per-page status
 * map. Throws if the source file doesn't exist or sharp fails to read it.
 */
export async function cropDeploymentZoneImages(opts: CropOptions = {}): Promise<CropResult> {
  const source = opts.source ?? DEFAULT_SOURCE
  const outDir = resolve(opts.outDir ?? DEFAULT_OUT_DIR)
  const spec = opts.spec ?? DEFAULT_CROP_SPEC
  const force = opts.force ?? false
  const log = opts.log ?? ((msg) => console.log(msg))

  if (!existsSync(source)) {
    throw new Error(`Source image not found: ${source}`)
  }

  await mkdir(outDir, { recursive: true })
  await mkdir(dirname(outDir), { recursive: true })

  // Read metadata to compute pixel-space crop coords from fractional spec.
  const meta = await sharp(source).metadata()
  const srcW = meta.width
  const srcH = meta.height
  if (!srcW || !srcH) {
    throw new Error(`Could not read dimensions of source image: ${source}`)
  }

  // Apply outer trim → sheet area that contains the 3×2 grid.
  const sheetLeft = Math.round(srcW * spec.outerTrimLeftPct)
  const sheetTop = Math.round(srcH * spec.outerTrimTopPct)
  const sheetRight = Math.round(srcW * (1 - spec.outerTrimRightPct))
  const sheetBottom = Math.round(srcH * (1 - spec.outerTrimBottomPct))
  const sheetW = sheetRight - sheetLeft
  const sheetH = sheetBottom - sheetTop

  const cellW = Math.floor(sheetW / spec.cols)
  const cellH = Math.floor(sheetH / spec.rows)

  log(
    `Source ${srcW}×${srcH} → sheet ${sheetW}×${sheetH} (offset ${sheetLeft},${sheetTop}) → cell ${cellW}×${cellH}`,
  )

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

    // Compute cell origin, then apply inner trim to drop card margins.
    const cellLeft = sheetLeft + slot.col * cellW
    const cellTop = sheetTop + slot.row * cellH
    const innerTrimX = Math.round(cellW * spec.innerTrimPct)
    const innerTrimY = Math.round(cellH * spec.innerTrimPct)
    const extractLeft = cellLeft + innerTrimX
    const extractTop = cellTop + innerTrimY
    const extractW = cellW - innerTrimX * 2
    const extractH = cellH - innerTrimY * 2

    let pipeline = sharp(source).extract({
      left: extractLeft,
      top: extractTop,
      width: extractW,
      height: extractH,
    })
    if (slot.rotate180) {
      pipeline = pipeline.rotate(180)
    }
    await pipeline.png().toFile(outPath)

    pages.push({ page: slot.page, slug: slot.slug, path: outPath, status: 'written' })
    written++
    log(
      `  WRITE page-${slot.page}.png (${slot.slug})${slot.rotate180 ? ' [rot 180°]' : ''} ${extractW}×${extractH}`,
    )
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

  console.log('Cropping 11e deployment-zone card images...\n')
  await cropDeploymentZoneImages({ source, outDir, force })
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
