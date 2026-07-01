/**
 * Translate a v2 `PackExtract` (from
 * `@tabletop-tools/game-content/adapters/faction-pack`) into brain
 * `Node[]` + `NodeRef[]`. Replaces the old v1 `parseFactionPack` node-emission
 * path.
 *
 * **ID scheme is preserved from v1** — Vectorize IDs are load-bearing:
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
 * v2 adds new richness — every datasheet has typed stats / weapon rows /
 * ability lists — but we deliberately DO NOT emit weapon/ability sub-nodes
 * here. Those are already produced by `game-data.ts` from Wahapedia /
 * BSData JSON at datasheet:${factionSlug}:${slug(name)}:${weapon-slug}. The
 * faction-pack converter's job is emitting one datasheet node per
 * `PackExtract.datasheets[]` entry with the LEADER/SUPPORT refs and letting
 * merge-sources.ts unify with the Wahapedia/BSData copy on the same id.
 */
import type { PackExtract } from '@tabletop-tools/game-content/src/adapters/faction-pack/parser'

import { normalizeFactionId } from '../faction-codes'
import { detectChapterFromText, truncate } from '../filters'
import type { GamePhase, Node, NodeRef, Source } from '../model'
import { slugify } from '../slugify'
import type { ParseResult } from './core-rules'
import { detectEnhancementAttachesTo } from './game-data'

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
 * Concatenate a Wahapedia-flavoured markdown block so retrieve.ts embedding
 * has textual content to index. `raw` is available on the datasheet, but it's
 * the messy PDF-flattened source; the reconstructed block is cleaner.
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
  if (ds.rangedWeapons.length > 0) {
    parts.push('RANGED WEAPONS:')
    for (const w of ds.rangedWeapons) parts.push(`- ${w.raw}`)
  }
  if (ds.meleeWeapons.length > 0) {
    parts.push('MELEE WEAPONS:')
    for (const w of ds.meleeWeapons) parts.push(`- ${w.raw}`)
  }
  if (ds.abilities.length > 0) {
    parts.push('ABILITIES:')
    for (const a of ds.abilities) parts.push(`- ${a.name}: ${a.body}`)
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
 * Convert a v2 `PackExtract` into brain nodes + refs, matching v1's ID and
 * category scheme. Emits the same node shapes v1 did — the difference is
 * v2's richer structured extraction feeds structured Node fields (cpCost,
 * when/target/effect, damaged, keywords, etc.) more reliably.
 */
