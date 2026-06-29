/**
 * Parse MFM (Munitorum Field Manual) detachment + enhancement rows produced
 * by `apps/data-import` and emit brain Nodes + NodeRefs.
 *
 * MFM is the 11e source of truth for detachments. Each detachment row carries
 * `dp` (detachment points), `objective`, optional sub-faction `unique` marker,
 * and an `enhancements` array (each with `points` and optional `leaderTo`).
 *
 * This parser does NOT touch the network — sync to R2 happens in the
 * data-import worker, sync down to disk happens via the build script. We just
 * read the local JSON file (when present) and translate it into brain graph
 * nodes that join the same merge pipeline as every other source.
 *
 * @see apps/data-import/server/src/lib/sources/mfm.ts — upstream YAML parser
 * @see apps/brain/server/src/build-graph.ts — where this parser is wired in
 * @see docs/superpowers/plans/2026-06-27-data-problems-followup.md step 6
 */
import { existsSync, readFileSync } from 'fs'

import { normalizeFactionId } from '../faction-codes'
import type { Node, NodeRef, Source } from '../model'
import { slugify } from '../slugify'

/** One row of `mfm-detachments.json` as emitted by the data-import worker. */
export interface MfmDetachmentRow {
  factionSlug: string
  name: string
  /** Detachment points (1–3). `null` when the source page omits a DP cost. */
  dp: number | null
  /** Detachment objective / flavour text. `null` when the source omits it. */
  objective: string | null
  /** Sub-faction keyword the detachment is restricted to (UNIQUE banner). */
  unique?: string
  enhancements: MfmEnhancementRow[]
}

export interface MfmEnhancementRow {
  name: string
  points: number
  /** Units this enhancement unlocks the Leader ability for. */
  leaderTo?: string[]
}

export interface MfmDetachmentsParseResult {
  nodes: Node[]
  refs: NodeRef[]
  /** Number of detachment rows seen in the input (informational). */
  totalDetachments: number
  /** Number of enhancement rows seen across all detachments. */
  totalEnhancements: number
}

/**
 * Read and parse `mfm-detachments.json` from a local path.
 *
 * Returns an empty result when the file does not exist — the brain build is
 * resilient to missing MFM data (10e detachments remain as legacy fallback).
 */
export function loadMfmDetachmentsFromFile(
  path: string,
  retrievedAt: string,
  publishedAt?: string,
): MfmDetachmentsParseResult {
  if (!existsSync(path)) {
    return { nodes: [], refs: [], totalDetachments: 0, totalEnhancements: 0 }
  }
  const text = readFileSync(path, 'utf-8')
  return parseMfmDetachments(text, retrievedAt, publishedAt)
}

/**
 * Parse `mfm-detachments.json` text into brain nodes + refs.
 *
 * Each detachment becomes a `category: 'detachment'`, `layer: 'faction'`,
 * `edition: '11th'` node. Each enhancement becomes a
 * `category: 'enhancement'`, `layer: 'faction'`, `edition: '11th'` node
 * with `detachmentId` set to the parent detachment node id, and a
 * `rel: 'part_of'` NodeRef linking enhancement → detachment.
 *
 * Faction slugs from MFM (`chaos-knights`, `tau-empire`, etc.) are run
 * through `normalizeFactionId()` so they collapse onto canonical brain
 * faction slugs.
 */
export function parseMfmDetachments(
  jsonText: string,
  retrievedAt: string,
  publishedAt?: string,
): MfmDetachmentsParseResult {
  const raw = JSON.parse(jsonText) as MfmDetachmentRow[]
  if (!Array.isArray(raw)) {
    throw new Error('mfm-detachments.json: expected a JSON array at root')
  }

  const nodes: Node[] = []
  const refs: NodeRef[] = []
  let totalDetachments = 0
  let totalEnhancements = 0

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    if (typeof row.name !== 'string' || row.name.length === 0) continue
    if (typeof row.factionSlug !== 'string' || row.factionSlug.length === 0) continue

    totalDetachments++
    const canonicalFactionId = normalizeFactionId(row.factionSlug)
    const detSlug = slugify(row.name)
    const detId = `mfm:det:${canonicalFactionId}:${detSlug}`

    const source: Source = {
      type: 'manual',
      title: 'Munitorum Field Manual (11e)',
      url: 'https://mfm.warhammer-community.com/',
      retrievedAt,
      ...(publishedAt ? { publishedAt } : {}),
    }

    nodes.push(buildDetachmentNode(row, canonicalFactionId, detId, source))

    if (!Array.isArray(row.enhancements)) continue
    for (const enh of row.enhancements) {
      if (!enh || typeof enh !== 'object') continue
      if (typeof enh.name !== 'string' || enh.name.length === 0) continue
      if (typeof enh.points !== 'number') continue
      totalEnhancements++
      const enhId = `mfm:enh:${canonicalFactionId}:${detSlug}:${slugify(enh.name)}`

      nodes.push(buildEnhancementNode(enh, row, canonicalFactionId, detId, enhId, source))
      refs.push({
        sourceId: enhId,
        targetId: detId,
        rel: 'part_of',
        context: `${enh.name} is an enhancement in the ${row.name} detachment`,
      })
    }
  }

  return { nodes, refs, totalDetachments, totalEnhancements }
}

