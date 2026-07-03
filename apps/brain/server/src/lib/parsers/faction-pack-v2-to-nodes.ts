/**
 * Translate a v2 `PackExtract` (from
 * `@tabletop-tools/game-content/adapters/faction-pack`) into brain
 * `Node[]` + `NodeRef[]` (+ `DatasheetPatch[]` for 11e overlays).
 *
 * ── Emit shape depends on `edition` ─────────────────────────────────────
 *
 * When `edition === '10th'` (or unset) — full-emission mode, preserved from
 * v1 so the 10e Wahapedia + faction-pack graph continues to merge as before:
 *
 *   - Detachment (own node):     `det:${factionSlug}:${slug(detname)}`
 *   - Detachment rule / extra:   `det:${factionSlug}:${slug(detname)}:${slug(rulename)}`  (category=faction-ability)
 *   - Enhancement:               `det:${factionSlug}:${slug(detname)}:${slug(enhname)}`   (category=enhancement)
 *   - Stratagem:                 `det:${factionSlug}:${slug(detname)}:${slug(stratname)}` (category=stratagem)
 *   - Army rule (no detachment): `faction:${factionSlug}:${slug(name)}`                   (category=army-rule)
 *   - Datasheet:                 `datasheet:${factionSlug}:${slug(name)}`                 (category=datasheet)
 *   - Errata:                    `errata:${factionSlug}:p${page}:${slug(target)}`         (layer=errata)
 *   - FAQ:                       `faq:${factionSlug}:${slug(question.substring(0, 60))}`  (layer=errata)
 *
 * When `edition === '11th'` — split-emission mode. v2 is the 11e source of
 * truth, but Wahapedia's 10e→11e duplicate (`duplicate-eleventh.ts`) is what
 * carries the canonical Vectorize id for every 11e overlapping shape. So we
 * emit at most one node per entity across BOTH sources:
 *
 *   - Overlapping shapes (datasheet + inline abilities/weapons, detachment
 *     rule, stratagem, enhancement, faction-ability) → returned as
 *     `patches: DatasheetPatch[]` — not nodes. `build-graph.ts` walks the
 *     patches after `duplicateEleventh` runs and mutates the matching
 *     `11e:*` twin in place. This is how the 11e Bomb Squigs body lands on
 *     `11e:${wahapedia-numeric-id}` rather than at a parallel `datasheet:orks:tankbustas`.
 *   - Non-overlapping shapes (armyRules, errata, FAQs, legendsDatasheets)
 *     → emitted as nodes at `11e:*`-prefixed IDs so they don't collide with
 *     the 10e keyspace.
 *
 * The 11e path deliberately produces zero unprefixed slug nodes.
 */
import type { PackExtract } from '@tabletop-tools/game-content/src/adapters/faction-pack/parser'

import { normalizeFactionId } from '../faction-codes'
import { detectChapterFromText, truncate } from '../filters'
import type { GamePhase, Node, NodeRef, Source } from '../model'
import { slugify } from '../slugify'
import { detectEnhancementAttachesTo } from './game-data'

/**
 * A structured overlay onto an existing 11e Wahapedia-twin node.
 *
 * `build-graph.ts` matches patches to twins by
 * `(factionId, category, targetSlug[, parentSlug])`:
 *   - `factionId` is the canonical faction slug (`normalizeFactionId(factionSlug)`).
 *   - `category` is the brain `NodeCategory` we expect the twin to carry.
 *   - `targetSlug` is `slugify(name)` for the primary entity (datasheet
 *     name for a datasheet patch, ability name for a datasheet-ability
 *     patch, stratagem name for a stratagem patch, etc.).
 *   - `parentSlug` is present for child patches (weapons + abilities on a
 *     datasheet, children on a detachment) so the match can disambiguate
 *     "Bomb Squigs on Tankbustas" from "Bomb Squigs on Breaka Boyz".
 *
 * `contentFields` is a partial `Node` — only the fields we want to overwrite
 * (`content`, `summary`, `stats`, `keywords`, `phase`, `when`, `target`,
 * `effect`, `cpCost`, `cost`, etc.). The patch pass mutates the twin,
 * preserves the twin's id + edition, and sets `updatedInEleventh: true` on
 * the source 10e node via a separate index.
 */
export interface DatasheetPatch {
  factionId: string
  category:
    | 'datasheet'
    | 'detachment-rule'
    | 'faction-ability'
    | 'stratagem'
    | 'enhancement'
    | 'unit-ability'
    | 'weapon'
  targetSlug: string
  /**
   * Present when the patch is a child of another entity (abilities/weapons
   * on a datasheet, detachment children on a detachment). Absent for
   * top-level patches (datasheet, detachment-rule).
   */
  parentSlug?: string
  /** Extra refs to emit at 11e ids alongside the patch (e.g. LEADER/SUPPORT). */
  extraRefs: NodeRef[]
  /** Field overlay for the matching twin. */
  contentFields: Partial<Node>
  /**
   * A fully-formed 11e node at an `11e:*`-prefixed id, used as a fallback
   * when no matching Wahapedia twin is found. This covers brand-new 11e
   * entities that don't exist in the 10e Wahapedia snapshot — new
   * detachments, new stratagems on those detachments, etc. Emitted by
   * `applyFactionPackPatches` alongside the applied patches.
   */
  fallbackNode: Node
  /**
   * Fallback refs to emit alongside `fallbackNode` when the patch is
   * unmatched. Same purpose as `extraRefs` on matched patches — these
   * express the `part_of` / `can_lead` / `can_support` edges from the
   * fallback entity to its neighbours.
   */
  fallbackRefs: NodeRef[]
}

export interface ConvertPackExtractResult {
  nodes: Node[]
  refs: NodeRef[]
  patches: DatasheetPatch[]
}

