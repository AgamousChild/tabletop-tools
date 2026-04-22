import type { Node, NodeCategory } from './model'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MassageStats {
  inputCount: number
  outputCount: number
  droppedPhantom: number
  droppedShortContent: number
  droppedDuplicateSummary: number
}

export interface MassageResult {
  nodes: Node[]
  stats: MassageStats
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Title pattern for stat-line phantom nodes:
 * only digits, plus signs, hyphens (including non-breaking \u2011),
 * double-quotes, dots, and whitespace.
 *
 * Examples that match (phantoms to drop):
 *   "+"  "10\" 2+ 6+"  "-3+ 7+"  "6\" 6+ 7+"
 */
const STAT_LINE_TITLE_RE = /^[\d\-\u2011+".\s]+$/

/**
 * Structural categories where short content is acceptable.
 * E.g. deployment zones may say "See PDF page image for diagram."
 */
const STRUCTURAL_CATEGORIES = new Set<NodeCategory>([
  'datasheet',
  'detachment-rule',
  'deployment-zone',
  'terrain-layout',
])

const SHORT_CONTENT_THRESHOLD = 20

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Cleans a list of nodes by removing phantom/malformed entries produced during
 * PDF and source parsing. Does NOT mutate the input array.
 *
 * Three passes:
 * 1. Drop stat-line title phantoms (wound roll table rows, stat blocks)
 * 2. Drop non-structural nodes with content shorter than 20 characters
 * 3. Drop duplicate summaries within the same category+factionId combination
 */
export function massage(nodes: Node[]): MassageResult {
  const inputCount = nodes.length
  let droppedPhantom = 0
  let droppedShortContent = 0
  let droppedDuplicateSummary = 0

  // Pass 1 — stat-line title phantoms
  const afterPass1: Node[] = []
  for (const node of nodes) {
    if (STAT_LINE_TITLE_RE.test(node.title)) {
      droppedPhantom++
    } else {
      afterPass1.push(node)
    }
  }

  // Pass 2 — short-content non-structural nodes
  const afterPass2: Node[] = []
  for (const node of afterPass1) {
    if (
      node.content.length < SHORT_CONTENT_THRESHOLD &&
      !STRUCTURAL_CATEGORIES.has(node.category)
    ) {
      droppedShortContent++
    } else {
      afterPass2.push(node)
    }
  }

  // Pass 3 — duplicate summaries within category+factionId
  const seen = new Set<string>()
  const afterPass3: Node[] = []
  for (const node of afterPass2) {
    // factionId may be undefined — treat undefined as the empty string so
    // nodes without a faction form their own dedup group
    const key = `${node.category}\0${node.factionId ?? ''}\0${node.summary}`
    if (seen.has(key)) {
      droppedDuplicateSummary++
    } else {
      seen.add(key)
      afterPass3.push(node)
    }
  }

  const outputCount = afterPass3.length

  console.log(
    `[massage] ${inputCount} in → ${outputCount} out\n` +
    `  Dropped: ${droppedPhantom} phantom, ${droppedShortContent} short-content, ${droppedDuplicateSummary} dup-summary`,
  )

  return {
    nodes: afterPass3,
    stats: {
      inputCount,
      outputCount,
      droppedPhantom,
      droppedShortContent,
      droppedDuplicateSummary,
    },
  }
}
