import { getCanonicalFactionIds, normalizeFactionId } from './faction-codes'
import type { Node, NodeRef } from './model'
import type { MfmCostingForDatasheet } from './parsers/mfm-costing'
import { slugify } from './slugify'

function copyIfMissing<K extends keyof Node>(keeper: Node, dropped: Node, fields: readonly K[]) {
  for (const f of fields) {
    if (
      (keeper[f] === undefined || keeper[f] === null) &&
      dropped[f] !== undefined &&
      dropped[f] !== null
    ) {
      keeper[f] = dropped[f]
    }
  }
}

/** Editions accepted by the brain. Per Rule 5, 11th is the target edition. */
const ALLOWED_EDITIONS: ReadonlySet<string> = new Set(['9th', '10th', '11th'])
const DEFAULT_EDITION = '11th'

/** Slug → preferred English display name (ALL CAPS). */
const FACTION_DISPLAY_NAMES: Record<string, string> = {
  'space-marines': 'SPACE MARINES',
  'chaos-space-marines': 'CHAOS SPACE MARINES',
  't-au-empire': "T'AU EMPIRE",
  'astra-militarum': 'ASTRA MILITARUM',
  'adepta-sororitas': 'ADEPTA SORORITAS',
  'adeptus-custodes': 'ADEPTUS CUSTODES',
  'adeptus-mechanicus': 'ADEPTUS MECHANICUS',
  'grey-knights': 'GREY KNIGHTS',
  'imperial-agents': 'IMPERIAL AGENTS',
  'imperial-knights': 'IMPERIAL KNIGHTS',
  'chaos-knights': 'CHAOS KNIGHTS',
  'death-guard': 'DEATH GUARD',
  'thousand-sons': 'THOUSAND SONS',
  'world-eaters': 'WORLD EATERS',
  'chaos-daemons': 'CHAOS DAEMONS',
  'leagues-of-votann': 'LEAGUES OF VOTANN',
  'genestealer-cults': 'GENESTEALER CULTS',
  aeldari: 'AELDARI',
  drukhari: 'DRUKHARI',
  tyranids: 'TYRANIDS',
  necrons: 'NECRONS',
  orks: 'ORKS',
  'emperors-children': "EMPEROR'S CHILDREN",
  unaligned: 'UNALIGNED',
}

export interface MergeStats {
  inputNodes: number
  outputNodes: number
  mergedByIdCount: number
  factionNormalizedCount: number
  refsDeduped: number
  summaryTagged: number
  /** Datasheet nodes whose `points` array was overridden by MFM 11e costing. */
  mfmPointsApplied: number
  /**
   * 10e nodes that got `updatedInEleventh: true` because an 11e companion was
   * found by `(factionId, category, slugify(title))` match. See
   * {@link stampUpdatedInEleventh}.
   */
  updatedInEleventhFlagged: number
  /** Edition gate counts. See {@link runEditionGate}. */
  editionGate: EditionGateReport
  /** FactionId gate counts. See {@link runFactionIdGate}. */
  factionIdGate: FactionIdGateReport
}

export interface EditionGateReport {
  '9th': number
  '10th': number
  '11th': number
  /** Nodes that arrived missing `edition` and were defaulted to {@link DEFAULT_EDITION}. */
  defaulted: number
  /** Nodes whose `edition` was set to an unexpected value (e.g. typo). */
  unexpected: number
}

export interface FactionIdGateReport {
  /** Nodes whose `factionId` is already in `dim_faction`. */
  canonical: number
  /** Nodes whose shadow `factionId` was rewritten via `normalizeFactionId()`. */
  normalized: number
  /** Nodes whose `factionId` is still not in `dim_faction` after normalization. */
  stillOrphaned: number
}

export interface MergeResult {
  nodes: Node[]
  refs: NodeRef[]
  stats: MergeStats
}

/**
 * Optional auxiliary data sources consulted while merging. Each layer is
 * applied with the priority documented in `applyPointsPriority` below.
 */
