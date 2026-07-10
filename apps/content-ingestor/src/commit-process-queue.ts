/**
 * Commit-process-queue: walk the same nested layout auto-review-all uses
 * (`<dataDir>/<source_id>/drafts/<itemSlug>/*.md`), load all status='approved'
 * drafts, and append them as new community: brain nodes in community.json.
 *
 * Differs from the original `commit` CLI command only in directory recursion —
 * uses the same brain-node shape, dedup, and screenshot copy semantics.
 *
 * Usage: node --import tsx src/commit-process-queue.ts
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { slugify } from '@tabletop-tools/server-core'

import { markdownToDraft } from './drafts/store'
import type { DraftNode } from './types'
import { DEFAULT_CONFIG } from './types'

interface BrainNode {
  id: string
  layer: 'community'
  category: string
  title: string
  content: string
  summary: string
  sources: Array<{ type: 'manual'; title: string; retrievedAt: string }>
  refs: string[]
  version: number
  keywords: string[]
}

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

function loadDraftsSync(dir: string): Array<{ path: string; draft: DraftNode }> {
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  const results: Array<{ path: string; draft: DraftNode }> = []
  for (const file of files) {
    const filePath = path.join(dir, file)
    try {
      const markdown = readFileSync(filePath, 'utf-8')
      const draft = markdownToDraft(markdown)
      results.push({ path: filePath, draft })
    } catch (err) {
      console.warn(`Parse failed: ${filePath}: ${String(err)}`)
    }
  }
  return results
}

const dataDir = DEFAULT_CONFIG.dataDir
const brainNodesDir = DEFAULT_CONFIG.brainNodesDir
const draftDirs = findProcessQueueDraftDirs(dataDir)
console.log(`Found ${draftDirs.length} draft directories`)

const allDrafts: Array<{ path: string; draft: DraftNode }> = []
for (const dir of draftDirs) {
  allDrafts.push(...loadDraftsSync(dir))
}
console.log(`Loaded ${allDrafts.length} draft files`)

const approved = allDrafts.filter(({ draft }) => draft.status === 'approved')
console.log(`${approved.length} are status='approved'`)

const communityJsonPath = path.join(brainNodesDir, 'community.json')
const existing: BrainNode[] = existsSync(communityJsonPath)
  ? (JSON.parse(readFileSync(communityJsonPath, 'utf-8')) as BrainNode[])
  : []
const existingIds = new Set(existing.map((n) => n.id))
console.log(`Existing community.json has ${existing.length} nodes`)

const communityMediaDir = path.join(brainNodesDir, '..', 'community')

let committed = 0
let screenshotsUploaded = 0
let skippedDuplicate = 0

for (const { draft } of approved) {
  const id = `community:${slugify(draft.title)}`
  if (existingIds.has(id)) {
    skippedDuplicate++
    continue
  }
  const node: BrainNode = {
    id,
    layer: 'community',
    category: draft.category,
    title: draft.title,
    content: draft.content,
    summary: draft.summary,
    sources: [
      {
        type: 'manual',
        title: draft.sourceChannel ?? 'Community Content',
        retrievedAt: new Date().toISOString(),
      },
    ],
    refs: [],
    version: 1,
    keywords: draft.keywords,
  }
  existing.push(node)
  existingIds.add(id)
  committed++

  if (draft.screenshots.length > 0) {
    mkdirSync(communityMediaDir, { recursive: true })
    for (const s of draft.screenshots) {
      const dest = path.join(communityMediaDir, path.basename(s.file))
      try {
        copyFileSync(s.file, dest)
        screenshotsUploaded++
      } catch {
        // screenshot missing — skip silently
      }
    }
  }
}

if (committed > 0) {
  mkdirSync(brainNodesDir, { recursive: true })
  writeFileSync(communityJsonPath, JSON.stringify(existing, null, 2), 'utf-8')
}

console.log(
  `\n=== ${committed} new community brain nodes appended · ${skippedDuplicate} skipped (duplicate id) · ${screenshotsUploaded} screenshots copied ===`,
)
console.log(`community.json now has ${existing.length} total nodes`)
console.log(`Written to: ${communityJsonPath}`)