/**
 * MFM lookup map keyed by `${factionId}::${slugify(detachmentName)}` →
 * the detachment's structured fields from `mfm-detachments.json`. Provided
 * by build-graph.ts after parsing MFM; the converter stamps `dp` and
 * `forceDisposition` onto emitted detachment-rule nodes.
 */
export type FactionPackMfmLookup = Map<string, { dp?: number; forceDisposition?: string }>

/**
 * Detect the edition of a GW faction-pack PDF from its asset URL. Any URL
 * that doesn't match a known 11e prefix is treated as 10th edition.
 */
export function detectFactionPackEdition(assetUrl: string): '10th' | '11th' {
  const elevenPrefixes = ['eng_11-02_', 'eng_07-01_']
  for (const prefix of elevenPrefixes) {
    if (assetUrl.includes(prefix)) return '11th'
  }
  return '10th'
}

function detectPhaseFromWhen(whenText: string): GamePhase | undefined {
  const lower = whenText.toLowerCase()
  if (lower.includes('shooting phase')) return 'shooting'
  if (lower.includes('command phase')) return 'command'
  if (lower.includes('movement phase')) return 'movement'
  if (lower.includes('charge phase')) return 'charge'
  if (lower.includes('fight phase')) return 'fight'
  if (lower.includes('any phase') || lower.includes('any of your phases')) return 'any'
  return undefined
}