export interface MergeOptions {
  /** MFM 11e costing, datasheet GUID → derived points info. */
  mfmCostingByDatasheetId?: Map<string, MfmCostingForDatasheet>
}

/**
 * Resolve the authoritative `points` array for a datasheet node.
 *
 * Priority order (per `docs/superpowers/plans/2026-06-27-data-problems-followup.md`
 * step 5 — "MFM as the 11e points source of truth"):
 *
 *   1. MFM (Munitorum Field Manual) when the datasheet has an MFM row. MFM is
 *      the GW-published 11e points source and refreshes ~monthly.
 *   2. BSData 11e (placeholder — the brain does not yet read BSData unit data,
 *      but the slot is here so the next migration step plugs in cleanly).
 *   3. Wahapedia (10e). Only used as a fallback. Wahapedia has not yet
 *      shipped 11e points; nodes that consume it should be tagged
 *      `edition: '10th'`.
 *
 * The existing `node.points` array on a datasheet was emitted by the
 * Wahapedia parser (`game-data.ts`), so it's already at priority 3 in this
 * scheme. We overwrite it whenever priority 1 has data.
 */
function applyPointsPriority(
  node: Node,
  mfmCostingByDatasheetId: Map<string, MfmCostingForDatasheet> | undefined,
): boolean {
  if (node.category !== 'datasheet') return false
  if (!node.datasheetId) return false
  if (!mfmCostingByDatasheetId) return false
  const mfm = mfmCostingByDatasheetId.get(node.datasheetId)
  if (!mfm) return false
  node.points = mfm.pointsArray
  return true
}

/**
 * Thrown by `mergeSources` when a post-merge invariant gate detects regressions
 * that the auto-fix step couldn't repair (e.g. a shadow factionId that's neither
 * canonical nor resolvable via `normalizeFactionId`).
 *
 * Surfaces the regression with a non-zero exit code when build-graph.ts hits it
 * uncaught — matches the CI-like build context described in
 * docs/superpowers/plans/2026-06-27-data-problems-followup.md step 9.
 */
export class BuildGateError extends Error {
  readonly gate: 'edition' | 'factionId'
  readonly orphans: ReadonlyArray<{ id: string; value: string }>
  constructor(
    gate: 'edition' | 'factionId',
    orphans: ReadonlyArray<{ id: string; value: string }>,
  ) {
    super(`${gate} gate: ${orphans.length} node(s) failed auto-fix and remain orphaned`)
    this.name = 'BuildGateError'
    this.gate = gate
    this.orphans = orphans
  }
}

/**
 * Edition gate — every node must carry `edition: '9th' | '10th' | '11th'`.
 *
 * Default behaviour is **warn + auto-fix** (per step 9): missing editions are
 * defaulted to `'11th'` per Rule 5; unexpected values are warned but left
 * alone (we don't silently rewrite arbitrary strings — that hides bugs).
 *
 * Mutates `nodes` in place and returns the count breakdown.
 */
function runEditionGate(nodes: Node[]): EditionGateReport {
  const report: EditionGateReport = {
    '9th': 0,
    '10th': 0,
    '11th': 0,
    defaulted: 0,
    unexpected: 0,
  }
  const unexpectedSamples = new Map<string, number>() // edition value → count

  for (const node of nodes) {
    if (!node.edition) {
      node.edition = DEFAULT_EDITION
      report.defaulted++
    }
    if (ALLOWED_EDITIONS.has(node.edition)) {
      report[node.edition as '9th' | '10th' | '11th']++
    } else {
      report.unexpected++
      unexpectedSamples.set(node.edition, (unexpectedSamples.get(node.edition) ?? 0) + 1)
    }
  }

  if (report.defaulted > 0) {
    console.warn(
      `   [edition gate] WARN: ${report.defaulted} node(s) had no edition tag; defaulted to '${DEFAULT_EDITION}' (Rule 5)`,
    )
  }
  if (report.unexpected > 0) {
    const samples = [...unexpectedSamples.entries()].map(([v, c]) => `'${v}' x${c}`).join(', ')
    console.warn(
      `   [edition gate] WARN: ${report.unexpected} node(s) with unexpected edition: ${samples}`,
    )
  }
  console.log(
    `   [edition gate] 9th=${report['9th']} 10th=${report['10th']} 11th=${report['11th']} defaulted=${report.defaulted}`,
  )

  return report
}

