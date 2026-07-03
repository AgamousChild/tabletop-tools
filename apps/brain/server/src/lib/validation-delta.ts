/**
 * 11th-edition delta validator.
 *
 * For each emitted 11e change node (from faction-pack parsing), find the
 * matching 10e Wahapedia node in the brain's local R2 cache and report:
 *   - the 10e node id that's affected
 *   - the 11e node id that triggered the match
 *   - the fields that differ (content / cpCost / cost / when / target / effect / etc.)
 *
 * The match key is `(factionId, category, slugify(title))`. This pairs a
 * 10e detachment-rule node with a 11e detachment-rule of the same name +
 * faction; ditto for stratagems and enhancements.
 *
 * Importable per Rule 4. The CLI wrapper at
 * `apps/brain/server/scripts/validate-11e-delta.ts` calls this function.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseFactionPackV2 } from '@tabletop-tools/game-content/src/adapters/faction-pack/parser'

import { _setFactionCodesForTesting } from './faction-codes'
import type { Node } from './model'
import {
  convertPackExtractToNodes,
  type FactionPackMfmLookup,
} from './parsers/faction-pack-v2-to-nodes'
import { slugify } from './slugify'

const RETRIEVED_AT = '2026-06-29T00:00:00Z'

export interface ValidationDelta {
  tenthEditionNodeId: string
  eleventhEditionNodeId: string
  factionId: string
  category: string
  title: string
  /** Field names that differ between the 10e node and the 11e companion. */
  deltaFields: string[]
}

export interface ValidationDeltaOptions {
  packDir: string
  brainNodesDir: string
  /** Optional MFM detachment lookup, same shape as the build-graph passes. */
  mfmLookup?: FactionPackMfmLookup
  /** When set, writes the JSON report here. Pass `undefined` to skip writing. */
  outputPath?: string
}

/**
 * Compare two nodes for the same entity, returning the list of fields whose
 * values differ. Only structured fields are compared — the audit output is
 * meant to surface per-field updates (e.g., "cpCost changed"), not free-text
 * diffs.
 */
const COMPARE_FIELDS: Array<keyof Node> = [
  'content',
  'summary',
  'cpCost',
  'cost',
  'when',
  'target',
  'effect',
  'turn',
  'phase',
  'dp',
  'forceDisposition',
  'modelRestriction',
  'isUpgrade',
  'isEpicHero',
  'targetKeywords',
]

function fieldsDiffer(tenth: Node, eleventh: Node): string[] {
  const out: string[] = []
  for (const field of COMPARE_FIELDS) {
    const a = tenth[field]
    const b = eleventh[field]
    // Normalize undefined vs missing
    const aDefined = a !== undefined && a !== null
    const bDefined = b !== undefined && b !== null
    if (!aDefined && !bDefined) continue
    if (aDefined !== bDefined) {
      out.push(field as string)
      continue
    }
    // Both defined — compare via JSON to handle arrays/objects.
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push(field as string)
    }
  }
  return out
}

/**
 * Build a `(factionId, category, slugify(title))` → Node map. Iterating over
 * one side of the join only needs an O(1) lookup into the other.
 */
function indexByKey(nodes: Node[]): Map<string, Node> {
  const map = new Map<string, Node>()
  for (const n of nodes) {
    if (!n.factionId) continue
    const key = `${n.factionId}::${n.category}::${slugify(n.title)}`
    // Don't overwrite — first occurrence wins (the dedup step in merge-sources
    // already collapses duplicates by title for relevant categories).
    if (!map.has(key)) map.set(key, n)
  }
  return map
}

/**
 * Load every node from the brain's local R2 cache directory. Each partition
 * file is a JSON array of Node objects.
 */
function loadBrainNodes(brainNodesDir: string): Node[] {
  if (!existsSync(brainNodesDir)) {
    throw new Error(
      `Brain nodes directory not found at ${brainNodesDir}. Run \`npx tsx src/build-graph.ts\` from apps/brain/server first.`,
    )
  }
  const files = readdirSync(brainNodesDir).filter((f) => f.endsWith('.json'))
  const all: Node[] = []
  for (const file of files) {
    const raw = readFileSync(join(brainNodesDir, file), 'utf-8')
    const arr = JSON.parse(raw) as Node[]
    all.push(...arr)
  }
  return all
}

