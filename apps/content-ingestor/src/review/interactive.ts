import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadDrafts, updateDraftStatus } from '../drafts/store'

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * List all subdirectories of baseDir that contain at least one .md file.
 */
export async function findDraftDirs(baseDir: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = readdirSync(baseDir)
  } catch {
    return []
  }

  const dirs: string[] = []

  for (const entry of entries) {
    const fullPath = join(baseDir, entry)
    try {
      const stat = statSync(fullPath)
      if (!stat.isDirectory()) continue

      const children = readdirSync(fullPath)
      const hasMd = children.some((f) => f.endsWith('.md'))
      if (hasMd) {
        dirs.push(fullPath)
      }
    } catch {
      // Skip entries we can't stat
    }
  }

  return dirs
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Interactively review all draft-status nodes found under dir.
 *
 * For each draft the reviewer sees: title, source URL, channel, confidence,
 * summary, a content excerpt, keywords, screenshot count, and a similarity
 * warning if the draft was flagged as similar to an existing brain node.
 *
 * Input keys:
 *   a  → approve (updateDraftStatus to 'approved')
 *   r  → reject  (updateDraftStatus to 'rejected')
 *   s  → skip    (leave as draft)
 *   q  → quit    (stop reviewing, return current counts)
 *
 * Invalid input re-prompts the same draft.
 */
export async function reviewDrafts(
  dir: string,
): Promise<{ approved: number; rejected: number; skipped: number }> {
  const counts = { approved: 0, rejected: 0, skipped: 0 }

  // Discover all draft directories
  const draftDirs = await findDraftDirs(dir)

  // Collect all draft-status entries across all directories
  const entries: Array<{ path: string; draft: import('../types').DraftNode }> = []
  for (const draftDir of draftDirs) {
    const loaded = await loadDrafts(draftDir)
    for (const item of loaded) {
      if (item.draft.status === 'draft') {
        entries.push(item)
      }
    }
  }

  if (entries.length === 0) {
    console.log('No drafts to review.')
    return counts
  }

  const rl = createInterface({ input, output })

  for (const { path, draft } of entries) {
    // ── Display draft ──────────────────────────────────────────────────
    console.log('\n' + '─'.repeat(60))
    console.log(`Title:      ${draft.title}`)
    console.log(`Source:     ${draft.sourceUrl}`)
    if (draft.sourceChannel) {
      console.log(`Channel:    ${draft.sourceChannel}`)
    }
    console.log(`Confidence: ${draft.confidence}`)
    console.log(`\nSummary:\n${draft.summary}`)
    console.log(`\nContent:\n${draft.content.slice(0, 200)}...`)
    console.log(`\nKeywords: ${draft.keywords.join(', ')}`)

    if (draft.screenshots.length > 0) {
      const captions = draft.screenshots.map((s) => s.caption).join('; ')
      console.log(`\nScreenshots: ${draft.screenshots.length} — ${captions}`)
    }

    if (draft.similarTo) {
      console.log(`\n⚠ Similar to existing node: ${draft.similarTo}`)
    }

    // ── Prompt until valid input ───────────────────────────────────────
    let done = false
    let quit = false

    while (!done) {
      const answer = await rl.question('\n[a]pprove / [r]eject / [s]kip / [q]uit: ')
      const choice = answer.trim().toLowerCase()

      switch (choice) {
        case 'a':
          await updateDraftStatus(path, 'approved')
          counts.approved++
          done = true
          break
        case 'r':
          await updateDraftStatus(path, 'rejected')
          counts.rejected++
          done = true
          break
        case 's':
          counts.skipped++
          done = true
          break
        case 'q':
          done = true
          quit = true
          break
        default:
          console.log('Invalid choice — please enter a, r, s, or q.')
      }
    }

    if (quit) break
  }

  rl.close()

  console.log(
    `\nReview complete: ${counts.approved} approved, ${counts.rejected} rejected, ${counts.skipped} skipped`,
  )

  return counts
}
