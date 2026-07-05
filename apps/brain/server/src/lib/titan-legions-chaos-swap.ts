/**
 * Generate `chaos-titan-legions` (Titanicus Traitoris) variants from
 * `titan-legions` nodes.
 *
 * ── The swap rule (from `imperial-armour-titans.md` +
 *    `faction-pack-adeptus-titanicus.md`) ────────────────────────────────
 *
 *   > You can use the Titan Legions datasheets in this document to
 *   > represent Titanicus Traitoris models if you wish. To do so, on those
 *   > datasheets and on this Army Rules card, replace all instances of the
 *   > Imperium keyword with Chaos, and replace all instances of the
 *   > Titan Legions Faction keyword with Titanicus Traitoris. For the
 *   > purposes of points values, use those published for the equivalent
 *   > Titan Legions models.
 *
 * ── What this module does ─────────────────────────────────────────────────
 *
 * Given the full brain node array, find every `factionId ===
 * 'titan-legions'` node and clone it under `factionId ===
 * 'chaos-titan-legions'` with:
 *
 *   - `id` prefixed with `chaos-titan-legions:` (before the source-slug
 *     part) so the variant lives at a stable, deterministic id and never
 *     collides with the loyalist ids.
 *   - Two text substitutions applied to `title`, `content`, `summary`,
 *     `keywords`, `factionName`, and matched inline strings: `Imperium →
 *     Chaos` and `Adeptus Titanicus → Titanicus Traitoris` (case-sensitive
 *     and case-insensitive variants both handled). Note that the SOURCE
 *     BODY still uses the phrase "Adeptus Titanicus" as GW's original
 *     keyword — the swap pattern targets that phrase in the text. The
 *     brain's canonical faction slug for the loyalist side is
 *     `titan-legions` (per dim_faction); the phrase "Adeptus Titanicus"
 *     survives only inside prose that GW wrote.
 *   - `datasheetId` / `detachmentId` retargeted to the chaos variant's own
 *     id so weapon/ability children of a chaos datasheet resolve to that
 *     datasheet, not the loyalist twin.
 *   - `edition` preserved from the source node (10e stays 10e, 11e twins
 *     stay 11e — the chaos variant tracks the same lifecycle as its
 *     loyalist source).
 *
 * Refs pointing at loyalist ids are duplicated with both endpoints
 * translated through the same id-map, so the chaos side of the graph is
 * self-consistent — an `ability:X:...` chaos node still `part_of` its
 * chaos datasheet, not the loyalist one.
 *
 * ── Why this is a code-level swap (not a data ingest) ─────────────────────
 *
 * The chaos variant has ZERO independent content — GW publishes only the
 * keyword-swap rule and never the concrete "Chaos Warhound Titan"
 * datasheet. Emitting the swapped copies at build time is the only
 * community-legal way to surface these units in the brain without
 * committing any GW text of our own. The swap logic itself is 2 regex
 * substitutions and lives here in the brain build so it re-runs on every
 * data refresh — Rule 4 (everything is a callable function).
 */
import type { Node, NodeRef } from './model'

const LOYALIST_FACTION_ID = 'titan-legions'
const CHAOS_FACTION_ID = 'chaos-titan-legions'
/** Prefix inserted at the front of every emitted chaos id. */
const CHAOS_ID_PREFIX = 'chaos-titan-legions:'

/**
 * Apply the two keyword swaps from the Titanicus Traitoris rule to arbitrary
 * text (datasheet body, title, summary, keyword list entries, etc.).
 *
 * Order matters: `Adeptus Titanicus` MUST be replaced before `Imperium`
 * would be, because the phrase "Adeptus Titanicus" is often adjacent to
 * "Imperium" in the same paragraph and the compound rewrite reads more
 * naturally when done as a phrase-first pass.
 *
 * Both substitutions are case-insensitive (via `gi`) but preserve the
 * casing of the FIRST character of the match — GW writes the keyword in
 * ALL CAPS in some places (`KEYWORDS: ... Imperium ...`), title case in
 * others (`Adeptus Titanicus Faction keyword`), and lower-case in still
 * others. A blind uppercase would clobber prose.
 */
export function swapKeywords(input: string): string {
  if (!input) return input
  const stepA = input.replace(/Adeptus Titanicus/gi, (match) =>
    preserveCasing(match, 'Titanicus Traitoris'),
  )
  const stepB = stepA.replace(/\bImperium\b/gi, (match) => preserveCasing(match, 'Chaos'))
  return stepB
}

/** Mirror the casing of `sample` onto `replacement`. */
function preserveCasing(sample: string, replacement: string): string {
  // Whole-string ALL CAPS check — a run like "IMPERIUM" or "ADEPTUS TITANICUS"
  // should map to "CHAOS" / "TITANICUS TRAITORIS" respectively.
  if (sample === sample.toUpperCase() && /[A-Z]/.test(sample)) {
    return replacement.toUpperCase()
  }
  // Whole-string lowercase — "imperium" → "chaos".
  if (sample === sample.toLowerCase() && /[a-z]/.test(sample)) {
    return replacement.toLowerCase()
  }
  // Otherwise assume Title Case-ish input; return the canonical form.
  return replacement
}

