import type { Node, NodeCategory } from './model'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MassageStats {
  inputCount: number
  outputCount: number
  droppedPhantom: number
  droppedShortContent: number
  droppedDuplicateSummary: number
  flaggedContentInferred: number
  flaggedPdfInvalid: number
  flaggedOrphan: number
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
 * Cleans and validates a list of nodes produced during PDF and source parsing.
 * Does NOT mutate the input array or its node objects.
 *
 * Six passes:
 * 1. Drop stat-line title phantoms (wound roll table rows, stat blocks)
 * 2. Drop non-structural nodes with content shorter than 20 characters
 * 3. Drop duplicate summaries within the same category+factionId combination
 * 4. Flag nodes whose content is just an echo of the title or is too short
 * 5. Flag nodes with invalid PDF bounding-box coordinates
 * 6. Flag nodes whose parent reference (datasheetId / detachmentId) is dangling
 */
export function massage(nodes: Node[]): MassageResult {
  const inputCount = nodes.length
  let droppedPhantom = 0
  let droppedShortContent = 0
  let droppedDuplicateSummary = 0
  let flaggedContentInferred = 0
  let flaggedPdfInvalid = 0
  let flaggedOrphan = 0

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

  // Passes 4–6 mutate nodes — clone shallowly so we don't touch input objects
  const working: Node[] = afterPass3.map(n => ({ ...n, qualityFlags: n.qualityFlags ? [...n.qualityFlags] : [] }))

  // Pass 4 — content independence
  // A node whose content just echoes its title (or is very short) should use
  // the summary as content if the summary is richer.
  for (const node of working) {
    const contentNorm = node.content.trim().toLowerCase()
    const titleNorm = node.title.trim().toLowerCase()
    if (contentNorm === titleNorm || node.content.length < 30) {
      if (node.summary.length > node.content.length) {
        node.content = node.summary
      }
      node.qualityFlags!.push('content-inferred')
      flaggedContentInferred++
    }
  }

  // Pass 5 — PDF reference validation
  // Each PDF source with a page number should have a valid bounding box.
  for (const node of working) {
    let invalid = false
    for (const source of node.sources) {
      if (source.type !== 'pdf' || source.page === undefined) continue
      const { topPct, heightPct, leftPct, widthPct } = source
      if (
        (topPct !== undefined && (topPct < 0 || topPct > 100)) ||
        (heightPct !== undefined && heightPct < 0.5) ||
        (leftPct !== undefined && (leftPct < 0 || leftPct > 100)) ||
        (widthPct !== undefined && widthPct < 0.5)
      ) {
        invalid = true
        break
      }
    }
    if (invalid) {
      node.qualityFlags!.push('pdf-ref-invalid')
      flaggedPdfInvalid++
    }
  }

  // Pass 6 — hierarchy validation
  // Weapon / unit-ability nodes reference a datasheet; stratagem / enhancement
  // nodes reference a detachment. Flag dangling references.
  const idSet = new Set(working.map(n => n.id))
  for (const node of working) {
    let orphaned = false
    if (
      (node.category === 'weapon' || node.category === 'unit-ability') &&
      node.datasheetId !== undefined &&
      !idSet.has(node.datasheetId)
    ) {
      orphaned = true
    } else if (
      (node.category === 'stratagem' || node.category === 'enhancement') &&
      node.detachmentId !== undefined &&
      !idSet.has(node.detachmentId)
    ) {
      orphaned = true
    }
    if (orphaned) {
      node.qualityFlags!.push('orphan')
      flaggedOrphan++
    }
  }

  // Clean up — remove empty qualityFlags arrays so nodes without issues are clean
  for (const node of working) {
    if (node.qualityFlags!.length === 0) {
      node.qualityFlags = undefined
    }
  }

  const outputCount = working.length

  console.log(
    `[massage] ${inputCount} in → ${outputCount} out\n` +
    `  Dropped: ${droppedPhantom} phantom, ${droppedShortContent} short-content, ${droppedDuplicateSummary} dup-summary\n` +
    `  Flagged: ${flaggedContentInferred} content-inferred, ${flaggedPdfInvalid} pdf-invalid, ${flaggedOrphan} orphan`,
  )

  return {
    nodes: working,
    stats: {
      inputCount,
      outputCount,
      droppedPhantom,
      droppedShortContent,
      droppedDuplicateSummary,
      flaggedContentInferred,
      flaggedPdfInvalid,
      flaggedOrphan,
    },
  }
}