/**
 * FactionId gate — every node whose `factionId` is set must reference a
 * canonical slug from `dim_faction`. `factionId: undefined` is fine
 * (faction-agnostic nodes are normal).
 *
 * Default behaviour is **warn + auto-fix**: shadow factionIds get one more
 * pass through `normalizeFactionId()`. Anything that still isn't canonical
 * is collected into the report and the function throws a `BuildGateError`,
 * which propagates a non-zero exit when build-graph.ts surfaces it.
 *
 * Requires `loadFactionCodes()` to have been called (build-graph.ts and the
 * test fixture both do this).
 */
function runFactionIdGate(nodes: Node[]): FactionIdGateReport {
  const canonicalSlugs = getCanonicalFactionIds()
  const report: FactionIdGateReport = {
    canonical: 0,
    normalized: 0,
    stillOrphaned: 0,
  }
  const shadowCounts = new Map<string, number>() // shadow id → count seen
  const orphanCounts = new Map<string, number>() // still-orphan id → count seen
  const orphanSamples: Array<{ id: string; value: string }> = []

  for (const node of nodes) {
    if (!node.factionId) continue // faction-agnostic — allowed
    if (canonicalSlugs.has(node.factionId)) {
      report.canonical++
      continue
    }
    // Shadow: try a last-ditch normalization pass
    shadowCounts.set(node.factionId, (shadowCounts.get(node.factionId) ?? 0) + 1)
    const fixed = normalizeFactionId(node.factionId)
    if (canonicalSlugs.has(fixed)) {
      node.factionId = fixed
      report.normalized++
    } else {
      report.stillOrphaned++
      orphanCounts.set(node.factionId, (orphanCounts.get(node.factionId) ?? 0) + 1)
      if (orphanSamples.length < 10) orphanSamples.push({ id: node.id, value: node.factionId })
    }
  }

  if (shadowCounts.size > 0) {
    const samples = [...shadowCounts.entries()]
      .slice(0, 10)
      .map(([id, c]) => `'${id}' x${c}`)
      .join(', ')
    console.warn(
      `   [factionId gate] WARN: ${shadowCounts.size} shadow factionId(s) seen pre-normalize: ${samples}`,
    )
  }
  console.log(
    `   [factionId gate] canonical=${report.canonical} normalized=${report.normalized} still-orphaned=${report.stillOrphaned}`,
  )

  if (report.stillOrphaned > 0) {
    const samples = [...orphanCounts.entries()].map(([id, c]) => `'${id}' x${c}`).join(', ')
    console.warn(`   [factionId gate] FAIL: still-orphaned factionIds: ${samples}`)
    throw new BuildGateError('factionId', orphanSamples)
  }

  return report
}

/**
 * Step 4d: set `updatedInEleventh: true` on every 10e node whose 11e
 * companion is in the same merged graph.
 *
 * Match key: `(factionId, category, slugify(title))`. This is the same join
 * `validation-delta.ts` uses; keeping the keys in sync means the in-merge
 * bit-flag and the offline delta report agree node-for-node.
 *
 * Bit-flag only — the actual delta is the 11e companion node itself. UI
 * consumers read this flag to render a "Changed in 11th" badge on a 10e
 * card, then offer a click-through to the 11e companion. Display work is
 * out of scope here.
 *
 * Mutates `nodes` in place. Returns the count of flagged 10e nodes.
 */
