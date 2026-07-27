/**
 * Cube — deterministic analytics store for brain nodes.
 *
 * The brain's node graph is a great retrieval substrate but a poor analytics
 * substrate. Counting "how many X does faction Y have" via graph traversal
 * requires the /ask LLM to enumerate everything itself, which it can't
 * reliably do (context blows up; math is wrong; hallucinations creep in).
 *
 * The cube inverts this: build-graph emits denormalized fact + dim + rollup
 * tables to R2 alongside nodes/. The Worker's /count endpoint reads the cube
 * (module-scope cached per isolate) and answers count-shape questions
 * deterministically with a single lookup or scan.
 *
 * The cube is a natural extension of Rule 6 corollary (3NF + pre-aggregated
 * rollups for analytics). fact_node.jsonl is the fact table; dim_faction /
 * dim_keyword are dimension tables; rollup_faction_* are pre-aggregated
 * per-faction summaries (chapter → parent expansion baked in).
 *
 * "Mostly deterministic" — the LLM's job on count-shape questions becomes
 * language framing (understand what's being asked, format the answer), not
 * arithmetic. The cube supplies the number.
 */
import type { Node } from './model'

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Fact table row — denormalized flat shape, one per node.
 * `factionIds` includes both the node's own faction AND its parent when the
 * node belongs to a chapter (Dark Angels detachment carries
 * factionIds: ['dark-angels']; a shared Space Marines detachment has
 * factionIds: ['space-marines', 'dark-angels', 'blood-angels', ...] — every
 * chapter that can pull from the parent pool).
 */
export interface FactNode {
  id: string
  factionId?: string // node's own faction (single value)
  factionIds: string[] // expanded: own + every chapter that can access this node
  category: string
  edition?: string
  layer: string
  title: string
  dp?: number
  keywords: string[] // lower-cased for case-insensitive matching
  /** Parent container's title (detachment for strat/enh, datasheet for
   *  weapon/unit-ability). Precomputed from detachmentId/datasheetId at
   *  cube-build time so /count consumers can attribute a hit to its parent
   *  without a second lookup. Null when the parent isn't in the graph. */
  parentTitle?: string
  /** Parent container's node id (full id, not scalar slug). */
  parentId?: string
}

/** Dimension table row for factions with chapter parentage. */
export interface DimFactionRow {
  id: string
  displayName: string
  parentId?: string
  isChapter: boolean
}

/**
 * Rollup: per-faction DP breakdown of accessible 11e detachments +
 * pre-computed Strike Force combo count. Chapter → parent inheritance
 * baked in. One row per faction (chapters get rows too).
 *
 * combosStrikeForce = (#3pt) + (#2pt × #1pt) + C(#1pt, 3)
 * — the unordered, no-repeat combo count that sums to exactly 3 DP.
 */
export interface RollupFactionDp {
  factionId: string
  displayName: string
  isChapter: boolean
  parentId?: string
  dp1: number
  dp2: number
  dp3: number
  total: number
  combosStrikeForce: number
}

/**
 * Rollup: node count grouped by (faction, category, edition). Chapter
 * expansion baked in — a Dark Angels row for (category='stratagem') counts
 * both DA-branded stratagems AND parent SM stratagems the chapter can use.
 */
export interface RollupFactionCategoryEdition {
  factionId: string
  category: string
  edition: string
  count: number
}

export interface CubeTables {
  factNodesJsonl: string // JSONL (one JSON object per line)
  dimFaction: DimFactionRow[]
  dimKeyword: string[] // sorted unique keyword list (lower-cased)
  rollupFactionDp: RollupFactionDp[]
  rollupFactionCategoryEdition: RollupFactionCategoryEdition[]
}

// ── Build ───────────────────────────────────────────────────────────────────

