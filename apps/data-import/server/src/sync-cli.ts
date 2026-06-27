/**
 * CLI runner for the data-import sync.
 *
 * Runs the same `runSync` pipeline the Worker used to expose at /sync, but in
 * Node — no Worker CPU/wall-clock cap, no 1102 errors, real stack traces.
 * Captures every R2 write into an in-memory map, then dumps the captured
 * objects to `.local/data-import-output/{key}` under the repo root. The
 * companion GitHub Action (`sync-data.yml`) uploads each file to R2 via
 * `wrangler r2 object put --remote`.
 *
 * Usage (from apps/data-import/server):
 *   pnpm exec tsx src/sync-cli.ts
 *
 * Env:
 *   GITHUB_TOKEN — optional but recommended (raises GitHub API rate limits
 *                   for the BSData + MFM tree/commit lookups).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runSync } from './lib/sync'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface BufferedR2 {
  put(key: string, value: string | ArrayBuffer): Promise<unknown>
  get(key: string): Promise<null>
}

const writes = new Map<string, string | ArrayBuffer>()

const bucket: BufferedR2 = {
  async put(key, value) {
    writes.set(key, value)
    return {}
  },
  // Force a full re-fetch every run — the CLI doesn't carry the previous R2
  // state, so skip-on-unchanged can't engage. The cron is weekly so re-
  // fetching every time costs nothing and keeps the runner stateless.
  async get() {
    return null
  },
}

// apps/data-import/server/src → ../../../.. → repo root
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')
const OUT_DIR = join(REPO_ROOT, '.local', 'data-import-output')

async function main() {
  console.log('[sync-cli] starting full sync (force=true)')
  const start = Date.now()

  // Cast through unknown so the CLI doesn't depend on
  // @cloudflare/workers-types just for the R2Bucket shape. We satisfy the
  // subset (put + get) runSync actually touches.
  const result = await runSync(
    bucket as unknown as R2Bucket,
    process.env['GITHUB_TOKEN'],
    true,
    undefined,
  )

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`[sync-cli] sync finished in ${elapsedSec}s`)
  console.log(`[sync-cli] R2 writes captured: ${writes.size}`)
  console.log(
    `[sync-cli] summary: ${JSON.stringify(
      {
        success: result.success,
        manifestVersion: result.manifest.version,
        wahapediaTables: Object.keys(result.manifest.wahapedia?.recordCounts ?? {}).length,
        bsdata: result.manifest.bsdata,
        mfm: result.manifest.mfm,
        missions: result.manifest.missions,
        stageTimings: result.stageTimings,
        producer: result.producer,
        contentIdValidation: result.contentIdValidation,
        skipped: result.skipped,
        errorCount: result.errors.length,
      },
      null,
      2,
    )}`,
  )

  if (result.errors.length > 0) {
    console.log(`[sync-cli] first ${Math.min(10, result.errors.length)} warnings:`)
    for (const e of result.errors.slice(0, 10)) console.log(`  ${e}`)
    if (result.errors.length > 10) {
      console.log(`  ...and ${result.errors.length - 10} more`)
    }
  }

  // Dump captured R2 puts to disk for the workflow's upload step.
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`[sync-cli] writing ${writes.size} files to ${OUT_DIR}`)
  for (const [key, value] of writes) {
    const path = join(OUT_DIR, key)
    mkdirSync(dirname(path), { recursive: true })
    const data = typeof value === 'string' ? value : Buffer.from(value)
    writeFileSync(path, data)
  }
  console.log('[sync-cli] done')

  // Surface a non-zero exit when the pipeline reported `success: false`
  // (errors weren't fatal but the workflow should mark itself as a failure
  // for visibility). Empty-errors stays exit 0.
  if (!result.success) process.exit(1)
}

main().catch((err) => {
  console.error('[sync-cli] failed:', err)
  process.exit(1)
})