/**
 * Rewrite a `titan-legions` id into its `chaos-titan-legions` variant.
 *
 * Strategy: prefix the entire original id with `chaos-titan-legions:`. This
 * is intentionally opaque — the id is a stable key, not a display value,
 * and prefixing keeps parity between edition twins (10e loyalist id →
 * `chaos-titan-legions:<id>` chaos variant; 11e loyalist twin `11e:<id>` →
 * `chaos-titan-legions:11e:<id>`). Downstream consumers do not need to
 * parse the id — they route by `factionId`.
 */
function chaosId(loyalistId: string): string {
  return `${CHAOS_ID_PREFIX}${loyalistId}`
}

/**
 * Build a chaos-titan-legions variant of a single loyalist node.
 *
 * Callers pass the full id-map (loyalist id → chaos id) so ref endpoints
 * that already exist in the map can be translated. External refs
 * (`core:*`, `faction:titan-legions:*` faction root when it isn't in
 * the swap set, etc.) pass through unmodified — those targets are shared
 * cross-faction.
 */
function swapNode(source: Node, idMap: ReadonlyMap<string, string>): Node {
  const newId = idMap.get(source.id)!
  const swapped: Node = {
    ...source,
    id: newId,
    factionId: CHAOS_FACTION_ID,
    factionName: source.factionName ? swapKeywords(source.factionName) : source.factionName,
    title: swapKeywords(source.title),
    content: swapKeywords(source.content),
    summary: swapKeywords(source.summary),
    keywords: source.keywords.map(swapKeywords),
    refs: source.refs.map((r) => translateRef(r, idMap)),
    // Version starts at 1 for the chaos lineage — future edits track their
    // own version independent of the loyalist source node.
    version: 1,
  }
  // Rewrite structured id fields so child resolution stays inside the chaos
  // faction. A `weapon:000000867:...` chaos variant is under
  // `chaos-titan-legions:weapon:000000867:...` and its `datasheetId` needs
  // to point at `chaos-titan-legions:000000867`, not the loyalist twin.
  if (source.datasheetId) {
    swapped.datasheetId = idMap.get(source.datasheetId) ?? source.datasheetId
  }
  if (source.detachmentId) {
    swapped.detachmentId = idMap.get(source.detachmentId) ?? source.detachmentId
  }
  return swapped
}

function translateRef(ref: NodeRef, idMap: ReadonlyMap<string, string>): NodeRef {
  const newSource = idMap.get(ref.sourceId) ?? ref.sourceId
  const newTarget = idMap.get(ref.targetId) ?? ref.targetId
  if (newSource === ref.sourceId && newTarget === ref.targetId) {
    return { ...ref, context: swapKeywords(ref.context) }
  }
  return {
    ...ref,
    sourceId: newSource,
    targetId: newTarget,
    context: swapKeywords(ref.context),
  }
}

export interface EmitChaosTitanLegionsResult {
  nodes: Node[]
  refs: NodeRef[]
  /** Loyalist id → chaos id, for any downstream consumers that need it. */
  idMap: Map<string, string>
}

/**
 * Scan `allNodes` + `allRefs` for `factionId === 'titan-legions'`
 * entries and produce their chaos-titan-legions variants.
 *
 * This is a pure function — the input arrays are not mutated. The caller
 * pushes the returned nodes/refs into the graph after the merge pass so
 * they don't get deduped away or gated (the chaos ids are always novel;
 * they can't collide with anything else).
 *
 * Idempotent: running twice on the same input produces the same output.
 * Running it against an input that already contains chaos-titan-legions
 * nodes is a no-op for those (they are skipped — we don't swap chaos back
 * into chaos).
 */
export function emitChaosTitanLegionsVariants(
  allNodes: ReadonlyArray<Node>,
  allRefs: ReadonlyArray<NodeRef>,
): EmitChaosTitanLegionsResult {
  // Pass 1: build the id-map so refs can translate endpoints in one go.
  const idMap = new Map<string, string>()
  for (const node of allNodes) {
    if (node.factionId === LOYALIST_FACTION_ID) {
      idMap.set(node.id, chaosId(node.id))
    }
  }

  // Pass 2: emit the swapped nodes.
  const nodes: Node[] = []
  for (const node of allNodes) {
    if (node.factionId !== LOYALIST_FACTION_ID) continue
    nodes.push(swapNode(node, idMap))
  }

  // Pass 3: emit the swapped refs. A ref is included when either endpoint
  // is in the swap set — otherwise it belongs to some unrelated slice of
  // the graph and doesn't need a chaos copy.
  const refs: NodeRef[] = []
  for (const ref of allRefs) {
    if (!idMap.has(ref.sourceId) && !idMap.has(ref.targetId)) continue
    refs.push(translateRef(ref, idMap))
  }

  return { nodes, refs, idMap }
}
