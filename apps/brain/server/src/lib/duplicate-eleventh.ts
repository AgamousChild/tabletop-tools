/**
 * Duplicate a frozen 10e graph (from Wahapedia) into a parallel 11e graph
 * with the `11e:` id prefix.
 *
 * Rule 5 says 11e is the target edition; the prior strategy of mass-promoting
 * 10e nodes to 11e destroyed every bookmark / brain:link / Vectorize entry
 * pointing at a Wahapedia numeric id. The fix is the original directive: the
 * 10e set stays frozen with stable Wahapedia ids; the 11e set is a separate
 * duplicate-with-prefix that 11e faction-pack overrides + MFM points apply
 * to. Both editions coexist in R2 keyed by `?edition=`.
 *
 * Input contract:
 *   - The caller passes the Wahapedia-emitted slice of the graph (nodes
 *     tagged `edition: '10th'`, plus the refs that originated from
 *     `convertGameData`). Nodes from any other source (faction packs, MFM
 *     detachments, core rules, missions, etc.) are NOT duplicated — they
 *     already have their own per-edition lifecycle.
 *
 * Output:
 *   - One 11e node per input node. The new node carries `id: '11e:' + old.id`,
 *     `edition: '11th'`, `datasheetId: '11e:' + old.datasheetId` when present,
 *     `detachmentId: '11e:' + old.detachmentId` when present. Content,
 *     summary, factionId, and every structured field copy verbatim — the 11e
 *     MFM costing pass + faction-pack overrides will mutate these copies later.
 *   - One 11e ref per input ref, with both endpoints rewritten:
 *       - If the ref points at an id we just duplicated, the endpoint
 *         becomes `'11e:' + originalId`.
 *       - Otherwise the endpoint is left alone (faction-root nodes, core
 *         rules nodes, mission nodes — these aren't edition-specific and
 *         the 11e copy should still point at the same target).
 *   - `sources` array is copied by reference (Source objects are stable; the
 *     downstream merge won't mutate them).
 */
import type { Node, NodeRef } from './model'

const ELEVENTH_PREFIX = '11e:'

export interface DuplicateEleventhResult {
  nodes: Node[]
  refs: NodeRef[]
  /**
   * Map from 10e id → 11e id. Useful for downstream consumers that need to
   * translate keys (e.g. re-keying the MFM points lookup so it applies to
   * 11e copies, not 10e originals).
   */
  idMap: Map<string, string>
}

/**
 * MFM allow-list for the 11e duplicate promotion.
 *
 * Keys: `${factionId}::${slugifiedTitle}` (lower-case, non-alpha stripped).
 * Values: ignored (presence is the signal).
 *
 * When provided, only `detachment-rule` nodes whose key appears in the
 * allow-list are promoted to 11e. Nodes that are NOT detachment-rules
 * (datasheets, weapons, abilities, stratagems, enhancements …) are always
 * promoted regardless of the allow-list — the list only gates detachment-rule
 * promotion so retired-for-11e detachments stay 10e-only.
 */
export type MfmAllowlist = ReadonlySet<string>

/**
 * Build a normalised allow-list key from a faction id and a title.
 * Normalisation: lower-case → strip all non-alphanumeric chars.
 * This matches the normalisation used in the report reconciliation doc
 * (String.toLowerCase().replace(/[^a-z0-9]+/g, '')).
 */
export function mfmAllowlistKey(factionId: string, title: string): string {
  const normalTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '')
  return `${factionId}::${normalTitle}`
}

/**
 * Build an 11e parallel dataset from the 10e Wahapedia-emitted slice.
 *
 * The function is intentionally pure — it doesn't read `edition` to decide
 * what to copy. Callers pass exactly the nodes they want duplicated. Most
 * commonly that's the result of `convertGameData()` filtered to its own
 * output (all of which is tagged 10th by the parser).
 *
 * `mfmAllowlist` — when provided, `detachment-rule` nodes whose
 * `${factionId}::${normalizedTitle}` key is NOT in the allow-list will NOT
 * be promoted to 11e. This is how we retire the 25 Wahapedia-only 10e
 * detachments that GW removed from 11e play. All other node categories are
 * unaffected.
 */
