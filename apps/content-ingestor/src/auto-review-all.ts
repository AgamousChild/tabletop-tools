/**
 * Walk .local/ingest/<source_id>/drafts/<itemSlug>/ subdirectories and run
 * auto-review on each one. Aggregates verdicts across all drafts.
 *
 * Usage: node --import tsx src/auto-review-all.ts
 */
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { autoReviewDrafts, REVIEWER_CONFIG } from './review/auto-review'
import { DEFAULT_CONFIG } from './types'

/**
 * Find draft directories created by process-queue.ts — they live at
 * `<dataDir>/<source_id>/drafts/<itemSlug>/`. Skip the older flat-layout
 * directories from prior sessions (they're a different lifecycle).
 */
function findProcessQueueDraftDirs(baseDir: string): string[] {
  const out: string[] = []
  let sources: string[]
  try {
    sources = readdirSync(baseDir)
  } catch {
    return out
  }
  for (const src of sources) {
    const draftsRoot = path.join(baseDir, src, 'drafts')
    let items: string[]
    try {
      items = readdirSync(draftsRoot)
    } catch {
      continue
    }
    for (const item of items) {
      const full = path.join(draftsRoot, item)
      try {
        if (statSync(full).isDirectory()) {
          const hasMd = readdirSync(full).some((f) => f.endsWith('.md'))
          if (hasMd) out.push(full)
        }
      } catch {
        // skip
      }
    }
  }
  return out
}

const root = DEFAULT_CONFIG.dataDir
const dirs = findProcessQueueDraftDirs(root)
console.log(`Found ${dirs.length} process-queue draft directories under ${root}`)

let totalApproved = 0
let totalRejected = 0
let totalNeedFix = 0
let totalErrors = 0

for (const dir of dirs) {
  console.log(`\n--- ${path.relative(root, dir)} ---`)
  const r = await autoReviewDrafts(dir, REVIEWER_CONFIG)
  totalApproved += r.approved
  totalRejected += r.rejected
  totalNeedFix += r.needsFix
  totalErrors += r.errors
}

console.log(
  `\n=== TOTAL: ${totalApproved} approved · ${totalRejected} rejected · ${totalNeedFix} need fix · ${totalErrors} errors ===`,
)