function stampUpdatedInEleventh(nodes: Node[]): number {
  // Index the 11e side. We index *every* 11e node so any 10e companion in
  // any category can match — the previous detachment-only check missed
  // datasheets + datasheet-rules.
  const elevenKeys = new Set<string>()
  for (const n of nodes) {
    if (n.edition !== '11th') continue
    if (!n.factionId) continue
    elevenKeys.add(`${n.factionId}::${n.category}::${slugify(n.title)}`)
  }

  let flagged = 0
  for (const n of nodes) {
    if (n.edition !== '10th') continue
    if (!n.factionId) continue
    const key = `${n.factionId}::${n.category}::${slugify(n.title)}`
    if (elevenKeys.has(key)) {
      n.updatedInEleventh = true
      flagged++
    }
  }
  return flagged
}

/** Convert a kebab-case slug to Title Case for display. */
function slugToTitleCase(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Merge nodes and refs from multiple sources (BSData + Wahapedia) into a
 * deduplicated, enriched graph ready for embedding.
 *
 * Operations (in order):
 * 1. Normalize all factionIds to canonical kebab-case slugs
 * 2. Deduplicate nodes by ID — first occurrence wins for content, keywords merged
 * 3. Prepend faction name to datasheet summaries for embedding disambiguation
 * 4. Tag non-datasheet nodes whose title collides with a datasheet title
 * 5. Deduplicate refs by sourceId + targetId + rel
 * 6. Remove orphan refs where either endpoint is absent from the final node set
 */
export function mergeSources(
  allNodes: Node[],
  allRefs: NodeRef[],
  options: MergeOptions = {},
): MergeResult {
  const stats: MergeStats = {
    inputNodes: allNodes.length,
    outputNodes: 0,
    mergedByIdCount: 0,
    factionNormalizedCount: 0,
    refsDeduped: 0,
    summaryTagged: 0,
    mfmPointsApplied: 0,
    updatedInEleventhFlagged: 0,
    editionGate: { '9th': 0, '10th': 0, '11th': 0, defaulted: 0, unexpected: 0 },
    factionIdGate: { canonical: 0, normalized: 0, stillOrphaned: 0 },
  }

  // Step 1: Normalize factionIds and assign factionName (mutates a working copy)
  for (const node of allNodes) {
    if (node.factionId) {
      const canonical = normalizeFactionId(node.factionId)
      if (canonical !== node.factionId) {
        node.factionId = canonical
        stats.factionNormalizedCount++
      }
      // Assign display name from slug
      node.factionName =
        FACTION_DISPLAY_NAMES[canonical] ?? canonical.replace(/-/g, ' ').toUpperCase()
    }
  }

  // Step 2: Deduplicate by ID — first occurrence wins, keywords from all occurrences merged
  const nodeMap = new Map<string, Node>()
  const extraKeywords = new Map<string, Set<string>>()

  for (const node of allNodes) {
    if (nodeMap.has(node.id)) {
      stats.mergedByIdCount++
      const kwSet = extraKeywords.get(node.id) ?? new Set<string>()
      for (const kw of node.keywords) kwSet.add(kw)
      extraKeywords.set(node.id, kwSet)
    } else {
      nodeMap.set(node.id, node)
      // Seed the extra-keywords set with the first node's keywords too so we
      // accumulate correctly even if duplicates appear later.
      const kwSet = new Set<string>(node.keywords)
      extraKeywords.set(node.id, kwSet)
    }
  }

  // Apply merged keywords back to winning nodes
  for (const [id, kwSet] of extraKeywords) {
    const node = nodeMap.get(id)!
    const existing = new Set(node.keywords)
    for (const kw of kwSet) {
      if (!existing.has(kw)) {
        node.keywords.push(kw)
      }
    }
  }

  // Step 2b: Deduplicate detachment-rules by title + faction
  // Different sources produce the same detachment with different IDs
  // (e.g. "det:dark-angels:wrath-of-the-rock:wrath-of-the-rock" from Wahapedia
  // vs "det:space-marines:wrath-of-the-rock" from faction packs).
  // Keep the one with more content, redirect refs from the dropped ID to the kept ID.

  // The Node.subfaction scalar was deleted in PR D of the scalar-to-ref
  // refactor — chapter identity now lives on `factionId` directly (Blood
  // Angels units carry `factionId=blood-angels`). No pre-dedup subfaction
  // normalization pass is needed. See
  // docs/superpowers/plans/2026-07-03-scalar-to-ref-refactor.md.

  // Redirect map collects droppedId → keptId across all the dedup passes
  // below (MFM→pack detachment merge, title-based detachment-rule dedup).
  const redirectIds = new Map<string, string>() // droppedId → keptId

  // Step 2b1: Collapse MFM-emitted `category: 'detachment'` nodes onto
  // faction-pack `category: 'detachment-rule'` nodes that describe the same
  // detachment. Survivor keeps:
  //   - title from the faction-pack version (cleaner heading)
  //   - content from the faction-pack version (the rule text)
  //   - dp + forceDisposition + enhancement refs from the MFM version
  //   - single `category: 'detachment'`
  //   - sources[] union (preserves both provenances)
  //   - canonical id `det:<faction>:<slug>` (drop the `mfm:` prefix)
  //
  // Edition is part of the key so the 10e Wahapedia detachment-rule never
  // collapses onto the 11e MFM/faction-pack detachment. Each edition gets
  // its own merged record. Without this, the parallel-10e-11e dataset built
  // by `duplicateEleventh()` would lose its 10e detachment-rule survivors
  // to the 11e MFM nodes that share a title.
  const detachmentMergesByKey = new Map<string, { mfm?: Node; pack?: Node }>()
  for (const node of nodeMap.values()) {
    if (node.category !== 'detachment' && node.category !== 'detachment-rule') continue
    // Normalize title: lower-case + strip non-alphanumeric so smart quotes
    // (U+2018/U+2019 in MFM titles like "Serpent'S Brood") and punctuation
    // differences don't prevent pack + MFM twins from matching.
    const normTitle = node.title.toLowerCase().replace(/[^a-z0-9]+/g, '')
    const key = `${node.edition ?? ''}|${node.factionId ?? ''}|${normTitle}`
    const bucket = detachmentMergesByKey.get(key) ?? {}
    if (node.category === 'detachment') bucket.mfm = node
    else bucket.pack = node
    detachmentMergesByKey.set(key, bucket)
  }
  for (const { mfm, pack } of detachmentMergesByKey.values()) {
    if (!mfm || !pack) continue
    // Keep the pack node as the survivor (canonical `det:<faction>:<slug>` id).
    // Pull dp + forceDisposition + sources off the MFM node onto it, set
    // category to 'detachment', and drop the MFM node.
    if (mfm.dp != null) pack.dp = mfm.dp
    if (mfm.forceDisposition) pack.forceDisposition = mfm.forceDisposition
    pack.category = 'detachment'
    // Union sources (drop dupes by type+title pair)
    const existingSrcKeys = new Set(pack.sources.map((s) => `${s.type}|${s.title}`))
    for (const src of mfm.sources) {
      const k = `${src.type}|${src.title}`
      if (!existingSrcKeys.has(k)) {
        pack.sources.push(src)
        existingSrcKeys.add(k)
      }
    }
    // Merge keywords
    const existingKws = new Set(pack.keywords)
    for (const kw of mfm.keywords) {
      if (!existingKws.has(kw)) pack.keywords.push(kw)
    }
    // Redirect refs that pointed at the MFM id
    redirectIds.set(mfm.id, pack.id)
    nodeMap.delete(mfm.id)
  }

  const DEDUP_CATEGORIES = new Set([
    'detachment-rule',
    'stratagem',
    'enhancement',
    'faction-ability',
  ])
  const byTitleFaction = new Map<string, Node[]>()
  for (const node of nodeMap.values()) {
    if (!DEDUP_CATEGORIES.has(node.category)) continue
    // For detachment-rules, dedup by title only — the same detachment often appears
    // under different factionIds (e.g., "Wrath of the Rock" under both "dark-angels" and "space-marines")
    // For other categories, include faction to avoid collapsing legitimately different abilities
    const faction = node.category === 'detachment-rule' ? '' : (node.factionId ?? '')
    // Edition is part of the key so the 10e and 11e copies of the same
    // detachment-rule / stratagem / enhancement / faction-ability stay
    // distinct. Parallel datasets — see duplicate-eleventh.ts.
    //
    // Title normalization for the key:
    //  - lowercase
    //  - strip `(Upgrade)` and `(Aura)` suffixes that MFM adds to enhancement
    //    names but the pack does not (`SYMPHONIC PAYLOAD` vs
    //    `Symphonic Payload (Upgrade)`)
    //  - strip ALL non-alphanumeric characters to collapse:
    //    - straight vs curly apostrophes (`Vingh's` vs `Vingh’s`)
    //    - internal whitespace artifacts from PDF column breaks
    //      (`PRAES IDIUS` vs `Praesidius`)
    //    - punctuation drift across sources
    const normalizedTitle = node.title
      .toLowerCase()
      .replace(/(?:\s*\((?:upgrade|aura)\)\s*)+$/, '')
      .replace(/[^a-z0-9]+/g, '')
    const key = `${node.edition ?? ''}|${node.category}|${normalizedTitle}|${faction}`
    if (!byTitleFaction.has(key)) byTitleFaction.set(key, [])
    byTitleFaction.get(key)!.push(node)
  }

  let titleDeduped = 0
  // Fields the MFM enhancement/stratagem pass carries but the pack-side
  // parser doesn't emit — copy from dropped onto keeper so points/CP-cost
  // survive the dedup. Without this, the pack UPPERCASE stratagem/enhancement
  // wins on content-length, drops the MFM node, and the merged survivor is
  // left with cost/cpCost undefined (only content + title).
  // `leaderTo` used to be listed here, but it isn't in the Node schema —
  // the comment at model.ts:194 clarifies it is an MFM-parser input field
  // promoted to `attachesTo` upstream. Writing it here was a no-op (Zod
  // strips unknown keys), so dropping it is a cleanup, not a behaviour change.
  const CROSS_SOURCE_FIELDS = [
    'cost',
    'cpCost',
    'phase',
    'when',
    'target',
    'effect',
    'stratType',
    'turn',
    'attachesTo',
    'modelRestriction',
    'dp',
    'forceDisposition',
  ] as const satisfies readonly (keyof Node)[]
  for (const [, dupes] of byTitleFaction) {
    if (dupes.length <= 1) continue
    // Keep the one with more content
    dupes.sort((a, b) => (b.content?.length ?? 0) - (a.content?.length ?? 0))
    const keeper = dupes[0]!
    for (let i = 1; i < dupes.length; i++) {
      const dropped = dupes[i]!
      redirectIds.set(dropped.id, keeper.id)
      nodeMap.delete(dropped.id)
      // Merge keywords from dropped into keeper
      const existing = new Set(keeper.keywords)
      for (const kw of dropped.keywords) {
        if (!existing.has(kw)) keeper.keywords.push(kw)
      }
      // Backfill cross-source fields the keeper is missing. TS can't narrow
      // `kk[f] = dd[f]` when `f` is a union of keys with heterogeneous value
      // types, so we widen via one helper generic on the specific key.
      copyIfMissing(keeper, dropped, CROSS_SOURCE_FIELDS)
      titleDeduped++
    }
  }

  console.log(
    `   Title-based dedup: ${titleDeduped} nodes removed, ${redirectIds.size} IDs redirected`,
  )

  // Redirect refs that pointed to dropped nodes
  if (redirectIds.size > 0) {
    for (const ref of allRefs) {
      const newSource = redirectIds.get(ref.sourceId)
      if (newSource) ref.sourceId = newSource
      const newTarget = redirectIds.get(ref.targetId)
      if (newTarget) ref.targetId = newTarget
    }
  }

  // Step 3: Build a set of lowercase datasheet titles for collision detection
  const datasheetTitles = new Set<string>()
  for (const node of nodeMap.values()) {
    if (node.category === 'datasheet') {
      datasheetTitles.add(node.title.toLowerCase())
    }
  }

  // Step 4: Enrich summaries
  for (const node of nodeMap.values()) {
    // 4a: Datasheets — prepend faction name if not already present in summary
    if (node.category === 'datasheet' && node.factionId) {
      const factionLabel = slugToTitleCase(node.factionId)
      if (!node.summary.toLowerCase().includes(factionLabel.toLowerCase())) {
        node.summary = `${factionLabel}: ${node.summary}`
        stats.summaryTagged++
      }
    }

    // 4b: Non-datasheets whose title matches a datasheet title — append rule tag
    if (node.category !== 'datasheet' && datasheetTitles.has(node.title.toLowerCase())) {
      const alreadyTagged =
        node.summary.toLowerCase().includes('faction rule') ||
        node.summary.toLowerCase().includes('enhancement rule') ||
        node.summary.toLowerCase().includes('ability rule') ||
        node.summary.toLowerCase().includes('(rule)')

      if (!alreadyTagged) {
        const tag =
          node.category === 'faction-ability'
            ? 'faction rule'
            : node.category === 'enhancement'
              ? 'enhancement rule'
              : node.category === 'unit-ability'
                ? 'ability rule'
                : 'rule'
        node.summary = `${node.summary} (${tag})`
        stats.summaryTagged++
      }
    }
  }

  // Step 4c: Apply points-source priority (MFM → BSData → Wahapedia 10e).
  // The Wahapedia parser already populated `node.points` from 10e data; we
  // overwrite it on datasheets that have an MFM 11e row.
  for (const node of nodeMap.values()) {
    if (applyPointsPriority(node, options.mfmCostingByDatasheetId)) {
      stats.mfmPointsApplied++
    }
  }

  const nodes = [...nodeMap.values()]
  stats.outputNodes = nodes.length

  // Step 4d: stamp `updatedInEleventh: true` on every 10e node whose 11e
  // companion is in the merged graph. Bit-flag for UI consumption — the
  // actual delta lives on the 11e companion node.
  stats.updatedInEleventhFlagged = stampUpdatedInEleventh(nodes)

  // Step 5 + 6: Deduplicate refs and drop orphans (either endpoint missing)
  const nodeIdSet = new Set(nodes.map((n) => n.id))
  const refKeySet = new Set<string>()
  const dedupedRefs: NodeRef[] = []

  for (const ref of allRefs) {
    // Drop orphan refs — remove if EITHER endpoint is absent
    if (!nodeIdSet.has(ref.sourceId) || !nodeIdSet.has(ref.targetId)) continue

    const key = `${ref.sourceId}|${ref.targetId}|${ref.rel}`
    if (refKeySet.has(key)) {
      stats.refsDeduped++
      continue
    }
    refKeySet.add(key)
    dedupedRefs.push(ref)
  }

  // Step 7: Post-merge invariant gates. Two regressions today caused weeks of
  // silent damage — untagged-edition nodes and shadow factionIds — so the gates
  // run on every build. Default to warn + auto-fix; the factionId gate throws
  // a `BuildGateError` only when auto-fix can't repair a node (still-orphaned
  // > 0), which surfaces as a non-zero exit in build-graph.ts.
  // See docs/superpowers/plans/2026-06-27-data-problems-followup.md step 9.
  stats.editionGate = runEditionGate(nodes)
  stats.factionIdGate = runFactionIdGate(nodes)

  return { nodes, refs: dedupedRefs, stats }
}
