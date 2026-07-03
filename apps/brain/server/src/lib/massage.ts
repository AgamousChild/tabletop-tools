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
  /** Map of old node ID → new node ID for re-attributed army rules */
  renamedIds: Map<string, string>
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
  'weapon',
  'unit-ability',
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

  // Pass 3 — duplicate summaries within category+factionId+edition
  // Edition is part of the key so the 10e/11e parallel datasets (PR #81) don't
  // collapse — every Wahapedia 10e node has an `11e:`-prefixed twin with the
  // same category/factionId/summary; without edition in the key the 11e copy
  // gets dropped here as a "duplicate."
  const seen = new Set<string>()
  const afterPass3: Node[] = []
  for (const node of afterPass2) {
    // factionId may be undefined — treat undefined as the empty string so
    // nodes without a faction form their own dedup group
    const key = `${node.category}\0${node.factionId ?? ''}\0${node.edition ?? ''}\0${node.summary}`
    if (seen.has(key)) {
      droppedDuplicateSummary++
    } else {
      seen.add(key)
      afterPass3.push(node)
    }
  }

  // Passes 4–6 mutate nodes — clone shallowly so we don't touch input objects
  const working: Node[] = afterPass3.map((n) => ({
    ...n,
    qualityFlags: n.qualityFlags ? [...n.qualityFlags] : [],
  }))

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
  const idSet = new Set(working.map((n) => n.id))
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

  // Pass 7a — fix misattributed army rules
  // Wahapedia lists army rules under parent factions (e.g. SM chapter rules all under
  // space-marines, Nurgle's Gift under both CSM and DG). This map defines the true
  // owner for each army rule. Copies under the wrong faction are removed; copies under
  // the parent faction (SM chapter rules) are re-attributed to the correct chapter.
  const ARMY_RULE_OWNERS: Record<string, string> = {
    // Space Marines (generic)
    'Oath of Moment': 'space-marines',
    'Space Marine Chapters': 'space-marines',
    // Space Wolves (listed under space-marines by Wahapedia)
    'Curse of the Wulfen': 'space-wolves',
    Sagas: 'space-wolves',
    'Sons of Russ': 'space-wolves',
    // Dark Angels
    'The Unforgiven': 'dark-angels',
    'The Ravenwing': 'dark-angels',
    'The Deathwing': 'dark-angels',
    // Blood Angels
    'The Sons of Sanguinius': 'blood-angels',
    // Black Templars
    'Templar Vows': 'black-templars',
    'Heirs of Sigismund': 'black-templars',
    // Deathwatch
    'Mission Tactics': 'deathwatch',
    'Kill Teams': 'deathwatch',
    Deathwatch: 'deathwatch',
    // Imperial Agents
    'Assigned Agents': 'imperial-agents',
    'Kill Team': 'imperial-agents',
    // Chaos Space Marines
    'Dark Pacts': 'chaos-space-marines',
    'Cult of the Dark Gods': 'chaos-space-marines',
    // Death Guard
    'Nurgle\u2019s Gift (Aura)': 'death-guard',
    // World Eaters
    'Blessings of Khorne': 'world-eaters',
    'Pact of Blood': 'world-eaters',
    // Thousand Sons
    'Cabal of Sorcerers': 'thousand-sons',
    'Pact of Sorcery': 'thousand-sons',
    // Emperor's Children
    'Thrill Seekers': 'emperors-children',
    'Pact of Excess': 'emperors-children',
    // Aeldari
    'Strands of Fate': 'aeldari',
    'Battle Focus': 'aeldari',
    'Disparate Paths': 'aeldari',
    // Tyranids
    Synapse: 'tyranids',
    'Shadow in the Warp': 'tyranids',
    // Adeptus Mechanicus
    'Doctrina Imperatives': 'adeptus-mechanicus',
    // Chaos Daemons
    'The Shadow of Chaos': 'chaos-daemons',
    'Daemonic Pact': 'chaos-daemons',
  }

  // SM chapter slugs that Wahapedia groups under space-marines
  const SM_CHAPTER_SLUGS = new Set([
    'space-wolves',
    'dark-angels',
    'blood-angels',
    'black-templars',
    'deathwatch',
  ])

  const CHAPTER_DISPLAY_NAMES: Record<string, string> = {
    'space-wolves': 'SPACE WOLVES',
    'dark-angels': 'DARK ANGELS',
    'blood-angels': 'BLOOD ANGELS',
    'black-templars': 'BLACK TEMPLARS',
    deathwatch: 'DEATHWATCH',
  }

  const armyRuleDropped: string[] = []
  const armyRuleReattributed: string[] = []
  const renamedIds = new Map<string, string>()

  function reattribute(node: Node, owner: string) {
    const oldId = node.id
    node.factionId = owner
    node.factionName = CHAPTER_DISPLAY_NAMES[owner] ?? owner.replace(/-/g, ' ').toUpperCase()
    node.id = node.id.replace('faction:space-marines:', `faction:${owner}:`)
    if (oldId !== node.id) renamedIds.set(oldId, node.id)
    armyRuleReattributed.push(`${node.title} → ${owner}`)
  }

  for (let i = working.length - 1; i >= 0; i--) {
    const node = working[i]!
    if (node.category !== 'faction-ability' || node.detachmentId) continue

    // Check the rule itself
    const owner = ARMY_RULE_OWNERS[node.title]
    if (owner && node.factionId !== owner) {
      if (SM_CHAPTER_SLUGS.has(owner) && node.factionId === 'space-marines') {
        reattribute(node, owner)
      } else {
        armyRuleDropped.push(`${node.title} (${node.factionName})`)
        working.splice(i, 1)
      }
      continue
    }

    // Check sub-rules with "(ParentName)" suffix
    const parenMatch = node.title.match(/\((.+)\)\s*$/)
    if (parenMatch) {
      const parentName = parenMatch[1]!.trim()
      const parentOwner = ARMY_RULE_OWNERS[parentName]
      if (parentOwner && node.factionId !== parentOwner) {
        if (SM_CHAPTER_SLUGS.has(parentOwner) && node.factionId === 'space-marines') {
          reattribute(node, parentOwner)
        } else {
          working.splice(i, 1)
        }
      }
    }
  }
  if (armyRuleDropped.length > 0) {
    console.log(`  Army rule cleanup: removed ${armyRuleDropped.length} misattributed rules`)
  }
  if (armyRuleReattributed.length > 0) {
    console.log(
      `  Army rule re-attribution: moved ${armyRuleReattributed.length} rules to correct chapter`,
    )
  }

  // Pass 7b — fold sub-rules into parent army rules
  // Sub-rules have titles like "MARTIAL EXCELLENCE (Blessings of Khorne)"
  // The parent is the army rule matching the parenthetical text.
  // Append sub-rule content as structured **sub-rule** blocks in the parent's content.
  const parentRuleById = new Map<string, Node>()
  const subRulesByParent = new Map<string, Node[]>()

  for (const node of working) {
    if (node.category !== 'faction-ability' || node.detachmentId) continue
    const parenMatch = node.title.match(/\((.+)\)\s*$/)
    if (parenMatch) {
      // This is a sub-rule — find parent by name
      const parentName = parenMatch[1]!.trim()
      const key = `${node.factionId}:${parentName.toLowerCase()}`
      if (!subRulesByParent.has(key)) subRulesByParent.set(key, [])
      subRulesByParent.get(key)!.push(node)
    } else {
      // This could be a parent
      const key = `${node.factionId}:${node.title.toLowerCase()}`
      parentRuleById.set(key, node)
    }
  }

  for (const [key, subRules] of subRulesByParent) {
    const parent = parentRuleById.get(key)
    if (!parent) continue

    const subRuleLines: string[] = ['', '']
    for (const sr of subRules) {
      // Extract the sub-rule name (without the parenthetical)
      const name = sr.title.replace(/\s*\(.+\)\s*$/, '').trim()
      subRuleLines.push(`**${name}:** ${sr.content}`)
    }
    parent.content = parent.content + subRuleLines.join('\n')
  }

  // Pass 7c — drop enhancements that collide with datasheet names
  // Faction pack PDFs often have datasheets after the enhancements section, and the
  // parser's enhancement zone state machine incorrectly tags them as enhancements.
  const datasheetNames = new Set<string>()
  for (const node of working) {
    if (node.category === 'datasheet') datasheetNames.add(node.title.toLowerCase())
  }
  let droppedPhantomEnhancements = 0
  for (let i = working.length - 1; i >= 0; i--) {
    const node = working[i]!
    if (node.category === 'enhancement' && datasheetNames.has(node.title.toLowerCase())) {
      working.splice(i, 1)
      droppedPhantomEnhancements++
    }
  }
  if (droppedPhantomEnhancements > 0) {
    console.log(
      `  Phantom enhancement cleanup: removed ${droppedPhantomEnhancements} datasheets misclassified as enhancements`,
    )
  }

  // Pass 7d — drop phantom detachment-rule nodes where content = title
  // These are PDF parsing artifacts (faction names or broken partial detachment names
  // parsed as detachment rules with no real content).
  let droppedPhantomDetachments = 0
  for (let i = working.length - 1; i >= 0; i--) {
    const node = working[i]!
    if (
      node.category === 'detachment-rule' &&
      node.title.toLowerCase().trim() === node.content.toLowerCase().trim()
    ) {
      working.splice(i, 1)
      droppedPhantomDetachments++
    }
  }
  if (droppedPhantomDetachments > 0) {
    console.log(
      `  Phantom detachment cleanup: removed ${droppedPhantomDetachments} detachment-rules with no real content`,
    )
  }

  // Pass 7e — chapter membership on SM detachments used to land here as a
  // `node.subfaction` scalar via a hardcoded detachment→chapter map. Deleted
  // in PR D of the scalar-to-ref refactor: chapter identity now lives on
  // `factionId` when the source data ties the detachment to a chapter, and
  // otherwise the detachment stays chapter-agnostic. See
  // docs/superpowers/plans/2026-07-03-scalar-to-ref-refactor.md.

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
    renamedIds,
  }
}