export function convertPackExtractToNodes(
  extract: PackExtract,
  factionSlug: string,
  retrievedAt: string,
  edition?: '10th' | '11th',
  mfmLookup?: FactionPackMfmLookup,
): ParseResult {
  const nodes: Node[] = []
  const refs: NodeRef[] = []
  const seenIds = new Map<string, number>()

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

  // ── Detachments ──────────────────────────────────────────────────────────
  for (const det of extract.detachments) {
    const detBaseId = `det:${factionSlug}:${slugify(det.name)}`
    const detId = makeId(detBaseId)
    const detachmentChapter = detectChapterFromText(
      `${det.name} ${det.flavor ?? ''} ${det.detachmentRule?.body ?? ''}`,
    )
    const detBody = [det.flavor, det.detachmentRule?.body].filter(Boolean).join('\n\n').trim()
    const detNode: Node = {
      id: detId,
      layer: 'faction',
      category: 'detachment-rule',
      title: det.name,
      content: detBody || det.name,
      summary: truncate(detBody.split(/[.!?]\s/)[0] ?? det.name, 150),
      factionId: canonicalFactionId,
      subfaction: detachmentChapter,
      detachmentId: slugify(det.name),
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractKeywords(det.name, detBody),
      edition,
    }
    if (mfmLookup) {
      const key = `${canonicalFactionId}::${slugify(det.name)}`
      const mfm = mfmLookup.get(key)
      if (mfm) {
        if (typeof mfm.dp === 'number') detNode.dp = mfm.dp
        if (mfm.forceDisposition) detNode.forceDisposition = mfm.forceDisposition
      }
    }
    nodes.push(detNode)

    // Detachment rule as a child faction-ability. v1 emitted the same node
    // for `##### <RULE NAME>` under `##### DETACHMENT RULE`. When v2 saw a
    // "DETACHMENT RULES" body without a subordinate heading, it inlined the
    // rule on the detachment itself — in that case we still emit a child so
    // downstream cards can render the rule text separately.
    if (det.detachmentRule) {
      const ruleBaseId = `${detId}:${slugify(det.detachmentRule.name)}`
      const ruleId = makeId(ruleBaseId)
      nodes.push({
        id: ruleId,
        layer: 'faction',
        category: 'faction-ability',
        title: det.detachmentRule.name,
        content: det.detachmentRule.body,
        summary: truncate(
          det.detachmentRule.body.split(/[.!?]\s/)[0] ?? det.detachmentRule.name,
          150,
        ),
        factionId: canonicalFactionId,
        subfaction: detachmentChapter,
        detachmentId: slugify(det.name),
        sources: [source],
        refs: [],
        version: 1,
        keywords: extractKeywords(det.detachmentRule.name, det.detachmentRule.body),
        edition,
      })
      refs.push({
        sourceId: ruleId,
        targetId: detId,
        rel: 'part_of',
        context: `"${det.detachmentRule.name}" belongs to the ${det.name} detachment.`,
        bidirectional: true,
      })
    }

    // Extra rules (rare) — same shape as detachmentRule child
    for (const extra of det.extraRules) {
      const eBase = `${detId}:${slugify(extra.name)}`
      const eId = makeId(eBase)
      nodes.push({
        id: eId,
        layer: 'faction',
        category: 'faction-ability',
        title: extra.name,
        content: extra.body,
        summary: truncate(extra.body.split(/[.!?]\s/)[0] ?? extra.name, 150),
        factionId: canonicalFactionId,
        subfaction: detachmentChapter,
        detachmentId: slugify(det.name),
        sources: [source],
        refs: [],
        version: 1,
        keywords: extractKeywords(extra.name, extra.body),
        edition,
      })
      refs.push({
        sourceId: eId,
        targetId: detId,
        rel: 'part_of',
        context: `"${extra.name}" belongs to the ${det.name} detachment.`,
        bidirectional: true,
      })
    }

    // Enhancements
    for (const enh of det.enhancements) {
      const enhBase = `${detId}:${slugify(enh.name)}`
      const enhId = makeId(enhBase)
      const attachesTo = enh.attachesTo
        ? enh.attachesTo === 'character' || enh.attachesTo === 'leader'
          ? 'leader'
          : 'unit'
        : detectEnhancementAttachesTo(enh.body)
      nodes.push({
        id: enhId,
        layer: 'faction',
        category: 'enhancement',
        title: enh.name,
        content: enh.body,
        summary: truncate(enh.body.split(/[.!?]\s/)[0] ?? enh.name, 150),
        factionId: canonicalFactionId,
        subfaction: detachmentChapter,
        detachmentId: slugify(det.name),
        ...(typeof enh.points === 'number' ? { cost: enh.points } : {}),
        ...(attachesTo ? { attachesTo } : {}),
        sources: [source],
        refs: [],
        version: 1,
        keywords: extractKeywords(enh.name, enh.body),
        edition,
      })
      refs.push({
        sourceId: enhId,
        targetId: detId,
        rel: 'part_of',
        context: `"${enh.name}" belongs to the ${det.name} detachment.`,
        bidirectional: true,
      })
    }

    // Stratagems
    for (const strat of det.stratagems) {
      const title = strat.name || `${det.name} Stratagem`
      const stratBase = `${detId}:${slugify(title)}`
      const stratId = makeId(stratBase)
      const content = buildStratagemContent(strat)
      const phase = strat.when ? detectPhaseFromWhen(strat.when) : undefined
      nodes.push({
        id: stratId,
        layer: 'faction',
        category: 'stratagem',
        title,
        content,
        summary: truncate(content.split(/[.!?]\s/)[0] ?? title, 150),
        phase,
        factionId: canonicalFactionId,
        subfaction: detachmentChapter,
        detachmentId: slugify(det.name),
        ...(typeof strat.cpCost === 'number' ? { cpCost: strat.cpCost } : {}),
        ...(strat.when ? { when: strat.when } : {}),
        ...(strat.target ? { target: strat.target } : {}),
        ...(strat.effect ? { effect: strat.effect } : {}),
        ...(strat.type ? { stratType: strat.type } : {}),
        sources: [source],
        refs: [],
        version: 1,
        keywords: extractKeywords(title, content),
        edition,
      })
      refs.push({
        sourceId: stratId,
        targetId: detId,
        rel: 'part_of',
        context: `"${title}" belongs to the ${det.name} detachment.`,
        bidirectional: true,
      })
    }
  }

  // ── Army rules (post-detachment, faction-level) ──────────────────────────
  for (const rule of extract.armyRules) {
    const base = `faction:${factionSlug}:${slugify(rule.name)}`
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
  // Emit both regular + Legends datasheets. Merge-sources will unify with
  // Wahapedia/BSData copies at the same `datasheet:${factionSlug}:${slug(name)}`
  // id.
  const emitDatasheet = (ds: PackExtract['datasheets'][number], isLegends: boolean) => {
    const dsId = makeId(`datasheet:${factionSlug}:${slugify(ds.name)}`)
    const content = buildDatasheetContent(ds)
    const subfaction = detectChapterFromText(`${ds.name} ${content}`)
    nodes.push({
      id: dsId,
      layer: 'unit',
      category: 'datasheet',
      title: ds.name,
      content,
      summary: truncate(content.split(/[.!?]\s/)[0] ?? ds.name, 150),
      factionId: canonicalFactionId,
      subfaction,
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractKeywords(ds.name, content),
      edition,
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
    })

    // LEADER/SUPPORT refs — v2 gives us clean lists of target unit names.
    for (const target of ds.leads) {
      refs.push({
        sourceId: dsId,
        targetId: `datasheet:${factionSlug}:${slugify(target)}`,
        rel: 'can_lead',
        context: `${ds.name} can lead ${target}.`,
        bidirectional: true,
      })
    }
    for (const target of ds.supports) {
      refs.push({
        sourceId: dsId,
        targetId: `datasheet:${factionSlug}:${slugify(target)}`,
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
  // v2 splits into structured entries. Emit `commentary` nodes matching v1's
  // shape. IDs mirror v1: `errata:${factionSlug}:p${page}:${slug(target)}`.
  for (const er of extract.errata) {
    const page = er.pages[0] ?? 0
    const targetName = er.target.name
    const idBase = `errata:${factionSlug}:p${page}:${slugify(targetName)}`
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
      targetId: `det:${factionSlug}:*:${slugify(targetName)}`,
      rel: 'supersedes',
      context: `Faction pack errata for ${title}. ${truncate(er.body, 100)}`,
    })
  }

  // ── FAQs ─────────────────────────────────────────────────────────────────
  for (const faq of extract.faqs) {
    const idBase = `faq:${factionSlug}:${slugify(faq.question.substring(0, 60))}`
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

  return { nodes, refs }
}
