import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { slugify } from '@tabletop-tools/server-core'

import { loadDrafts } from '../drafts/store'
import { findDraftDirs } from '../review/interactive'

// ── Brain node shape ──────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Load the existing community.json from brainNodesDir, or return an empty
 * array if the file does not exist.
 */
function loadCommunityNodes(brainNodesDir: string): BrainNode[] {
  const filePath = join(brainNodesDir, 'community.json')
  if (!existsSync(filePath)) return []
  const raw = readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as BrainNode[]
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Commit all approved draft nodes to the brain graph.
 *
 * Steps:
 * 1. Discover all draft directories under ingestDir.
 * 2. Load every draft from every directory.
 * 3. Filter to status === 'approved'.
 * 4. Load (or initialise) community.json from brainNodesDir.
 * 5. For each approved draft, generate a community:<slug> ID and skip
 *    duplicates already present in community.json.
 * 6. Copy any screenshot files to <brainNodesDir>/../community/.
 * 7. Append new nodes to community.json and write it back.
 *
 * Returns the count of newly committed nodes and screenshots copied.
 */
export async function commitApprovedNodes(
  ingestDir: string,
  brainNodesDir: string,
): Promise<{ committed: number; screenshotsUploaded: number }> {
  // 1. Find all draft dirs
  const draftDirs = await findDraftDirs(ingestDir)

  // 2. Load all drafts
  const allDrafts: Array<Awaited<ReturnType<typeof loadDrafts>>[number]> = []
  for (const dir of draftDirs) {
    const loaded = await loadDrafts(dir)
    allDrafts.push(...loaded)
  }

  // 3. Filter to approved only
  const approved = allDrafts.filter(({ draft }) => draft.status === 'approved')

  if (approved.length === 0) {
    console.log('Committed 0 nodes, uploaded 0 screenshots')
    return { committed: 0, screenshotsUploaded: 0 }
  }

  // 4. Load existing community nodes
  const existingNodes = loadCommunityNodes(brainNodesDir)

  // 5. Build ID set for dedup
  const existingIds = new Set(existingNodes.map((n) => n.id))

  // Community screenshot output directory (sibling of brainNodesDir)
  const communityMediaDir = join(brainNodesDir, '..', 'community')

  let committed = 0
  let screenshotsUploaded = 0

  for (const { draft } of approved) {
    const id = `community:${slugify(draft.title)}`

    // 5b. Skip duplicates
    if (existingIds.has(id)) continue

    // 5c. Build brain node
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

    // 5d. Add to array
    existingNodes.push(node)
    existingIds.add(id)
    committed++

    // 5e. Copy screenshots
    if (draft.screenshots.length > 0) {
      mkdirSync(communityMediaDir, { recursive: true })

      for (const screenshot of draft.screenshots) {
        const destFile = join(communityMediaDir, basename(screenshot.file))
        try {
          copyFileSync(screenshot.file, destFile)
          screenshotsUploaded++
        } catch {
          // Screenshot file may no longer exist — skip silently
        }
      }
    }
  }

  // 7. Write updated community.json (only if anything was added)
  if (committed > 0) {
    mkdirSync(brainNodesDir, { recursive: true })
    writeFileSync(
      join(brainNodesDir, 'community.json'),
      JSON.stringify(existingNodes, null, 2),
      'utf-8',
    )
  }

  console.log(`Committed ${committed} nodes, uploaded ${screenshotsUploaded} screenshots`)
  return { committed, screenshotsUploaded }
}