/**
 * Compute Strike Force combo count from a DP-bucket breakdown.
 * At Strike Force (3 DP), valid combos are exactly one of:
 *   - a single 3-pt detachment
 *   - one 2-pt + one 1-pt
 *   - three distinct 1-pt detachments
 * Ordered by our convention: 1DP, 2DP, 3DP. No repeats.
 */
export function combosAtStrikeForce(dp1: number, dp2: number, dp3: number): number {
  const c1_3 = dp1 >= 3 ? (dp1 * (dp1 - 1) * (dp1 - 2)) / 6 : 0
  return dp3 + dp2 * dp1 + c1_3
}

/**
 * Build the whole cube from the merged/massaged node list + the subfaction
 * (chapter → parent) mapping produced by build-graph.
 *
 * Pure function; no I/O. Caller owns serialization + upload.
 */
export function buildCube(
  allNodes: ReadonlyArray<Node>,
  subfactions: ReadonlyArray<{ id: string; name: string; factionId: string }>,
): CubeTables {
  // ── Dim: faction (with chapter parentage) ─────────────────────────────
  const parentOf = new Map<string, string>() // chapterId → parentFactionId
  const chapterDisplayName = new Map<string, string>()
  for (const s of subfactions) {
    if (s.factionId && s.factionId !== s.id) {
      parentOf.set(s.id, s.factionId)
      chapterDisplayName.set(s.id, s.name)
    }
  }

  // Reverse: parent → all chapters that inherit from it
  const chaptersOf = new Map<string, string[]>()
  for (const [chapterId, parentId] of parentOf) {
    if (!chaptersOf.has(parentId)) chaptersOf.set(parentId, [])
    chaptersOf.get(parentId)!.push(chapterId)
  }

  // Collect every faction id present in the node stream (own faction of any
  // node), plus every chapter id and parent id from the subfaction dim.
  const factionDisplay = new Map<string, string>()
  const factionIds = new Set<string>()
  for (const n of allNodes) {
    if (n.category === 'faction') {
      const id = n.factionId ?? ''
      if (id) {
        factionIds.add(id)
        factionDisplay.set(id, n.factionName ?? n.title ?? id)
      }
    }
    if (n.factionId) factionIds.add(n.factionId)
  }
  for (const s of subfactions) {
    factionIds.add(s.id)
    factionIds.add(s.factionId)
    if (!factionDisplay.has(s.id)) factionDisplay.set(s.id, s.name)
  }

  const dimFaction: DimFactionRow[] = [...factionIds]
    .map((id) => ({
      id,
      displayName: factionDisplay.get(id) ?? id,
      parentId: parentOf.get(id),
      isChapter: parentOf.has(id),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))

  // ── Fact table: one row per node, factionIds expanded ─────────────────
  // A node's `factionIds` is the set of factions that can "see" the node:
  //   - The node's own factionId (single value).
  //   - If the node belongs to a parent faction that has chapters, EVERY
  //     chapter is also added (SM stratagems are accessible to DA, BA, SW, …).
  //   - Chapter-only nodes stay chapter-only (Blood Angels enhancements are
  //     not accessible to Dark Angels).
  // Index nodes by id so we can resolve parent titles for child rows.
  const nodeById = new Map<string, Node>()
  for (const n of allNodes) nodeById.set(n.id, n)

  const facts: FactNode[] = []
  for (const n of allNodes) {
    const ownFactionId = n.factionId
    const factionIdsForNode: string[] = []
    if (ownFactionId) {
      factionIdsForNode.push(ownFactionId)
      // If this node's faction has chapters (i.e., it's a parent), every
      // chapter inherits it.
      const chapters = chaptersOf.get(ownFactionId) ?? []
      for (const c of chapters) factionIdsForNode.push(c)
    }
    // Resolve parent: stratagem/enhancement → detachment container via
    // detachmentId; weapon/unit-ability → datasheet via datasheetId. After
    // the build-graph 6a2/6a3 normalization pass these scalars now hold
    // full container ids that resolve directly against nodeById.
    let parentTitle: string | undefined
    let parentId: string | undefined
    if (
      (n.category === 'stratagem' ||
        n.category === 'enhancement' ||
        n.category === 'faction-ability') &&
      n.detachmentId
    ) {
      const parent = nodeById.get(n.detachmentId)
      if (parent) {
        parentTitle = parent.title
        parentId = parent.id
      }
    } else if ((n.category === 'weapon' || n.category === 'unit-ability') && n.datasheetId) {
      const parent = nodeById.get(n.datasheetId)
      if (parent) {
        parentTitle = parent.title
        parentId = parent.id
      }
    }
    facts.push({
      id: n.id,
      factionId: ownFactionId,
      factionIds: factionIdsForNode,
      category: n.category,
      edition: n.edition,
      layer: n.layer,
      title: n.title,
      dp: n.dp,
      keywords: (n.keywords ?? []).map((k) => k.toLowerCase()),
      parentTitle,
      parentId,
    })
  }

  // ── Dim: keyword (sorted unique) ──────────────────────────────────────
  const kwSet = new Set<string>()
  for (const f of facts) for (const k of f.keywords) kwSet.add(k)
  const dimKeyword = [...kwSet].sort()

  // ── Rollup: faction × DP (11e detachments only) ───────────────────────
  // Chapter expansion is already baked into factionIds on each fact row, so
  // "detachments accessible to Dark Angels" = facts where factionIds
  // contains 'dark-angels' AND category='detachment' AND edition='11th'.
  const rollupFactionDp: RollupFactionDp[] = []
  for (const dim of dimFaction) {
    let dp1 = 0,
      dp2 = 0,
      dp3 = 0
    for (const f of facts) {
      if (f.category !== 'detachment' || f.edition !== '11th') continue
      if (!f.factionIds.includes(dim.id)) continue
      if (f.dp === 1) dp1++
      else if (f.dp === 2) dp2++
      else if (f.dp === 3) dp3++
    }
    const total = dp1 + dp2 + dp3
    if (total === 0) continue // skip factions with no 11e detachments (missions/agnostic)
    rollupFactionDp.push({
      factionId: dim.id,
      displayName: dim.displayName,
      isChapter: dim.isChapter,
      parentId: dim.parentId,
      dp1,
      dp2,
      dp3,
      total,
      combosStrikeForce: combosAtStrikeForce(dp1, dp2, dp3),
    })
  }

  // ── Rollup: faction × category × edition ──────────────────────────────
  // For each faction × category × edition triple, count facts whose
  // factionIds contains the faction. Same chapter-expansion semantics as
  // above.
  const catKeys = new Set<string>()
  for (const f of facts) if (f.category) catKeys.add(f.category)
  const editions = ['11th', '10th', '9th']

  const rollupFactionCategoryEdition: RollupFactionCategoryEdition[] = []
  // Build an index: factionId → factionId's facts (avoids O(F × C × E × N))
  const factsByFaction = new Map<string, FactNode[]>()
  for (const f of facts) {
    for (const fid of f.factionIds) {
      if (!factsByFaction.has(fid)) factsByFaction.set(fid, [])
      factsByFaction.get(fid)!.push(f)
    }
  }
  for (const dim of dimFaction) {
    const factionFacts = factsByFaction.get(dim.id) ?? []
    for (const category of catKeys) {
      for (const edition of editions) {
        let count = 0
        for (const f of factionFacts) {
          if (f.category === category && f.edition === edition) count++
        }
        if (count > 0) {
          rollupFactionCategoryEdition.push({
            factionId: dim.id,
            category,
            edition,
            count,
          })
        }
      }
    }
  }

  // ── Serialize fact table as JSONL for streaming reads ─────────────────
  const factNodesJsonl = facts.map((f) => JSON.stringify(f)).join('\n') + '\n'

  return {
    factNodesJsonl,
    dimFaction,
    dimKeyword,
    rollupFactionDp,
    rollupFactionCategoryEdition,
  }
}
