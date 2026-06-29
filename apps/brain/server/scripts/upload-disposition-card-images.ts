/**
 * Upload the 5 cropped 11e force-disposition PNGs to R2.
 *
 * Reads from `.local/brain-input/cards/force-disposition-images/page-{1..5}.png`
 * (output of `scripts/crop-disposition-card-images.ts`) and pushes each to
 * `pages/ca11-force-dispositions/page-N.png` in the `tabletop-tools-brain`
 * bucket.
 *
 * The `pages/ca11-force-dispositions/` prefix matches the slugified source
 * title that `lib/parsers/force-dispositions.ts::buildForceDispositionNodes`
 * emits on each node's source, so the brain client's
 * `/pages/:pdfName/page-:n.png` route resolves correctly.
 *
 * IMPORTANT: passes `--remote` per CLAUDE.md ("wrangler r2 object put
 * defaults to LOCAL — always pass --remote for production R2"). Without it
 * the upload silently lands in the local Wrangler emulator.
 *
 * Per Rule 4, the work is exposed as `uploadDispositionCardImages()` for use
 * from any context; this file is just the CLI wrapper. Micah runs the CLI
 * after the crop step.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Config ──────────────────────────────────────────────────────────────────

export const DEFAULT_BUCKET = 'tabletop-tools-brain'
export const DEFAULT_R2_PREFIX = 'pages/ca11-force-dispositions'
export const DEFAULT_LOCAL_DIR = '.local/brain-input/cards/force-disposition-images'
export const PAGE_COUNT = 5

// ── Implementation ───────────────────────────────────────────────────────────

export interface UploadResult {
  uploaded: number
  failed: number
  missing: number
  details: {
    page: number
    localPath: string
    r2Key: string
    status: 'uploaded' | 'failed' | 'missing'
  }[]
}

export interface UploadOptions {
  /** Bucket name (default: `tabletop-tools-brain`). */
  bucket?: string
  /** R2 key prefix (default: `pages/ca11-force-dispositions`). */
  r2Prefix?: string
  /** Local directory containing `page-{1..5}.png` (default: `.local/...`). */
  localDir?: string
  /** Page count (default: 5, the fixed-size 11e force-disposition deck). */
  pageCount?: number
  /**
   * Override the wrangler command. Defaults to the spawned command using
   * `npx wrangler ...`. Test seam — when set, the function calls this
   * function for each upload rather than spawning a subprocess.
   */
  runUpload?: (args: { bucket: string; r2Key: string; localPath: string }) => {
    status: number
    stderr?: string
  }
  log?: (msg: string) => void
}

/**
 * Upload every cropped page PNG to R2. Idempotent at the R2 level (re-running
 * just overwrites the object). Missing local pages are skipped with a warning
 * — the crop script must be run first.
 */
export function uploadDispositionCardImages(opts: UploadOptions = {}): UploadResult {
  const bucket = opts.bucket ?? DEFAULT_BUCKET
  const r2Prefix = opts.r2Prefix ?? DEFAULT_R2_PREFIX
  const localDir = resolve(opts.localDir ?? DEFAULT_LOCAL_DIR)
  const pageCount = opts.pageCount ?? PAGE_COUNT
  const log = opts.log ?? ((msg) => console.log(msg))
  const runUpload =
    opts.runUpload ??
    (({ bucket: b, r2Key, localPath }: { bucket: string; r2Key: string; localPath: string }) => {
      // `--remote` is critical: without it wrangler writes to the local
      // emulator and "everything looks fine" until you check prod.
      // See CLAUDE.md → Environment + Operational Gotchas.
      const result = spawnSync(
        'npx',
        [
          'wrangler',
          'r2',
          'object',
          'put',
          `${b}/${r2Key}`,
          '--remote',
          '--file',
          localPath,
          '--content-type',
          'image/png',
        ],
        { stdio: 'pipe', encoding: 'utf-8', shell: true },
      )
      return { status: result.status ?? 1, stderr: result.stderr || undefined }
    })

  const details: UploadResult['details'] = []
  let uploaded = 0
  let failed = 0
  let missing = 0

  for (let page = 1; page <= pageCount; page++) {
    const localPath = `${localDir}/page-${page}.png`
    const r2Key = `${r2Prefix}/page-${page}.png`

    if (!existsSync(localPath)) {
      log(`  MISSING page-${page}.png (run crop-disposition-card-images.ts first)`)
      details.push({ page, localPath, r2Key, status: 'missing' })
      missing++
      continue
    }

    const { status, stderr } = runUpload({ bucket, r2Key, localPath })
    if (status === 0) {
      log(`  UPLOADED ${r2Key}`)
      details.push({ page, localPath, r2Key, status: 'uploaded' })
      uploaded++
    } else {
      log(`  FAILED   ${r2Key} (exit ${status})${stderr ? `\n    ${stderr.trim()}` : ''}`)
      details.push({ page, localPath, r2Key, status: 'failed' })
      failed++
    }
  }

  log(`\nDone. ${uploaded} uploaded, ${failed} failed, ${missing} missing.`)
  return { uploaded, failed, missing, details }
}

// ── CLI wrapper ──────────────────────────────────────────────────────────────

function main(): void {
  console.log(
    `Uploading 11e force-disposition PNGs → r2://${DEFAULT_BUCKET}/${DEFAULT_R2_PREFIX}/\n`,
  )
  const result = uploadDispositionCardImages()
  if (result.failed > 0 || result.missing > 0) process.exit(1)
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false
  const urlPath = new URL(import.meta.url).pathname.replace(/^\//, '').toLowerCase()
  const argPath = process.argv[1].replace(/\\/g, '/').toLowerCase()
  return urlPath.endsWith(argPath) || argPath.endsWith(urlPath)
})()

if (invokedDirectly) {
  try {
    main()
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