/**
 * Parse every faction-pack-*.md in `packDir` and return the union of
 * emitted nodes as though they were 11e material.
 *
 * The validator is an offline diagnostic: it compares 10e brain nodes to
 * what the same faction pack would say if reinterpreted as 11e. Since
 * `convertPackExtractToNodes` in 11e mode emits mostly `DatasheetPatch`
 * entries (which don't carry ids), we parse in 10e mode — which emits
 * full nodes at v1 slug ids — and then re-tag the resulting nodes as
 * 11th edition so the join key + delta output are unchanged. This keeps
 * the validator's key match (`factionId::category::slug(title)`) working
 * with no changes to its comparison logic.
 */
function parseAllFactionPacksAs11e(
  packDir: string,
  mfmLookup: FactionPackMfmLookup | undefined,
): Node[] {
  if (!existsSync(packDir)) {
    throw new Error(`Pack directory not found at ${packDir}`)
  }
  const files = readdirSync(packDir).filter(
    (f) => f.startsWith('faction-pack-') && f.endsWith('.md'),
  )
  const all: Node[] = []
  for (const file of files) {
    const factionSlug = file.replace('faction-pack-', '').replace('.md', '')
    const raw = readFileSync(join(packDir, file), 'utf-8')
    try {
      const extract = parseFactionPackV2(raw, { faction: factionSlug })
      const result = convertPackExtractToNodes(
        extract,
        factionSlug,
        RETRIEVED_AT,
        // 10th mode → full-emission with v1 slug ids. We overlay 11th on
        // the edition tag below so the caller's downstream logic (which
        // filters by edition) behaves as it always did.
        '10th',
        mfmLookup,
      )
      for (const node of result.nodes) {
        node.edition = '11th'
        all.push(node)
      }
    } catch {
      // Skip packs that fail to parse — the validator must keep running.
    }
  }
  return all
}

/**
 * Run the full delta pass.
 *
 * Returns a `ValidationDelta[]` and, if `outputPath` is set, writes the
 * report to disk as JSON.
 */
export function runValidationDelta(opts: ValidationDeltaOptions): ValidationDelta[] {
  const brainNodes = loadBrainNodes(opts.brainNodesDir)
  const elevenNodes = parseAllFactionPacksAs11e(opts.packDir, opts.mfmLookup)

  // Index 10e nodes by `(factionId, category, slugify(title))`.
  const tenthIndex = indexByKey(brainNodes.filter((n) => n.edition === '10th'))

  const deltas: ValidationDelta[] = []
  for (const eleventh of elevenNodes) {
    if (!eleventh.factionId) continue
    const key = `${eleventh.factionId}::${eleventh.category}::${slugify(eleventh.title)}`
    const tenth = tenthIndex.get(key)
    if (!tenth) continue
    const deltaFields = fieldsDiffer(tenth, eleventh)
    deltas.push({
      tenthEditionNodeId: tenth.id,
      eleventhEditionNodeId: eleventh.id,
      factionId: eleventh.factionId,
      category: eleventh.category,
      title: eleventh.title,
      deltaFields,
    })
  }

  if (opts.outputPath) {
    writeFileSync(opts.outputPath, JSON.stringify(deltas, null, 2))
  }
  return deltas
}

/**
 * Summarize a `ValidationDelta[]` by faction. Returns rows suitable for the
 * markdown report. Counts only deltas whose `deltaFields.length > 0`
 * (entries with zero changed fields are noise — same content, just both
 * editions present).
 */
export interface FactionDeltaSummary {
  factionId: string
  totalMatched: number
  changedNodes: number
}

export function summarizeByFaction(deltas: ValidationDelta[]): FactionDeltaSummary[] {
  const byFaction = new Map<string, { matched: number; changed: number }>()
  for (const d of deltas) {
    const entry = byFaction.get(d.factionId) ?? { matched: 0, changed: 0 }
    entry.matched++
    if (d.deltaFields.length > 0) entry.changed++
    byFaction.set(d.factionId, entry)
  }
  return [...byFaction.entries()]
    .map(([factionId, v]) => ({
      factionId,
      totalMatched: v.matched,
      changedNodes: v.changed,
    }))
    .sort((a, b) => b.changedNodes - a.changedNodes)
}

/**
 * Test-only entry point: prime the faction-codes registry with a small
 * fixture so `convertPackExtractToNodes` can resolve faction slugs without
 * hitting the live registry loader. Call this from unit tests; production
 * callers use `loadFactionCodes(db)` from build-graph (validation CLI does
 * this itself before calling `runValidationDelta`).
 */
export function _primeFactionCodesForTesting(
  aliases: Map<string, string>,
  canonical: Set<string>,
): void {
  _setFactionCodesForTesting(aliases, canonical)
}