export function duplicateEleventh(
  tenthNodes: ReadonlyArray<Node>,
  tenthRefs: ReadonlyArray<NodeRef>,
  mfmAllowlist?: MfmAllowlist,
): DuplicateEleventhResult {
  // Build the id map first, but selectively exclude detachment-rule nodes
  // that are NOT in the MFM allow-list (retired-for-11e).
  const idMap = new Map<string, string>()
  // Track excluded detachment ids so we can also skip their children.
  const excludedDetachmentIds = new Set<string>()
  for (const node of tenthNodes) {
    if (
      node.category === 'detachment-rule' &&
      mfmAllowlist !== undefined &&
      node.factionId &&
      !mfmAllowlist.has(mfmAllowlistKey(node.factionId, node.title))
    ) {
      // Retired for 11e — exclude from idMap and record id so children skip too.
      excludedDetachmentIds.add(node.id)
      // Also exclude by detachmentId slug if present (Wahapedia uses detachmentId
      // as a stable slug on the rule node itself).
      if (node.detachmentId && node.detachmentId !== node.id) {
        excludedDetachmentIds.add(node.detachmentId)
      }
      continue
    }
    idMap.set(node.id, ELEVENTH_PREFIX + node.id)
  }

  const nodes: Node[] = []
  for (const original of tenthNodes) {
    // Skip nodes not in the id map (retired detachment-rules).
    if (!idMap.has(original.id)) continue
    // Skip children of excluded detachments (stratagems/enhancements/abilities
    // whose detachmentId or datasheetId points at a retired detachment).
    if (
      excludedDetachmentIds.size > 0 &&
      original.detachmentId &&
      (excludedDetachmentIds.has(original.detachmentId) ||
        // Wahapedia child nodes carry detachmentId = parent's detachmentId slug
        // (e.g. 'gladius-task-force') which may differ from parent's node id.
        excludedDetachmentIds.has(original.detachmentId))
    ) {
      continue
    }
    const duplicate: Node = {
      ...original,
      id: idMap.get(original.id)!,
      edition: '11th',
      // Reset the version on the 11e copy. The 10e original stays at its own
      // version; bumps to the 11e copy (via MFM points overrides + faction
      // pack patches) are version 1 of a parallel lineage.
      version: 1,
      // Shallow-clone the keyword list so later mutations don't bleed back
      // onto the 10e original. (`sources` are conceptually frozen Source
      // objects — sharing the reference is safe.)
      keywords: [...original.keywords],
      refs: original.refs.map((r) => translateRef(r, idMap)),
    }
    // Translate structured ids that participate in the brain's id graph.
    // `datasheetId` on weapons / abilities is how worker.ts maps url → unit;
    // `detachmentId` is how the brain joins stratagems to their parent.
    if (original.datasheetId && idMap.has(original.datasheetId)) {
      duplicate.datasheetId = idMap.get(original.datasheetId)!
    } else if (original.datasheetId === original.id) {
      // The datasheet node points its own datasheetId at its own surface id.
      // Always translate so the 11e copy is internally consistent.
      duplicate.datasheetId = idMap.get(original.id)!
    }
    if (original.detachmentId && idMap.has(original.detachmentId)) {
      duplicate.detachmentId = idMap.get(original.detachmentId)!
    }
    nodes.push(duplicate)
  }

  const refs: NodeRef[] = tenthRefs.map((ref) => translateRef(ref, idMap))

  return { nodes, refs, idMap }
}

/**
 * Rewrite both endpoints of a ref through the 10e→11e id map. Endpoints that
 * aren't in the map (faction-root nodes, core-rules nodes, mission nodes —
 * anything that lives outside the duplicated slice) pass through untouched
 * so the 11e copy keeps pointing at the right shared target.
 */
function translateRef(ref: NodeRef, idMap: ReadonlyMap<string, string>): NodeRef {
  const newSource = idMap.get(ref.sourceId) ?? ref.sourceId
  const newTarget = idMap.get(ref.targetId) ?? ref.targetId
  if (newSource === ref.sourceId && newTarget === ref.targetId) return ref
  return { ...ref, sourceId: newSource, targetId: newTarget }
}

/**
 * Re-key a BSData-hash-keyed map (such as the MFM points lookup) into the
 * 11e surface-id keyspace. Use this in build-graph.ts after running both
 * `convertGameData()` (which gives us `bsdataIdToSurfaceId`) and
 * `duplicateEleventh()` so the MFM costing pass targets the 11e copies, not
 * the 10e originals.
 *
 * Lookup path: MFM key (BSData hash) → Wahapedia surface id → 11e copy id.
 */
export function rekeyByEleventhSurfaceId<V>(
  byBsdataHash: ReadonlyMap<string, V>,
  bsdataIdToSurfaceId: ReadonlyMap<string, string>,
): Map<string, V> {
  const out = new Map<string, V>()
  for (const [bsdataHash, value] of byBsdataHash) {
    const surfaceId = bsdataIdToSurfaceId.get(bsdataHash)
    if (!surfaceId) continue
    out.set(ELEVENTH_PREFIX + surfaceId, value)
  }
  return out
}