function buildDetachmentNode(
  row: MfmDetachmentRow,
  factionId: string,
  detId: string,
  source: Source,
): Node {
  const contentLines: string[] = [`**${row.name}**`]
  if (typeof row.dp === 'number') {
    contentLines.push(`**Detachment Points:** ${row.dp}`)
  }
  if (row.unique) {
    contentLines.push(`**Unique to:** ${row.unique}`)
  }
  if (row.objective) {
    contentLines.push('', row.objective)
  }

  const dpFragment = typeof row.dp === 'number' ? ` (${row.dp} DP)` : ''
  const uniqueFragment = row.unique ? ` — restricted to ${row.unique}` : ''
  const objectiveFragment = row.objective ? ` ${row.objective}` : ''

  const keywords = [
    row.name.toLowerCase(),
    'detachment',
    '11th edition',
    factionId,
    ...(row.unique ? [row.unique.toLowerCase()] : []),
  ]

  return {
    id: detId,
    layer: 'faction',
    category: 'detachment',
    title: row.name,
    content: contentLines.join('\n'),
    summary:
      `${row.name} — 11th Edition ${factionId} detachment${dpFragment}${uniqueFragment}.${objectiveFragment}`.trim(),
    factionId,
    edition: '11th',
    ...(typeof row.dp === 'number' ? { dp: row.dp } : {}),
    ...(row.objective ? { forceDisposition: row.objective } : {}),
    ...(row.unique ? { subfaction: row.unique } : {}),
    sources: [source],
    refs: [],
    version: 1,
    keywords,
  }
}

function buildEnhancementNode(
  enh: MfmEnhancementRow,
  row: MfmDetachmentRow,
  factionId: string,
  detId: string,
  enhId: string,
  source: Source,
): Node {
  const contentLines: string[] = [`**${enh.name}** (${enh.points} pts)`]
  if (enh.leaderTo && enh.leaderTo.length > 0) {
    contentLines.push(`**Leader to:** ${enh.leaderTo.join(', ')}`)
  }

  const leaderFragment =
    enh.leaderTo && enh.leaderTo.length > 0 ? ` Grants Leader to: ${enh.leaderTo.join(', ')}.` : ''

  const keywords = [
    enh.name.toLowerCase(),
    'enhancement',
    '11th edition',
    factionId,
    row.name.toLowerCase(),
    ...(enh.leaderTo ?? []).map((s) => s.toLowerCase()),
  ]

  // attachesTo: MFM rows encode the leader/unit distinction via the `leaderTo`
  // array. Non-empty array → enhancement attaches to a leader (a specific
  // CHARACTER model). Empty/missing → attaches to the bearer's unit.
  const attachesTo: 'leader' | 'unit' = enh.leaderTo && enh.leaderTo.length > 0 ? 'leader' : 'unit'

  return {
    id: enhId,
    layer: 'faction',
    category: 'enhancement',
    title: enh.name,
    content: contentLines.join('\n'),
    summary:
      `${enh.name} — ${enh.points} pts enhancement in the ${row.name} detachment.${leaderFragment}`.trim(),
    factionId,
    detachmentId: detId,
    edition: '11th',
    cost: enh.points,
    attachesTo,
    ...(row.unique ? { subfaction: row.unique } : {}),
    sources: [source],
    refs: [],
    version: 1,
    keywords,
  }
}