function factionDisplayName(factionSlug: string): string {
  return factionSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const KEYWORD_TERMS = [
  'stratagem',
  'enhancement',
  'detachment',
  'ability',
  'aura',
  'shoot',
  'fight',
  'charge',
  'movement',
  'command',
  'wound',
  'hit',
  'save',
  'damage',
  'mortal',
  'feel no pain',
  'invulnerable',
  'leader',
  'attached',
  'sustained hits',
  'lethal hits',
  'devastating wounds',
  'battle-shock',
  'deep strike',
  'overwatch',
]

function extractKeywords(title: string, content: string): string[] {
  const combined = `${title} ${content}`.toLowerCase()
  return KEYWORD_TERMS.filter((t) => combined.includes(t))
}

/**
 * Build the plain-text body for a stratagem node.
 * v1 emitted the `**WHEN:** …\n**TARGET:** …\n**EFFECT:** …` block; v2 has
 * these as structured fields. Rebuild the same body shape so downstream
 * consumers (retrieve.ts embedding, LLM context assembly) see the same text.
 */
function buildStratagemContent(s: {
  type?: string
  when?: string
  target?: string
  effect?: string
  restrictions?: string
  flavor?: string
  designerNote?: string
}): string {
  const parts: string[] = []
  if (s.flavor) parts.push(s.flavor)
  if (s.when) parts.push(`**WHEN:** ${s.when}`)
  if (s.target) parts.push(`**TARGET:** ${s.target}`)
  if (s.effect) parts.push(`**EFFECT:** ${s.effect}`)
  if (s.restrictions) parts.push(`**RESTRICTIONS:** ${s.restrictions}`)
  if (s.designerNote) parts.push(`Designer's Note: ${s.designerNote}`)
  return parts.join('\n\n').trim()
}

/**
 * Build datasheet body. v2 gives us structured stats + weapons + abilities.
 *
 * The body is intentionally **structural / summary only**. Ability bodies live
 * on `unit-ability` nodes; weapon detail lives on `weapon` nodes. Embedding
 * either here doubles the payload on every `/browse/unit/:id` fetch and
 * duplicates the same text in the graph. See the datasheet-content-duplication
 * fix (PR follow-up to #88).
 *
 * What stays:
 *   - Header stats line (so simple queries can hit it without loading
 *     weapon/ability children).
 *   - Section markers ("RANGED WEAPONS:", "MELEE WEAPONS:", "ABILITIES:")
 *     followed by NAMES only — enough for search matching and structural
 *     hints, without the body text.
 *   - Keywords, faction keywords, LEADER/SUPPORT lists, wargear options,
 *     unit composition, damaged profile, transport.
 *
 * What is stripped:
 *   - Full weapon rows (`- Big Choppa 24" A4 BS3+ ...`) → weapon child nodes.
 *   - Full ability bodies (`- Bomb Squigs: Twice per battle...`) → ability
 *     child nodes.
 *
 * The Vectorize index-time composer (`buildDatasheetCorpus`) re-attaches
 * ability + weapon bodies at index time so semantic search still finds the
 * datasheet for ability-related queries.
 */
function buildDatasheetContent(ds: PackExtract['datasheets'][number]): string {
  const parts: string[] = []
  if (ds.variant) parts.push(ds.variant)
  const stats = ds.stats
  const statLine = [stats.M, stats.T, stats.SV, stats.W, stats.LD, stats.OC]
    .filter(Boolean)
    .join(' ')
  if (statLine)
    parts.push(`M T SV W LD OC: ${statLine}${stats.invSv ? ` (Inv ${stats.invSv})` : ''}`)
  // Weapon names only — bodies live on weapon child nodes.
  if (ds.rangedWeapons.length > 0) {
    parts.push(`RANGED WEAPONS: ${ds.rangedWeapons.map((w) => w.name).join(', ')}`)
  }
  if (ds.meleeWeapons.length > 0) {
    parts.push(`MELEE WEAPONS: ${ds.meleeWeapons.map((w) => w.name).join(', ')}`)
  }
  // Ability names only — bodies live on unit-ability child nodes.
  if (ds.abilities.length > 0) {
    parts.push(`ABILITIES: ${ds.abilities.map((a) => a.name).join(', ')}`)
  }
  if (ds.keywords.length > 0) parts.push(`KEYWORDS: ${ds.keywords.join(', ')}`)
  if (ds.factionKeywords.length > 0)
    parts.push(`FACTION KEYWORDS: ${ds.factionKeywords.join(', ')}`)
  if (ds.leads.length > 0) parts.push(`LEADER: ${ds.leads.join(', ')}`)
  if (ds.supports.length > 0) parts.push(`SUPPORT: ${ds.supports.join(', ')}`)
  if (ds.wargearOptions.length > 0) {
    parts.push('WARGEAR OPTIONS:')
    for (const w of ds.wargearOptions) parts.push(`- ${w.description}`)
  }
  if (ds.unitComposition) parts.push(`UNIT COMPOSITION:\n${ds.unitComposition.raw}`)
  if (ds.damaged) parts.push(`DAMAGED: ${ds.damaged.threshold}\n${ds.damaged.effect}`)
  if (ds.transport) parts.push(`TRANSPORT: ${ds.transport}`)
  return parts.join('\n\n').trim() || ds.raw
}

/**
 * Convert a v2 `PackExtract` into brain nodes + refs (+ patches).
 *
 * For 10e packs: full-emission mode — every shape emits a node at its v1 id.
 *
 * For 11e packs: split-emission mode — overlapping shapes emit
 * `DatasheetPatch[]` entries so `build-graph.ts` can overlay them onto the
 * 11e Wahapedia twin at its canonical `11e:${wahapedia-id}` key; only
 * non-overlapping shapes (army-rules, errata, FAQs, Legends datasheets)
 * still emit as nodes, and those nodes are keyed at `11e:*`-prefixed IDs so
 * they don't collide with the 10e keyspace.
 */
export function convertPackExtractToNodes(
  extract: PackExtract,
  factionSlug: string,
  retrievedAt: string,
  edition?: '10th' | '11th',
  mfmLookup?: FactionPackMfmLookup,
): ConvertPackExtractResult {
  const nodes: Node[] = []
  const refs: NodeRef[] = []
  const patches: DatasheetPatch[] = []
  const seenIds = new Map<string, number>()
  const isEleventh = edition === '11th'
  const idPrefix = isEleventh ? '11e:' : ''

  function makeId(base: string): string {
    const count = seenIds.get(base) ?? 0
    seenIds.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }

  const source: Source = {
    type: 'pdf',
    title: `Faction Pack: ${factionDisplayName(factionSlug)}`,
    retrievedAt,
  }
  const canonicalFactionId = normalizeFactionId(factionSlug)

  /**
   * Build a fully-formed Node from a partial + a category + an ID base.
   * Used to seed `patch.fallbackNode` so brand-new 11e entities that don't
   * exist in Wahapedia still land in the graph. `idPrefix` is applied to
   * the id so 11e fallbacks live at `11e:*` and don't collide with 10e.
   */
  const buildFallbackNode = (
    idBase: string,
    layer: Node['layer'],
    category: Node['category'],
    fields: Partial<Node>,
    ownProps: Partial<Node>,
  ): Node => ({
    id: `${idPrefix}${idBase}`,
    layer,
    category,
    factionId: canonicalFactionId,
    sources: [source],
    refs: [],
    version: 1,
    edition,
    ...ownProps,
    ...fields,
    title: fields.title!,
    content: fields.content!,
    summary: fields.summary!,
    keywords: fields.keywords ?? [],
  })

  // ── Detachments ──────────────────────────────────────────────────────────
  // Overlapping shape — Wahapedia's 10e→11e twin owns the canonical id for
  // this entity on 11e. In 10e mode we emit full nodes; in 11e mode we emit
  // `DatasheetPatch` entries so build-graph.ts can overlay onto the twin.
  //
  // Each 11e patch also carries a `fallbackNode` at an `11e:*`-prefixed id.
  // When the twin lookup misses (because Wahapedia doesn't have this new
  // entity), the fallback is emitted so the content still lands.
  for (const det of extract.detachments) {
    const detSlug = slugify(det.name)
    const detBaseId = `det:${factionSlug}:${detSlug}`
    const detachmentChapter = detectChapterFromText(
      `${det.name} ${det.flavor ?? ''} ${det.detachmentRule?.body ?? ''}`,
    )
    const detBody = [det.flavor, det.detachmentRule?.body].filter(Boolean).join('\n\n').trim()

    const detFields: Partial<Node> = {
      title: det.name,
      content: detBody || det.name,
      summary: truncate(detBody.split(/[.!?]\s/)[0] ?? det.name, 150),
      subfaction: detachmentChapter,
      keywords: extractKeywords(det.name, detBody),
    }
    if (mfmLookup) {
      const key = `${canonicalFactionId}::${detSlug}`
      const mfm = mfmLookup.get(key)
      if (mfm) {
        if (typeof mfm.dp === 'number') detFields.dp = mfm.dp
        if (mfm.forceDisposition) detFields.forceDisposition = mfm.forceDisposition
      }
    }

    if (isEleventh) {
      const fallback = buildFallbackNode(detBaseId, 'faction', 'detachment-rule', detFields, {
        detachmentId: detSlug,
      })
      patches.push({
        factionId: canonicalFactionId,
        category: 'detachment-rule',
        targetSlug: detSlug,
        extraRefs: [],
        contentFields: detFields,
        fallbackNode: fallback,
        fallbackRefs: [],
      })
    } else {
      const detId = makeId(detBaseId)
      nodes.push({
        id: detId,
        layer: 'faction',
        category: 'detachment-rule',
        factionId: canonicalFactionId,
        detachmentId: detSlug,
        sources: [source],
        refs: [],
        version: 1,
        edition,
        ...detFields,
        // `title` is required on Node — pull from detFields defensively.
        title: detFields.title!,
        content: detFields.content!,
        summary: detFields.summary!,
        keywords: detFields.keywords ?? [],
      })
    }

    // Detachment rule as a child faction-ability. v1 emitted the same node
    // for `##### <RULE NAME>` under `##### DETACHMENT RULE`. When v2 saw a
    // "DETACHMENT RULES" body without a subordinate heading, it inlined the
    // rule on the detachment itself — in that case we still emit a child so
    // downstream cards can render the rule text separately.
    if (det.detachmentRule) {
      const ruleSlug = slugify(det.detachmentRule.name)
      const ruleFields: Partial<Node> = {
        title: det.detachmentRule.name,
        content: det.detachmentRule.body,
        summary: truncate(
          det.detachmentRule.body.split(/[.!?]\s/)[0] ?? det.detachmentRule.name,
          150,
        ),
        subfaction: detachmentChapter,
        keywords: extractKeywords(det.detachmentRule.name, det.detachmentRule.body),
      }
      if (isEleventh) {
        const ruleBaseId = `${detBaseId}:${ruleSlug}`
        const fallbackNode = buildFallbackNode(
          ruleBaseId,
          'faction',
          'faction-ability',
          ruleFields,
          { detachmentId: detSlug },
        )
        const fallbackRef: NodeRef = {
          sourceId: `${idPrefix}${ruleBaseId}`,
          targetId: `${idPrefix}${detBaseId}`,
          rel: 'part_of',
          context: `"${det.detachmentRule.name}" belongs to the ${det.name} detachment.`,
          bidirectional: true,
        }
        patches.push({
          factionId: canonicalFactionId,
          category: 'faction-ability',
          targetSlug: ruleSlug,
          parentSlug: detSlug,
          extraRefs: [],
          contentFields: ruleFields,
          fallbackNode,
          fallbackRefs: [fallbackRef],
        })
      } else {
        const ruleBaseId = `${detBaseId}:${ruleSlug}`
        const ruleId = makeId(ruleBaseId)
        nodes.push({
          id: ruleId,
          layer: 'faction',
          category: 'faction-ability',
          factionId: canonicalFactionId,
          detachmentId: detSlug,
          sources: [source],
          refs: [],
          version: 1,
          edition,
          ...ruleFields,
          title: ruleFields.title!,
          content: ruleFields.content!,
          summary: ruleFields.summary!,
          keywords: ruleFields.keywords ?? [],
        })
        refs.push({
          sourceId: ruleId,
          targetId: detBaseId,
          rel: 'part_of',
          context: `"${det.detachmentRule.name}" belongs to the ${det.name} detachment.`,
          bidirectional: true,
        })
      }
    }

    // Extra rules (rare) — same shape as detachmentRule child
    for (const extra of det.extraRules) {
      const extraSlug = slugify(extra.name)
      const extraFields: Partial<Node> = {
        title: extra.name,
        content: extra.body,
        summary: truncate(extra.body.split(/[.!?]\s/)[0] ?? extra.name, 150),
        subfaction: detachmentChapter,
        keywords: extractKeywords(extra.name, extra.body),
      }
      if (isEleventh) {
        const eBase = `${detBaseId}:${extraSlug}`
        const fallbackNode = buildFallbackNode(eBase, 'faction', 'faction-ability', extraFields, {
          detachmentId: detSlug,
        })
        const fallbackRef: NodeRef = {
          sourceId: `${idPrefix}${eBase}`,
          targetId: `${idPrefix}${detBaseId}`,
          rel: 'part_of',
          context: `"${extra.name}" belongs to the ${det.name} detachment.`,
          bidirectional: true,
        }
        patches.push({
          factionId: canonicalFactionId,
          category: 'faction-ability',
          targetSlug: extraSlug,
          parentSlug: detSlug,
          extraRefs: [],
          contentFields: extraFields,
          fallbackNode,
          fallbackRefs: [fallbackRef],
        })
      } else {
        const eBase = `${detBaseId}:${extraSlug}`
        const eId = makeId(eBase)
        nodes.push({
          id: eId,
          layer: 'faction',
          category: 'faction-ability',
          factionId: canonicalFactionId,
          detachmentId: detSlug,
          sources: [source],
          refs: [],
          version: 1,
          edition,
          ...extraFields,
          title: extraFields.title!,
          content: extraFields.content!,
          summary: extraFields.summary!,
          keywords: extraFields.keywords ?? [],
        })
        refs.push({
          sourceId: eId,
          targetId: detBaseId,
          rel: 'part_of',
          context: `"${extra.name}" belongs to the ${det.name} detachment.`,
          bidirectional: true,
        })
      }
    }

    // Enhancements
    for (const enh of det.enhancements) {
      const enhSlug = slugify(enh.name)
      const attachesTo = enh.attachesTo
        ? enh.attachesTo === 'character' || enh.attachesTo === 'leader'
          ? 'leader'
          : 'unit'
        : detectEnhancementAttachesTo(enh.body)
      const enhFields: Partial<Node> = {
        title: enh.name,
        content: enh.body,
        summary: truncate(enh.body.split(/[.!?]\s/)[0] ?? enh.name, 150),
        subfaction: detachmentChapter,
        keywords: extractKeywords(enh.name, enh.body),
        ...(typeof enh.points === 'number' ? { cost: enh.points } : {}),
        ...(attachesTo ? { attachesTo } : {}),
      }
      if (isEleventh) {
        const enhBase = `${detBaseId}:${enhSlug}`
        const fallbackNode = buildFallbackNode(enhBase, 'faction', 'enhancement', enhFields, {
          detachmentId: detSlug,
        })
        const fallbackRef: NodeRef = {
          sourceId: `${idPrefix}${enhBase}`,
          targetId: `${idPrefix}${detBaseId}`,
          rel: 'part_of',
          context: `"${enh.name}" belongs to the ${det.name} detachment.`,
          bidirectional: true,
        }
        patches.push({
          factionId: canonicalFactionId,
          category: 'enhancement',
          targetSlug: enhSlug,
          parentSlug: detSlug,
          extraRefs: [],
          contentFields: enhFields,
          fallbackNode,
          fallbackRefs: [fallbackRef],
        })
      } else {
        const enhBase = `${detBaseId}:${enhSlug}`
        const enhId = makeId(enhBase)
        nodes.push({
          id: enhId,
          layer: 'faction',
          category: 'enhancement',
          factionId: canonicalFactionId,
          detachmentId: detSlug,
          sources: [source],
          refs: [],
          version: 1,
          edition,
          ...enhFields,
          title: enhFields.title!,
          content: enhFields.content!,
          summary: enhFields.summary!,
          keywords: enhFields.keywords ?? [],
        })
        refs.push({
          sourceId: enhId,
          targetId: detBaseId,
          rel: 'part_of',
          context: `"${enh.name}" belongs to the ${det.name} detachment.`,
          bidirectional: true,
        })
      }
    }

    // Stratagems
    for (const strat of det.stratagems) {
      const title = strat.name || `${det.name} Stratagem`
      const stratSlug = slugify(title)
      const content = buildStratagemContent(strat)
      const phase = strat.when ? detectPhaseFromWhen(strat.when) : undefined
      const stratFields: Partial<Node> = {
        title,
        content,
        summary: truncate(content.split(/[.!?]\s/)[0] ?? title, 150),
        subfaction: detachmentChapter,
        keywords: extractKeywords(title, content),
        ...(phase ? { phase } : {}),
        ...(typeof strat.cpCost === 'number' ? { cpCost: strat.cpCost } : {}),
        ...(strat.when ? { when: strat.when } : {}),
        ...(strat.target ? { target: strat.target } : {}),
        ...(strat.effect ? { effect: strat.effect } : {}),
        ...(strat.type ? { stratType: strat.type } : {}),
      }
      if (isEleventh) {
        const stratBase = `${detBaseId}:${stratSlug}`
        const fallbackNode = buildFallbackNode(stratBase, 'faction', 'stratagem', stratFields, {
          detachmentId: detSlug,
        })
        const fallbackRef: NodeRef = {
          sourceId: `${idPrefix}${stratBase}`,
          targetId: `${idPrefix}${detBaseId}`,
          rel: 'part_of',
          context: `"${title}" belongs to the ${det.name} detachment.`,
          bidirectional: true,
        }
        patches.push({
          factionId: canonicalFactionId,
          category: 'stratagem',
          targetSlug: stratSlug,
          parentSlug: detSlug,
          extraRefs: [],
          contentFields: stratFields,
          fallbackNode,
          fallbackRefs: [fallbackRef],
        })
      } else {
        const stratBase = `${detBaseId}:${stratSlug}`
        const stratId = makeId(stratBase)
        nodes.push({
          id: stratId,
          layer: 'faction',
          category: 'stratagem',
          factionId: canonicalFactionId,
          detachmentId: detSlug,
          sources: [source],
          refs: [],
          version: 1,
          edition,
          ...stratFields,
          title: stratFields.title!,
          content: stratFields.content!,
          summary: stratFields.summary!,
          keywords: stratFields.keywords ?? [],
        })
        refs.push({
          sourceId: stratId,
          targetId: detBaseId,
          rel: 'part_of',
          context: `"${title}" belongs to the ${det.name} detachment.`,
          bidirectional: true,
        })
      }
    }
  }

  // ── Army rules (post-detachment, faction-level) ──────────────────────────
  // Non-overlapping shape — Wahapedia does not emit army-rule nodes with
  // this shape. In 11e mode we still emit fresh nodes, but at `11e:*`-
  // prefixed IDs so they don't collide with any 10e slug node.
  for (const rule of extract.armyRules) {
    const base = `${idPrefix}faction:${factionSlug}:${slugify(rule.name)}`
    const id = makeId(base)
    nodes.push({
      id,
      layer: 'faction',
      category: 'army-rule',
      title: rule.name,
      content: rule.body,
      summary: truncate(rule.body.split(/[.!?]\s/)[0] ?? rule.name, 150),
      factionId: canonicalFactionId,
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractKeywords(rule.name, rule.body),
      edition,
    })
  }

  // ── Datasheets ───────────────────────────────────────────────────────────
  // Overlapping shape (regular datasheets) — Wahapedia's 11e twin owns the
  // canonical id (`11e:${wahapedia-numeric}`). In 11e mode we emit a
  // `DatasheetPatch` per datasheet + a patch per inline ability + LEADER/
  // SUPPORT refs targeted at the 11e slug lookup id that build-graph.ts will
  // resolve.
  //
  // Legends datasheets are NOT in Wahapedia's 11e set (Wahapedia freezes
  // Legends at 10e). Even in 11e mode we emit them as fresh nodes at
  // `11e:datasheet:*` ids so they don't collide with the 10e slug keyspace.
  const emitDatasheet = (ds: PackExtract['datasheets'][number], isLegends: boolean) => {
    const dsSlug = slugify(ds.name)
    const content = buildDatasheetContent(ds)
    const subfaction = detectChapterFromText(`${ds.name} ${content}`)
    const dsFields: Partial<Node> = {
      title: ds.name,
      content,
      summary: truncate(content.split(/[.!?]\s/)[0] ?? ds.name, 150),
      subfaction,
      keywords: extractKeywords(ds.name, content),
      ...(ds.stats && (ds.stats.M || ds.stats.T)
        ? {
            stats: {
              M: ds.stats.M ?? '',
              T: Number(ds.stats.T ?? 0) || 0,
              SV: ds.stats.SV ?? '',
              W: Number(ds.stats.W ?? 0) || 0,
              LD: ds.stats.LD ?? '',
              OC: Number(ds.stats.OC ?? 0) || 0,
              ...(ds.stats.invSv ? { invSv: ds.stats.invSv } : {}),
            },
          }
        : {}),
      ...(ds.damaged
        ? {
            damaged: {
              threshold: ds.damaged.threshold,
              effect: ds.damaged.effect,
            },
          }
        : {}),
      ...(ds.wargearOptions.length > 0
        ? {
            wargearOptions: ds.wargearOptions.map((w) => ({
              name: w.description,
            })),
          }
        : {}),
    }

    if (isEleventh && !isLegends) {
      // Datasheet-level patch. The LEADER/SUPPORT refs are emitted at 11e-
      // prefixed slug ids — build-graph.ts resolves those to real `11e:*`
      // Wahapedia twin ids via the same slug index it uses for the patch
      // apply pass.
      const extraRefs: NodeRef[] = []
      for (const target of ds.leads) {
        extraRefs.push({
          sourceId: `11e:datasheet:${factionSlug}:${dsSlug}`,
          targetId: `11e:datasheet:${factionSlug}:${slugify(target)}`,
          rel: 'can_lead',
          context: `${ds.name} can lead ${target}.`,
          bidirectional: true,
        })
      }
      for (const target of ds.supports) {
        extraRefs.push({
          sourceId: `11e:datasheet:${factionSlug}:${dsSlug}`,
          targetId: `11e:datasheet:${factionSlug}:${slugify(target)}`,
          rel: 'can_support',
          context: `${ds.name} can support ${target}.`,
          bidirectional: true,
        })
      }
      const dsFallbackNode = buildFallbackNode(
        `datasheet:${factionSlug}:${dsSlug}`,
        'unit',
        'datasheet',
        dsFields,
        {},
      )
      // Also set datasheetId = fallbackNode.id so weapon/ability children of
      // a fallback datasheet resolve correctly through the child index.
      dsFallbackNode.datasheetId = dsFallbackNode.id
      patches.push({
        factionId: canonicalFactionId,
        category: 'datasheet',
        targetSlug: dsSlug,
        extraRefs,
        contentFields: dsFields,
        fallbackNode: dsFallbackNode,
        fallbackRefs: extraRefs,
      })

      // Inline ability patches — one per DatasheetAbility on the 11e sheet.
      // Wahapedia emits ability nodes at `ability:${surface}:${slug(name)}`;
      // the 11e twin is `11e:ability:${surface}:${slug(name)}`. Match key
      // uses the ability slug + the parent datasheet slug for
      // disambiguation ("Bomb Squigs on Tankbustas" vs "Bomb Squigs on
      // Breaka Boyz").
      for (const ab of ds.abilities) {
        // Skip abilities Wahapedia treats as core keywords (LEADER,
        // DEEP STRIKE, etc.) — they don't have their own node, so a patch
        // has nowhere to land.
        if (ab.kind === 'core' || ab.kind === 'leader' || ab.kind === 'support') continue
        const abSlug = slugify(ab.name)
        const abFields: Partial<Node> = {
          title: ab.name,
          content: ab.body,
          summary: truncate(ab.body.split(/[.!?]\s/)[0] ?? ab.name, 150),
          keywords: extractKeywords(ab.name, ab.body),
        }
        const abBaseId = `ability:${factionSlug}:${dsSlug}:${abSlug}`
        const abFallbackNode = buildFallbackNode(abBaseId, 'unit', 'unit-ability', abFields, {
          datasheetId: dsFallbackNode.id,
        })
        const abFallbackRef: NodeRef = {
          sourceId: abFallbackNode.id,
          targetId: dsFallbackNode.id,
          rel: 'part_of',
          context: `${ab.name} is an ability of ${ds.name}.`,
          bidirectional: true,
        }
        patches.push({
          factionId: canonicalFactionId,
          category: 'unit-ability',
          targetSlug: abSlug,
          parentSlug: dsSlug,
          extraRefs: [],
          contentFields: abFields,
          fallbackNode: abFallbackNode,
          fallbackRefs: [abFallbackRef],
        })
      }
      return
    }

    const dsBase = isLegends
      ? `${idPrefix}datasheet:${factionSlug}:${dsSlug}`
      : `datasheet:${factionSlug}:${dsSlug}`
    // 10e mode (or 11e Legends) — emit a full node at the slug id.
    const effectiveBase = isEleventh ? `${idPrefix}datasheet:${factionSlug}:${dsSlug}` : dsBase
    const dsId = makeId(effectiveBase)
    nodes.push({
      id: dsId,
      layer: 'unit',
      category: 'datasheet',
      factionId: canonicalFactionId,
      sources: [source],
      refs: [],
      version: 1,
      edition,
      ...dsFields,
      title: dsFields.title!,
      content: dsFields.content!,
      summary: dsFields.summary!,
      keywords: dsFields.keywords ?? [],
    })

    // LEADER/SUPPORT refs — v2 gives us clean lists of target unit names.
    for (const target of ds.leads) {
      refs.push({
        sourceId: dsId,
        targetId: isEleventh
          ? `${idPrefix}datasheet:${factionSlug}:${slugify(target)}`
          : `datasheet:${factionSlug}:${slugify(target)}`,
        rel: 'can_lead',
        context: `${ds.name} can lead ${target}.`,
        bidirectional: true,
      })
    }
    for (const target of ds.supports) {
      refs.push({
        sourceId: dsId,
        targetId: isEleventh
          ? `${idPrefix}datasheet:${factionSlug}:${slugify(target)}`
          : `datasheet:${factionSlug}:${slugify(target)}`,
        rel: 'can_support',
        context: `${ds.name} can support ${target}.`,
        bidirectional: true,
      })
    }
    // Legends flag is preserved on the node's `isLegends` field via massage
    // pass; leaving it off Node schema for now — v2 tracks it and downstream
    // can query the source's `isLegends` when we wire it in.
    void isLegends
  }

  for (const ds of extract.datasheets) emitDatasheet(ds, false)
  for (const ds of extract.legendsDatasheets) emitDatasheet(ds, true)

  // ── Errata ───────────────────────────────────────────────────────────────
  // Non-overlapping shape — Wahapedia has no `errata`/`commentary` category.
  // Emit as fresh nodes in both editions. In 11e mode, IDs get the `11e:`
  // prefix so they don't collide with any 10e slug node.
  for (const er of extract.errata) {
    const page = er.pages[0] ?? 0
    const targetName = er.target.name
    const idBase = `${idPrefix}errata:${factionSlug}:p${page}:${slugify(targetName)}`
    const id = makeId(idBase)
    const title = targetName
    const sourceWithPage: Source = page > 0 ? { ...source, page } : source
    nodes.push({
      id,
      layer: 'errata',
      category: 'commentary',
      title: `${factionSlug}: ${title}`,
      content: er.body,
      summary: truncate(er.body, 150),
      factionId: canonicalFactionId,
      sources: [sourceWithPage],
      refs: [],
      version: 1,
      keywords: extractKeywords(title, er.body),
      edition,
    })
    // Best-effort supersedes ref. v1 emitted the same approximate targetId
    // shape; keep matching so downstream errata-linker keeps finding hits.
    refs.push({
      sourceId: id,
      targetId: `${idPrefix}det:${factionSlug}:*:${slugify(targetName)}`,
      rel: 'supersedes',
      context: `Faction pack errata for ${title}. ${truncate(er.body, 100)}`,
    })
  }

  // ── FAQs ─────────────────────────────────────────────────────────────────
  // Non-overlapping shape — same treatment as errata.
  for (const faq of extract.faqs) {
    const idBase = `${idPrefix}faq:${factionSlug}:${slugify(faq.question.substring(0, 60))}`
    const id = makeId(idBase)
    const title = faq.question.length > 80 ? faq.question.substring(0, 77) + '...' : faq.question
    const content = `Q: ${faq.question}\n\nA: ${faq.answer}`
    nodes.push({
      id,
      layer: 'errata',
      category: 'faq',
      title,
      content,
      summary: truncate(content, 150),
      factionId: canonicalFactionId,
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractKeywords(faq.question, content),
      edition,
    })
  }

  return { nodes, refs, patches }
}

/**
 * Result of overlaying a batch of `DatasheetPatch` entries onto the 11e
 * Wahapedia twin nodes.
 */
export interface ApplyFactionPackPatchesResult {
  /** Number of patches that found a matching twin and were applied. */
  applied: number
  /**
   * Extra refs produced by patches (e.g. LEADER/SUPPORT edges on datasheet
   * patches). Caller pushes into `allRefs`.
   */
  extraRefs: NodeRef[]
  /**
   * Fallback nodes emitted for patches whose twin lookup missed (brand-new
   * 11e entities that don't exist in the 10e Wahapedia snapshot). Caller
   * pushes into `allNodes`.
   */
  fallbackNodes: Node[]
  /**
   * Fallback refs emitted alongside `fallbackNodes` for unmatched patches.
   */
  fallbackRefs: NodeRef[]
  /**
   * Match keys for patches with no matching twin, so the operator can see
   * which slug lookups the twin index is missing. Format:
   * `${category}::${factionId}::${parentSlug ?? '_'}::${targetSlug}`.
   */
  unmatched: string[]
}

/**
 * Overlay v2 faction-pack `DatasheetPatch` entries onto the matching 11e
 * Wahapedia twin nodes. The twin is the `11e:*`-prefixed node produced by
 * `duplicateEleventh` — this pass mutates it in place so the 11e content
 * from the faction pack becomes the canonical body at the twin's id.
 *
 * ── Slug index ─────────────────────────────────────────────────────────────
 * We build two lookup indices over the input twin array:
 *
 *   1. `titleIndex`: `${category}::${factionId}::${slugify(title)}` → Node
 *      Matches top-level patches (datasheet, detachment-rule) whose target
 *      slug is the twin's own title slugified. For datasheets this is
 *      `datasheet::orks::tankbustas` → the `11e:${wahapedia-numeric-id}`
 *      Tankbustas twin.
 *
 *   2. `childIndex`: `${category}::${factionId}::${parentSlug}::${targetSlug}` → Node
 *      Matches child patches (unit-ability, weapon, stratagem, enhancement,
 *      faction-ability). The parent's `datasheetId` / `detachmentId` on
 *      the twin gives us the parent identity we need to disambiguate
 *      "Bomb Squigs on Tankbustas" from "Bomb Squigs on Breaka Boyz".
 *
 * ── Field overlay ──────────────────────────────────────────────────────────
 * Applied fields are copied from `patch.contentFields` onto the twin. Every
 * touched twin gets `updatedInEleventh: true` so downstream consumers know
 * the field was mutated by an 11e overlay rather than inherited from the
 * 10e Wahapedia snapshot.
 *
 * `publishedAt` is stamped onto every source of a touched twin so the LLM
 * context knows the 11e faction-pack publication date, not the older
 * Wahapedia sync date.
 */
export function applyFactionPackPatches(
  twinNodes: Node[],
  patches: ReadonlyArray<DatasheetPatch>,
  publishedAt?: string,
): ApplyFactionPackPatchesResult {
  const titleIndex = new Map<string, Node>()
  const childIndex = new Map<string, Node>()
  const idIndex = new Map<string, Node>()

  for (const n of twinNodes) {
    idIndex.set(n.id, n)
    if (!n.factionId) continue

    const titleSlug = slugify(n.title)
    // Top-level index — one entry per (category, factionId, title-slug).
    // First occurrence wins; twin duplicates are the merge layer's job.
    const topKey = `${n.category}::${n.factionId}::${titleSlug}`
    if (!titleIndex.has(topKey)) titleIndex.set(topKey, n)

    // Child index — needs a parent slug. For weapon/ability children the
    // parent is the datasheet whose id equals `n.datasheetId` (a twin id
    // like `11e:${wahapedia-numeric}`); we resolve the parent's title slug
    // in a second pass below once every twin is registered.
  }

  // Second pass: build the child index. Requires the parent lookup — hence
  // the two-pass approach.
  for (const n of twinNodes) {
    if (!n.factionId) continue

    // Weapon / unit-ability children — parent is the datasheet at
    // `n.datasheetId`.
    if (
      (n.category === 'weapon' || n.category === 'unit-ability') &&
      n.datasheetId &&
      n.datasheetId !== n.id
    ) {
      const parent = idIndex.get(n.datasheetId)
      if (!parent) continue
      const parentSlug = slugify(parent.title)
      const targetSlug = slugify(n.title)
      const key = `${n.category}::${n.factionId}::${parentSlug}::${targetSlug}`
      if (!childIndex.has(key)) childIndex.set(key, n)
      continue
    }

    // Stratagem / enhancement / faction-ability children — parent is the
    // detachment-rule at the id derived from `n.detachmentId`. Wahapedia's
    // detachment nodes carry `detachmentId` = their own `id`; children
    // carry their parent's detachment id. Resolve the parent by looking up
    // the twin whose id matches `n.detachmentId` (or whose detachmentId
    // equals it and whose category is `detachment-rule`).
    if (
      (n.category === 'stratagem' ||
        n.category === 'enhancement' ||
        n.category === 'faction-ability') &&
      n.detachmentId
    ) {
      // `detachmentId` on Wahapedia twins is a slug like `gladius-task-force`,
      // NOT an id — prefer resolving through the detachment-rule node whose
      // detachmentId matches. Fall back to id lookup for 11e-duplicated
      // node ids like `11e:det:...` for safety.
      let parent: Node | undefined
      const byId = idIndex.get(n.detachmentId)
      if (byId && byId.category === 'detachment-rule') parent = byId
      if (!parent) {
        for (const cand of twinNodes) {
          if (cand.category !== 'detachment-rule') continue
          if (cand.factionId !== n.factionId) continue
          if (cand.detachmentId === n.detachmentId || cand.id === n.detachmentId) {
            parent = cand
            break
          }
        }
      }
      if (!parent) continue
      const parentSlug = slugify(parent.title)
      const targetSlug = slugify(n.title)
      const key = `${n.category}::${n.factionId}::${parentSlug}::${targetSlug}`
      if (!childIndex.has(key)) childIndex.set(key, n)
    }
  }

  let applied = 0
  const extraRefs: NodeRef[] = []
  const fallbackNodes: Node[] = []
  const fallbackRefs: NodeRef[] = []
  const unmatched: string[] = []

  for (const patch of patches) {
    // Top-level match: category has no parent (datasheet, detachment-rule).
    const isTopLevel =
      !patch.parentSlug && (patch.category === 'datasheet' || patch.category === 'detachment-rule')

    let twin: Node | undefined
    if (isTopLevel) {
      twin = titleIndex.get(`${patch.category}::${patch.factionId}::${patch.targetSlug}`)
    } else {
      const parentSlug = patch.parentSlug ?? '_'
      twin = childIndex.get(
        `${patch.category}::${patch.factionId}::${parentSlug}::${patch.targetSlug}`,
      )
    }

    if (!twin) {
      const parentSlug = patch.parentSlug ?? '_'
      unmatched.push(`${patch.category}::${patch.factionId}::${parentSlug}::${patch.targetSlug}`)
      // Brand-new 11e entity — emit the fallback node so the content still
      // lands. Fallback IDs are already `11e:*`-prefixed by the emitter.
      fallbackNodes.push(patch.fallbackNode)
      for (const r of patch.fallbackRefs) fallbackRefs.push(r)
      continue
    }

    // Apply the field overlay. Preserve the twin's `id`, `edition`,
    // `factionId`, `layer`, `category`, `datasheetId`, `detachmentId` —
    // those define the twin's identity in the graph.
    for (const [key, value] of Object.entries(patch.contentFields)) {
      if (value === undefined) continue
      // Skip identity fields.
      if (
        key === 'id' ||
        key === 'edition' ||
        key === 'factionId' ||
        key === 'layer' ||
        key === 'category' ||
        key === 'datasheetId' ||
        key === 'detachmentId'
      ) {
        continue
      }
      ;(twin as unknown as Record<string, unknown>)[key] = value
    }
    twin.updatedInEleventh = true

    if (publishedAt) {
      for (const src of twin.sources) {
        src.publishedAt = publishedAt
      }
    }

    // Re-emit any extra refs the patch carries. The refs target 11e-slug
    // ids (like `11e:datasheet:orks:breaka-boyz`); the caller adds them to
    // the ref set and downstream `mergeSources` normalizes them.
    for (const r of patch.extraRefs) extraRefs.push(r)

    applied++
  }

  return { applied, extraRefs, fallbackNodes, fallbackRefs, unmatched }
}
