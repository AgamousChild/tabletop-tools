/**
 * Convert Wahapedia/BSData game data into brain Nodes and NodeRefs.
 *
 * Takes the existing game-data-store types (already in IndexedDB) and produces
 * brain-compatible nodes for the unit and faction layers.
 *
 * Data sources:
 * - Datasheets → unit/datasheet nodes
 * - DatasheetWargear → unit/weapon nodes (with part_of refs to datasheet)
 * - UnitAbilities → unit/unit-ability nodes (with part_of refs to datasheet)
 * - Detachments → faction/detachment-rule nodes
 * - DetachmentAbilities → faction/faction-ability nodes (with part_of refs to detachment)
 * - Stratagems → faction/stratagem nodes (with part_of refs to detachment)
 * - Enhancements → faction/enhancement nodes (with part_of refs to detachment)
 * - Abilities (core) → faction/faction-ability nodes (army rules like Oath of Moment)
 * - DatasheetStratagems/Enhancements/DetachmentAbilities → modifies refs
 */
import type { Node, NodeRef, Source } from '../model'
import { slugify } from '../slugify'
import {
  isBoardingAction, isLegends, buildDetachmentChapterMap,
  detectScope, detectWeaponTypes, classifyGrants,
  truncate, stripHtml,
} from '../filters'

// ── Input types (matching game-data-store) ──────────────────────────────────

export interface GameDataInput {
  datasheets: DatasheetRecord[]
  datasheetWargear: DatasheetWargearRecord[]
  datasheetModels: DatasheetModelRecord[]
  unitAbilities: UnitAbilityRecord[]
  abilities: AbilityRecord[]
  detachments: DetachmentRecord[]
  detachmentAbilities: DetachmentAbilityRecord[]
  stratagems: StratagemRecord[]
  enhancements: EnhancementRecord[]
  unitKeywords: UnitKeywordRecord[]
  unitCompositions: UnitCompositionRecord[]
  unitCosts: UnitCostRecord[]
  wargearOptions: WargearOptionRecord[]
  leaderAttachments: LeaderAttachmentRecord[]
  // Junction tables → become refs
  datasheetStratagems: JunctionRecord[]
  datasheetEnhancements: JunctionRecord[]
  datasheetDetachmentAbilities: JunctionRecord[]
}

export interface DatasheetRecord {
  id: string
  name: string
  factionId: string
  role: string
  legend: string
  transport: string
  loadout: string
  damagedW: string
  damagedDescription: string
  isLegends?: boolean
}

export interface DatasheetWargearRecord {
  id: number
  datasheetId: string
  name: string
  description: string
  range: string
  type: string
  attacks: string
  skill: string
  strength: string
  ap: string
  damage: string
}

export interface DatasheetModelRecord {
  id: number
  datasheetId: string
  name: string
  move: string
  toughness: string
  save: string
  wounds: string
  leadership: string
  oc: string
  invSv: string
  invSvDescription: string
}

export interface UnitAbilityRecord {
  id: string
  datasheetId: string
  name: string
  description: string
  type: string
  parameter?: string
}

export interface AbilityRecord {
  id: string
  name: string
  legend: string
  factionId: string
  description: string
}

export interface DetachmentRecord {
  id: string
  factionId: string
  name: string
  legend: string
  type: string
}

export interface DetachmentAbilityRecord {
  id: string
  detachmentId: string
  factionId: string
  name: string
  legend: string
  description: string
}

export interface StratagemRecord {
  id: string
  factionId: string
  detachmentId: string
  name: string
  type: string
  cpCost: string
  turn: string
  phase: string
  legend: string
  description: string
}

export interface EnhancementRecord {
  id: string
  factionId: string
  detachmentId: string
  name: string
  legend: string
  description: string
  cost: string
}

export interface UnitKeywordRecord {
  id: string
  datasheetId: string
  keyword: string
  isFactionKeyword: boolean
}

export interface UnitCompositionRecord {
  id: string
  datasheetId: string
  line: string
  description: string
}

export interface UnitCostRecord {
  id: string
  datasheetId: string
  line: string
  description: string
  cost: string
}

export interface WargearOptionRecord {
  id: string
  datasheetId: string
  line: string
  description: string
}

export interface LeaderAttachmentRecord {
  id: string
  leaderId: string
  attachedId: string
}

export interface JunctionRecord {
  datasheetId: string
  stratagemId?: string
  enhancementId?: string
  detachmentAbilityId?: string
}

// ── Faction ID Normalization ─────────────────────────────────────────────────

/** Map Wahapedia short codes to kebab-case slugs matching faction pack filenames. */
const FACTION_CODE_TO_SLUG: Record<string, string> = {
  AS: 'adepta-sororitas',
  AC: 'adeptus-custodes',
  AdM: 'adeptus-mechanicus',
  TL: 'adeptus-titanicus',
  AE: 'aeldari',
  AM: 'astra-militarum',
  CD: 'chaos-daemons',
  QT: 'chaos-knights',
  CSM: 'chaos-space-marines',
  DG: 'death-guard',
  DRU: 'drukhari',
  EC: 'emperors-children',
  GC: 'genestealer-cults',
  GK: 'grey-knights',
  AoI: 'imperial-agents',
  QI: 'imperial-knights',
  LoV: 'leagues-of-votann',
  NEC: 'necrons',
  ORK: 'orks',
  SM: 'space-marines',
  TS: 'thousand-sons',
  TYR: 'tyranids',
  TAU: 't-au-empire',
  UN: 'unaligned',
  UA: 'unbound-adversaries',
  WE: 'world-eaters',
}

/** Normalize a faction ID from Wahapedia short code to slug. */
function normalizeFactionId(code: string): string {
  return FACTION_CODE_TO_SLUG[code] ?? slugify(code)
}

import { getToughnessTier, getStrengthTier, getSaveTier, usefulApCap } from '../combat-tiers'

// ── HTML Stripping ──────────────────────────────────────────────────────────

/** Extract targeting keywords from rules text (CAPS words that are unit type keywords). */
function extractTargetingKeywords(text: string): string[] {
  const TARGETING_KEYWORDS = [
    'infantry', 'vehicle', 'monster', 'character', 'mounted', 'beast',
    'fly', 'walker', 'dreadnought', 'terminator', 'battleline', 'psyker',
    'titanic', 'transport', 'aircraft', 'jump pack', 'grenades', 'smoke',
    'epic hero', 'daemon', 'swarm', 'cavalry',
  ]
  const lower = text.toLowerCase()
  return TARGETING_KEYWORDS.filter(k => lower.includes(k))
}

/** Strip HTML tags and convert basic HTML to markdown. */

// ── Converter ───────────────────────────────────────────────────────────────

export interface GameDataParseResult {
  nodes: Node[]
  refs: NodeRef[]
}

const wahapediaSource: Source = {
  type: 'wahapedia',
  title: 'Wahapedia 10th Edition',
  retrievedAt: new Date().toISOString(),
}

function mapPhase(phase: string): Node['phase'] {
  const p = phase.toLowerCase()
  if (p.includes('command')) return 'command'
  if (p.includes('movement')) return 'movement'
  if (p.includes('shooting')) return 'shooting'
  if (p.includes('charge')) return 'charge'
  if (p.includes('fight')) return 'fight'
  if (p.includes('any') || p.includes('either')) return 'any'
  return undefined
}

export function convertGameData(input: GameDataInput, retrievedAt?: string): GameDataParseResult {
  const nodes: Node[] = []
  const refs: NodeRef[] = []
  const source: Source = { ...wahapediaSource, retrievedAt: retrievedAt ?? new Date().toISOString() }

  // Filter out Boarding Actions — different game mode
  const boardingDetIds = new Set(
    input.detachments.filter(isBoardingAction).map(d => d.id)
  )
  const filteredDetachments = input.detachments.filter(d => !boardingDetIds.has(d.id))
  const filteredStratagems = input.stratagems.filter(s => !boardingDetIds.has(s.detachmentId))
  const filteredEnhancements = input.enhancements.filter(e => !boardingDetIds.has(e.detachmentId))
  const filteredDetAbilities = input.detachmentAbilities.filter(da => !boardingDetIds.has(da.detachmentId))

  // Filter out Legends — discontinued units not legal in matched play
  const legendsIds = new Set(
    input.datasheets.filter(isLegends).map(d => d.id)
  )
  const filteredDatasheets = input.datasheets.filter(d => !isLegends(d))
  const filteredWargear = input.datasheetWargear.filter(w => !legendsIds.has(w.datasheetId))
  const filteredModels = input.datasheetModels.filter(m => !legendsIds.has(m.datasheetId))
  const filteredUnitAbilities = input.unitAbilities.filter(a => !legendsIds.has(a.datasheetId))
  const filteredUnitKeywords = input.unitKeywords.filter(k => !legendsIds.has(k.datasheetId))
  const filteredCompositions = input.unitCompositions.filter(c => !legendsIds.has(c.datasheetId))
  const filteredCosts = input.unitCosts.filter(c => !legendsIds.has(c.datasheetId))
  const filteredWargearOptions = input.wargearOptions.filter(w => !legendsIds.has(w.datasheetId))
  const filteredLeaderAttachments = input.leaderAttachments.filter(l => !legendsIds.has(l.leaderId) && !legendsIds.has(l.attachedId))
  const filteredDsStratagems = input.datasheetStratagems.filter(j => !legendsIds.has(j.datasheetId))
  const filteredDsEnhancements = input.datasheetEnhancements.filter(j => !legendsIds.has(j.datasheetId))
  const filteredDsDetAbilities = input.datasheetDetachmentAbilities.filter(j => !legendsIds.has(j.datasheetId))

  // Build lookup maps (using filtered data — no legends, no boarding)
  const modelsByDatasheet = groupBy(filteredModels, r => r.datasheetId)
  const keywordsByDatasheet = groupBy(filteredUnitKeywords, r => r.datasheetId)
  const compositionsByDatasheet = groupBy(filteredCompositions, r => r.datasheetId)
  const costsByDatasheet = groupBy(filteredCosts, r => r.datasheetId)
  const wargearByDatasheet = groupBy(filteredWargear, r => r.datasheetId)
  const abilitiesByDatasheet = groupBy(filteredUnitAbilities, r => r.datasheetId)
  const stratagemsByDetachment = groupBy(filteredStratagems, r => r.detachmentId)
  const enhancementsByDetachment = groupBy(filteredEnhancements, r => r.detachmentId)
  const abilitiesByDetachment = groupBy(filteredDetAbilities, r => r.detachmentId)

  // Build datasheet → factionId and subfaction lookups
  const dsFactionMap = new Map<string, string>()
  for (const ds of filteredDatasheets) {
    dsFactionMap.set(ds.id, normalizeFactionId(ds.factionId))
  }

  const SUBFACTION_KEYWORDS = [
    'Blood Angels', 'Dark Angels', 'Space Wolves', 'Black Templars', 'Ultramarines',
    'Deathwatch', 'Imperial Fists', 'Iron Hands', 'Salamanders', 'Raven Guard',
    'White Scars', 'Crimson Fists', 'Blood Ravens',
    'Ynnari', 'Harlequins', 'Asuryani',
    'Plague Legions', 'Scintillating Legions', 'Legions of Excess', 'Blood Legions',
    'Damned',
  ]
  const dsSubfactionMap = new Map<string, string>()
  const keywordsByDs = groupBy(filteredUnitKeywords.filter(k => k.isFactionKeyword), k => k.datasheetId)
  for (const [dsId, kws] of keywordsByDs) {
    for (const kw of kws) {
      const match = SUBFACTION_KEYWORDS.find(sf => sf === kw.keyword)
      if (match) {
        dsSubfactionMap.set(dsId, match.toLowerCase())
        break
      }
    }
  }

  // ── 0. Faction parent nodes ────────────────────────────────────────────────
  // Create a top-level node for each faction so detachments, army rules, and
  // datasheets can link up to it via part_of.
  const factionSlugs = new Set<string>()
  for (const ds of filteredDatasheets) factionSlugs.add(normalizeFactionId(ds.factionId))
  for (const det of filteredDetachments) factionSlugs.add(normalizeFactionId(det.factionId))

  for (const fSlug of factionSlugs) {
    const factionNodeId = `faction:${fSlug}`
    nodes.push({
      id: factionNodeId,
      layer: 'faction',
      category: 'faction-ability', // closest category
      title: fSlug.split('-').map(w => w[0]!.toUpperCase() + w.slice(1)).join(' '),
      content: `Top-level faction entry for ${fSlug}.`,
      summary: `${fSlug} faction.`,
      factionId: fSlug,
      sources: [source],
      refs: [],
      version: 1,
      keywords: [fSlug],
    })
  }

  // ── 1. Datasheets → unit/datasheet nodes ──────────────────────────────────

  for (const ds of filteredDatasheets) {
    const models = modelsByDatasheet.get(ds.id) ?? []
    const keywords = keywordsByDatasheet.get(ds.id) ?? []
    const compositions = compositionsByDatasheet.get(ds.id) ?? []
    const costs = costsByDatasheet.get(ds.id) ?? []

    const statBlock = models.length > 0
      ? models.map(m => `${m.name}: M${m.move} T${m.toughness} Sv${m.save} W${m.wounds} Ld${m.leadership} OC${m.oc}${m.invSv ? ` ${m.invSv}++` : ''}`).join('\n')
      : ''

    const keywordList = keywords.map(k => k.keyword).join(', ')
    const factionKeywords = keywords.filter(k => k.isFactionKeyword).map(k => k.keyword).join(', ')
    const compositionText = compositions.map(c => stripHtml(c.description)).join('\n')
    const costText = costs.map(c => `${stripHtml(c.description)}: ${c.cost}pts`).join(', ')

    const content = [
      statBlock,
      ds.role ? `**Role:** ${ds.role}` : '',
      keywordList ? `**Keywords:** ${keywordList}` : '',
      factionKeywords ? `**Faction Keywords:** ${factionKeywords}` : '',
      compositionText ? `**Composition:** ${compositionText}` : '',
      costText ? `**Points:** ${costText}` : '',
      ds.transport ? `**Transport:** ${stripHtml(ds.transport)}` : '',
      ds.loadout ? `**Loadout:** ${stripHtml(ds.loadout)}` : '',
      ds.damagedW ? `**Damaged (${ds.damagedW}W):** ${stripHtml(ds.damagedDescription)}` : '',
    ].filter(Boolean).join('\n\n')

    const node: Node = {
      id: ds.id,  // BSData GUID
      layer: 'unit',
      category: 'datasheet',
      title: ds.name,
      content,
      summary: `${ds.name} — ${ds.role}${costs.length ? `, ${costText}` : ''}.`,
      factionId: normalizeFactionId(ds.factionId),
      subfaction: dsSubfactionMap.get(ds.id),
      datasheetId: ds.id,
      sources: [source],
      refs: [],
      version: 1,
      keywords: [...keywords.map(k => k.keyword.toLowerCase()), ds.role.toLowerCase()].filter(Boolean),
    }

    // Add combat profile to keywords for combat-relevant queries
    const primaryModel = models[0]
    if (primaryModel) {
      const t = parseInt(primaryModel.toughness)
      if (!isNaN(t)) {
        const tier = getToughnessTier(t)
        if (tier) {
          node.keywords.push(`t${t}`, tier.name, `toughness-${t}`)
        }
      }

      const sv = parseInt(primaryModel.save)
      if (!isNaN(sv)) {
        const saveTier = getSaveTier(sv)
        if (saveTier) {
          node.keywords.push(`sv${sv}+`, saveTier.name, `save-${sv}`)
        }
      }

      // Invulnerable save — critical for AP effectiveness
      const invSv = parseInt(primaryModel.invSv)
      if (!isNaN(invSv) && invSv > 0) {
        node.keywords.push(`invuln-${invSv}++`, `invulnerable`)
        // Calculate AP cap — AP beyond this is wasted
        if (!isNaN(sv)) {
          const apCap = usefulApCap(sv, invSv)
          if (apCap > 0) {
            node.keywords.push(`ap-cap-${apCap}`)
          }
        }
      }

      // Wounds — relevant for bracket/degradation and kill efficiency
      const w = parseInt(primaryModel.wounds)
      if (!isNaN(w)) {
        node.keywords.push(`w${w}`, `wounds-${w}`)
      }
    }

    // Points cost — from unit_costs data
    const unitCosts = costsByDatasheet.get(ds.id) ?? []
    if (unitCosts.length > 0) {
      // Parse the lowest cost option (minimum squad size)
      const costValues = unitCosts.map(c => parseInt(c.cost)).filter(c => !isNaN(c))
      if (costValues.length > 0) {
        const minCost = Math.min(...costValues)
        const maxCost = Math.max(...costValues)
        node.keywords.push(`pts-${minCost}`)

        // Points tier for budget queries
        if (minCost <= 50) node.keywords.push('cheap')
        else if (minCost <= 100) node.keywords.push('moderate-cost')
        else if (minCost <= 200) node.keywords.push('expensive')
        else node.keywords.push('premium')

        // Points per wound efficiency (using primary model)
        const w = parseInt(primaryModel?.wounds ?? '0')
        const modelCount = compositions.length > 0 ? parseInt(compositions[0]!.description) || 1 : 1
        if (w > 0 && modelCount > 0) {
          const totalWounds = w * modelCount
          const ptsPerWound = Math.round(minCost / totalWounds)
          node.keywords.push(`ppw-${ptsPerWound}`)
        }
      }
    }

    // Elevate key weapon capabilities to datasheet level
    const unitWeapons = wargearByDatasheet.get(ds.id) ?? []
    const allWeaponDescs = unitWeapons.map(w => (w.description ?? '').toLowerCase()).join(' ')
    if (allWeaponDescs.includes('indirect fire')) node.keywords.push('indirect fire')
    if (allWeaponDescs.includes('torrent')) node.keywords.push('torrent')
    if (allWeaponDescs.includes('blast')) node.keywords.push('blast')
    if (allWeaponDescs.includes('melta')) node.keywords.push('melta')
    if (allWeaponDescs.includes('sustained hits')) node.keywords.push('sustained hits')
    if (allWeaponDescs.includes('lethal hits')) node.keywords.push('lethal hits')
    if (allWeaponDescs.includes('devastating wounds')) node.keywords.push('devastating wounds')
    if (allWeaponDescs.includes('anti-')) node.keywords.push('anti')
    if (allWeaponDescs.includes('hazardous')) node.keywords.push('hazardous')
    if (allWeaponDescs.includes('twin-linked')) node.keywords.push('twin-linked')
    if (allWeaponDescs.includes('ignores cover')) node.keywords.push('ignores cover')
    if (allWeaponDescs.includes('one shot')) node.keywords.push('one shot')

    // Unit-level ability capabilities
    const unitAbs = abilitiesByDatasheet.get(ds.id) ?? []
    const allAbilityText = unitAbs.map(a => `${a.name} ${a.description}`.toLowerCase()).join(' ')
    if (allAbilityText.includes('deep strike')) node.keywords.push('deep strike')
    if (allAbilityText.includes('lone operative')) node.keywords.push('lone operative')
    if (allAbilityText.includes('stealth')) node.keywords.push('stealth')
    if (allAbilityText.includes('scouts')) node.keywords.push('scouts')
    if (allAbilityText.includes('infiltrator')) node.keywords.push('infiltrators')
    if (allAbilityText.includes('deadly demise')) node.keywords.push('deadly demise')
    if (allAbilityText.includes('feel no pain')) node.keywords.push('feel no pain')
    if (allAbilityText.includes('fights first')) node.keywords.push('fights first')
    if (allAbilityText.includes('firing deck')) node.keywords.push('firing deck')

    if (ds.isLegends) {
      node.keywords.push('legends')
    }
    nodes.push(node)

    // Datasheet → faction parent ref
    refs.push({
      sourceId: ds.id,
      targetId: `faction:${normalizeFactionId(ds.factionId)}`,
      rel: 'part_of',
      context: `${ds.name} belongs to ${normalizeFactionId(ds.factionId)}.`,
    })
  }

  // ── 2. Weapons → unit/weapon nodes ────────────────────────────────────────
  const seenWeaponIds = new Set<string>()
  for (const wg of filteredWargear) {
    // Differentiate melee/ranged profiles with the same name on the same datasheet
    let weaponNodeId = `weapon:${wg.datasheetId}:${slugify(wg.name)}`
    if (seenWeaponIds.has(weaponNodeId)) {
      weaponNodeId = `weapon:${wg.datasheetId}:${slugify(wg.name)}-${slugify(wg.type)}`
    }
    if (seenWeaponIds.has(weaponNodeId)) {
      weaponNodeId = `weapon:${wg.datasheetId}:${slugify(wg.name)}-${wg.id}`
    }
    seenWeaponIds.add(weaponNodeId)

    const cleanDesc = stripHtml(wg.description ?? '')

    const content = [
      `**Range:** ${wg.range} | **Type:** ${wg.type}`,
      `**A:** ${wg.attacks} | **BS/WS:** ${wg.skill} | **S:** ${wg.strength} | **AP:** ${wg.ap} | **D:** ${wg.damage}`,
      cleanDesc ? `\n${cleanDesc}` : '',
    ].filter(Boolean).join('\n')

    nodes.push({
      id: weaponNodeId,
      layer: 'unit',
      category: 'weapon',
      title: wg.name,
      content,
      summary: `${wg.name} (${wg.type}) — ${wg.range}, ${wg.attacks}A, S${wg.strength}, AP${wg.ap}, D${wg.damage}.${cleanDesc ? ` [${cleanDesc}]` : ''}`,
      factionId: dsFactionMap.get(wg.datasheetId),
      subfaction: dsSubfactionMap.get(wg.datasheetId),
      datasheetId: wg.datasheetId,
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractWeaponKeywords(wg),
    })

    // Add strength tier and damage info to weapon keywords
    const s = parseInt(wg.strength)
    if (!isNaN(s)) {
      const tier = getStrengthTier(s)
      if (tier) {
        nodes[nodes.length - 1]!.keywords.push(`s${s}`, tier.name, `strength-${s}`)
      }
    }
    const d = parseInt(wg.damage)
    if (!isNaN(d) && d > 1) {
      nodes[nodes.length - 1]!.keywords.push(`damage-${d}`, `d${d}`)
    }
    const ap = parseInt(wg.ap)
    if (!isNaN(ap) && ap !== 0) {
      const absAp = Math.abs(ap)
      nodes[nodes.length - 1]!.keywords.push(`ap-${absAp}`, `ap${absAp}`)
    }

    // part_of ref to datasheet
    refs.push({
      sourceId: weaponNodeId,
      targetId: wg.datasheetId,
      rel: 'part_of',
      context: `${wg.name} is a weapon equipped by this unit.`,
      bidirectional: true,
    })
  }

  // ── 3. Unit abilities → unit/unit-ability nodes ───────────────────────────

  /** Split multi-option abilities into separate sub-entries. */
  function splitSubRules(description: string): Array<{ name: string; text: string }> {
    const lines = description.split('\n')
    const subRules: Array<{ name: string; text: string }> = []
    let currentName = ''
    let currentLines: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (/^[A-Z][A-Z\s'\-]{4,}$/.test(trimmed) &&
          !trimmed.includes('ADEPTUS') && !trimmed.includes('ASTARTES') &&
          !trimmed.includes('HERETIC') && !trimmed.includes('INFANTRY')) {
        if (currentName && currentLines.length > 0) {
          subRules.push({ name: currentName, text: currentLines.join('\n').trim() })
        }
        currentName = trimmed
        currentLines = []
      } else {
        currentLines.push(line)
      }
    }
    if (currentName && currentLines.length > 0) {
      subRules.push({ name: currentName, text: currentLines.join('\n').trim() })
    }
    return subRules
  }

  // Build set of faction ability names — these are army rules, not unit abilities.
  // Skip unit abilities that duplicate a faction ability (e.g. Blessings of Khorne
  // appears on every WE datasheet but is one army rule, handled in section 4).
  const factionAbilityNames = new Set(input.abilities.map(a => a.name.toLowerCase()))

  // For army rules that appear as unit abilities: instead of creating duplicate nodes,
  // create refs from the faction ability node to each datasheet that has the keyword.
  const armyRuleRefs = new Map<string, Set<string>>() // ability name → set of datasheet IDs
  for (const ab of filteredUnitAbilities) {
    if (factionAbilityNames.has(ab.name.toLowerCase())) {
      const dsIds = armyRuleRefs.get(ab.name.toLowerCase()) ?? new Set()
      dsIds.add(ab.datasheetId)
      armyRuleRefs.set(ab.name.toLowerCase(), dsIds)
    }
  }
  // Create modifies refs from faction ability → datasheets
  for (const [abilityName, dsIds] of armyRuleRefs) {
    // Find the faction ability node ID
    const factionAb = input.abilities.find(a => a.name.toLowerCase() === abilityName)
    if (!factionAb) continue
    const factionAbNodeId = `faction:${normalizeFactionId(factionAb.factionId)}:${slugify(factionAb.name)}`
    for (const dsId of dsIds) {
      const dsName = filteredDatasheets.find(d => d.id === dsId)?.name ?? dsId
      refs.push({
        sourceId: factionAbNodeId,
        targetId: dsId,
        rel: 'modifies',
        context: `${factionAb.name} applies to ${dsName}.`,
      })
    }
  }

  const seenAbilityIds = new Map<string, number>()
  for (const ab of filteredUnitAbilities) {
    // Skip if this is a faction ability (army rule) — handled above with refs
    if (factionAbilityNames.has(ab.name.toLowerCase())) continue
    const baseId = `ability:${ab.datasheetId}:${slugify(ab.name)}`
    const count = seenAbilityIds.get(baseId) ?? 0
    seenAbilityIds.set(baseId, count + 1)
    const abilityNodeId = count === 0 ? baseId : `${baseId}-${count}`

    const cleanAbDesc = stripHtml(ab.description)
    const dsName = filteredDatasheets.find(d => d.id === ab.datasheetId)?.name ?? ''

    // Split multi-option abilities
    const subRules = splitSubRules(cleanAbDesc)
    const hasSubRules = subRules.length >= 2

    const preamble = hasSubRules
      ? cleanAbDesc.substring(0, cleanAbDesc.indexOf(subRules[0]!.name)).trim()
      : cleanAbDesc

    // Main ability node
    nodes.push({
      id: abilityNodeId,
      layer: 'unit',
      category: 'unit-ability',
      title: ab.name,
      content: hasSubRules ? preamble : cleanAbDesc,
      summary: `${ab.name} (${ab.type}) on ${dsName} — ${truncate(preamble || cleanAbDesc, 120)}`,
      factionId: dsFactionMap.get(ab.datasheetId),
      subfaction: dsSubfactionMap.get(ab.datasheetId),
      datasheetId: ab.datasheetId,
      sources: [source],
      refs: [],
      version: 1,
      keywords: [ab.type.toLowerCase(), ...extractTerms(ab.description), ...extractTargetingKeywords(ab.description)],
    })

    refs.push({
      sourceId: abilityNodeId,
      targetId: ab.datasheetId,
      rel: 'part_of',
      context: `${ab.name} is a ${ab.type} ability of ${dsName}.`,
      bidirectional: true,
    })

    // Sub-rule nodes for each option
    if (hasSubRules) {
      for (const sub of subRules) {
        const subId = `${abilityNodeId}:${slugify(sub.name)}`

        nodes.push({
          id: subId,
          layer: 'unit',
          category: 'unit-ability',
          title: `${sub.name} (${ab.name})`,
          content: sub.text,
          summary: `${sub.name}, option of ${ab.name} on ${dsName} — ${truncate(sub.text, 120)}`,
          factionId: dsFactionMap.get(ab.datasheetId),
      subfaction: dsSubfactionMap.get(ab.datasheetId),
          datasheetId: ab.datasheetId,
          sources: [source],
          refs: [],
          version: 1,
          keywords: [ab.type.toLowerCase(), slugify(sub.name), ...extractTerms(sub.text), ...extractTargetingKeywords(sub.text)],
        })

        refs.push({
          sourceId: subId,
          targetId: abilityNodeId,
          rel: 'part_of',
          context: `${sub.name} is an option within ${ab.name} on ${dsName}.`,
          bidirectional: true,
        })

        // Create requires refs from sub-rules to core mechanic nodes
        // e.g. MARTIAL EXCELLENCE → core:sustained-hits
        const subText = `${sub.name} ${sub.text}`.toLowerCase()
        const SUB_RULE_CORE_LINKS: Array<{ pattern: string; coreSlug: string; label: string }> = [
          { pattern: 'sustained hits', coreSlug: 'sustained-hits', label: 'Sustained Hits' },
          { pattern: 'lethal hits', coreSlug: 'lethal-hits', label: 'Lethal Hits' },
          { pattern: 'devastating wounds', coreSlug: 'devastating-wounds', label: 'Devastating Wounds' },
          { pattern: 'feel no pain', coreSlug: 'feel-no-pain', label: 'Feel No Pain' },
          { pattern: 'hazardous', coreSlug: 'hazardous', label: 'Hazardous' },
          { pattern: 'deep strike', coreSlug: 'deep-strike', label: 'Deep Strike' },
          { pattern: 'stealth', coreSlug: 'stealth', label: 'Stealth' },
        ]
        for (const { pattern, coreSlug, label } of SUB_RULE_CORE_LINKS) {
          if (subText.includes(pattern)) {
            refs.push({
              sourceId: subId,
              targetId: `core:${coreSlug}`,
              rel: 'requires',
              context: `${sub.name} grants ${label}.`,
            })
          }
        }
      }
    }
  }

  // ── 4. Faction abilities (army rules) → faction/faction-ability nodes ─────

  const seenFactionAbIds = new Set<string>()
  for (const ab of input.abilities) {
    let factionAbId = `faction:${normalizeFactionId(ab.factionId)}:${slugify(ab.name)}`
    if (seenFactionAbIds.has(factionAbId)) {
      factionAbId = `faction:${normalizeFactionId(ab.factionId)}:${slugify(ab.name)}-${ab.id}`
    }
    seenFactionAbIds.add(factionAbId)
    const cleanFaDesc = stripHtml(ab.description)
    const fSlug = normalizeFactionId(ab.factionId)

    // Split multi-option faction abilities
    const subRules = splitSubRules(cleanFaDesc)
    const hasSubRules = subRules.length >= 2
    const preamble = hasSubRules
      ? cleanFaDesc.substring(0, cleanFaDesc.indexOf(subRules[0]!.name)).trim()
      : cleanFaDesc

    nodes.push({
      id: factionAbId,
      layer: 'faction',
      category: 'faction-ability',
      title: ab.name,
      content: hasSubRules ? preamble : cleanFaDesc,
      summary: `${ab.name} — army rule for ${fSlug}. ${truncate(preamble || cleanFaDesc, 100)}`,
      factionId: fSlug,
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractTerms(ab.description),
    })

    // Faction ability → faction parent ref
    if (fSlug) {
      refs.push({
        sourceId: factionAbId,
        targetId: `faction:${fSlug}`,
        rel: 'part_of',
        context: `${ab.name} is an army rule for ${fSlug}.`,
        bidirectional: true,
      })
    }

    if (hasSubRules) {
      for (const sub of subRules) {
        const subId = `${factionAbId}:${slugify(sub.name)}`
        nodes.push({
          id: subId,
          layer: 'faction',
          category: 'faction-ability',
          title: `${sub.name} (${ab.name})`,
          content: sub.text,
          summary: `${sub.name}, option of ${ab.name} for ${fSlug} — ${truncate(sub.text, 120)}`,
          factionId: fSlug,
          sources: [source],
          refs: [],
          version: 1,
          keywords: [slugify(sub.name), ...extractTerms(sub.text)],
        })
        refs.push({
          sourceId: subId,
          targetId: factionAbId,
          rel: 'part_of',
          context: `${sub.name} is an option within ${ab.name}.`,
          bidirectional: true,
        })

        // Create requires refs from faction ability sub-rules to core mechanic nodes
        const subText = `${sub.name} ${sub.text}`.toLowerCase()
        const FA_SUB_CORE_LINKS: Array<{ pattern: string; coreSlug: string; label: string }> = [
          { pattern: 'sustained hits', coreSlug: 'sustained-hits', label: 'Sustained Hits' },
          { pattern: 'lethal hits', coreSlug: 'lethal-hits', label: 'Lethal Hits' },
          { pattern: 'devastating wounds', coreSlug: 'devastating-wounds', label: 'Devastating Wounds' },
          { pattern: 'feel no pain', coreSlug: 'feel-no-pain', label: 'Feel No Pain' },
          { pattern: 'hazardous', coreSlug: 'hazardous', label: 'Hazardous' },
          { pattern: 'deep strike', coreSlug: 'deep-strike', label: 'Deep Strike' },
          { pattern: 'stealth', coreSlug: 'stealth', label: 'Stealth' },
        ]
        for (const { pattern, coreSlug, label } of FA_SUB_CORE_LINKS) {
          if (subText.includes(pattern)) {
            refs.push({
              sourceId: subId,
              targetId: `core:${coreSlug}`,
              rel: 'requires',
              context: `${sub.name} grants ${label}.`,
            })
          }
        }
      }
    }
  }

  // ── 5. Detachments → faction/detachment-rule nodes ────────────────────────

  // Build detachment → chapter restriction map
  // Scan detachment ability text for chapter names to determine which are chapter-locked
  // Build chapter lock map from shared filter module
  const detChapterMap = buildDetachmentChapterMap(filteredDetachments, filteredDetAbilities)

  const seenDetIds = new Set<string>()
  for (const det of filteredDetachments) {
    let detNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}`
    if (seenDetIds.has(detNodeId)) {
      detNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}-${det.id}`
    }
    seenDetIds.add(detNodeId)
    const detAbilities = abilitiesByDetachment.get(det.id) ?? []
    const detStratagems = stratagemsByDetachment.get(det.id) ?? []
    const detEnhancements = enhancementsByDetachment.get(det.id) ?? []

    const content = [
      det.legend ? `*${stripHtml(det.legend)}*` : '',
      detAbilities.length > 0
        ? `**Detachment Ability:** ${detAbilities.map(a => `${a.name} — ${truncate(stripHtml(a.description), 200)}`).join('\n\n')}`
        : '',
    ].filter(Boolean).join('\n\n')

    nodes.push({
      id: detNodeId,
      layer: 'faction',
      category: 'detachment-rule',
      title: det.name,
      content,
      summary: `${det.name} detachment for ${normalizeFactionId(det.factionId)}${detChapterMap.has(det.id) ? ` [${detChapterMap.get(det.id)} only]` : ' [any chapter]'}. ${detAbilities[0]?.name ?? ''}`,
      factionId: normalizeFactionId(det.factionId),
      subfaction: detChapterMap.has(det.id) ? detChapterMap.get(det.id)!.toLowerCase() : undefined,
      detachmentId: det.id,
      sources: [source],
      refs: [],
      version: 1,
      keywords: [
        ...extractTerms(content),
        ...(detChapterMap.has(det.id) ? [detChapterMap.get(det.id)!.toLowerCase()] : ['any chapter']),
      ],
    })

    // Detachment → faction parent ref
    refs.push({
      sourceId: detNodeId,
      targetId: `faction:${normalizeFactionId(det.factionId)}`,
      rel: 'part_of',
      context: `${det.name} is a detachment for ${normalizeFactionId(det.factionId)}.`,
      bidirectional: true,
    })

    // ── 5a. Detachment abilities → faction/faction-ability ─────────────────

    for (const da of detAbilities) {
      const daNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(da.name)}`

      const cleanDaDesc = stripHtml(da.description)
      const daSubfaction = detChapterMap.has(det.id) ? detChapterMap.get(det.id)!.toLowerCase() : undefined

      nodes.push({
        id: daNodeId,
        layer: 'faction',
        category: 'faction-ability',
        title: da.name,
        content: cleanDaDesc,
        summary: `${da.name} — detachment ability for ${det.name}. ${truncate(cleanDaDesc, 100)}`,
        factionId: normalizeFactionId(det.factionId),
        subfaction: daSubfaction,
        detachmentId: det.id,
        sources: [source],
        refs: [],
        version: 1,
        keywords: [...extractTerms(da.description), ...extractTargetingKeywords(da.description)],
      })

      refs.push({
        sourceId: daNodeId,
        targetId: detNodeId,
        rel: 'part_of',
        context: `${da.name} is the detachment ability of ${det.name}.`,
        bidirectional: true,
      })
    }

    // ── 5b. Stratagems → faction/stratagem ────────────────────────────────

    for (const strat of detStratagems) {
      const stratNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(strat.name)}`

      const cleanStratDesc = stripHtml(strat.description)
      // Inherit subfaction from parent detachment (chapter lock propagates to stratagems)
      const stratSubfaction = detChapterMap.has(det.id) ? detChapterMap.get(det.id)!.toLowerCase() : undefined

      nodes.push({
        id: stratNodeId,
        layer: 'faction',
        category: 'stratagem',
        title: strat.name,
        content: `**Type:** ${strat.type}\n**CP:** ${strat.cpCost}\n**Turn:** ${strat.turn}\n**Phase:** ${strat.phase}\n\n${cleanStratDesc}`,
        summary: `${strat.name} (${strat.cpCost}CP, ${strat.phase}) — ${truncate(cleanStratDesc, 100)}`,
        factionId: normalizeFactionId(det.factionId),
        subfaction: stratSubfaction,
        detachmentId: det.id,
        phase: mapPhase(strat.phase),
        sources: [source],
        refs: [],
        version: 1,
        keywords: ['stratagem', strat.type.toLowerCase(), ...extractTerms(strat.description), ...extractTargetingKeywords(strat.description)],
      })

      refs.push({
        sourceId: stratNodeId,
        targetId: detNodeId,
        rel: 'part_of',
        context: `${strat.name} is a ${strat.type} stratagem in the ${det.name} detachment.`,
        bidirectional: true,
      })
    }

    // ── 5c. Enhancements → faction/enhancement ───────────────────────────

    for (const enh of detEnhancements) {
      const enhNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(enh.name)}`

      const cleanEnhDesc = stripHtml(enh.description)
      const enhSubfaction = detChapterMap.has(det.id) ? detChapterMap.get(det.id)!.toLowerCase() : undefined

      nodes.push({
        id: enhNodeId,
        layer: 'faction',
        category: 'enhancement',
        title: enh.name,
        content: `**Cost:** ${enh.cost}\n\n${cleanEnhDesc}`,
        summary: `${enh.name} (${enh.cost}pts) — ${truncate(cleanEnhDesc, 100)}`,
        factionId: normalizeFactionId(det.factionId),
        subfaction: enhSubfaction,
        detachmentId: det.id,
        sources: [source],
        refs: [],
        version: 1,
        keywords: ['enhancement', ...extractTerms(enh.description), ...extractTargetingKeywords(enh.description)],
      })

      refs.push({
        sourceId: enhNodeId,
        targetId: detNodeId,
        rel: 'part_of',
        context: `${enh.name} is an enhancement in the ${det.name} detachment.`,
        bidirectional: true,
      })
    }
  }

  // ── 6. Junction tables → modifies refs ────────────────────────────────────

  for (const j of filteredDsStratagems) {
    if (j.stratagemId) {
      // Find the stratagem node
      const strat = filteredStratagems.find(s => s.id === j.stratagemId)
      if (strat) {
        const det = input.detachments.find(d => d.id === strat.detachmentId)
        if (det) {
          const stratNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(strat.name)}`
          refs.push({
            sourceId: stratNodeId,
            targetId: j.datasheetId,
            rel: 'modifies',
            context: `${strat.name} stratagem can be used with this unit.`,
          })
        }
      }
    }
  }

  for (const j of filteredDsEnhancements) {
    if (j.enhancementId) {
      const enh = filteredEnhancements.find(e => e.id === j.enhancementId)
      if (enh) {
        const det = input.detachments.find(d => d.id === enh.detachmentId)
        if (det) {
          const enhNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(enh.name)}`
          refs.push({
            sourceId: enhNodeId,
            targetId: j.datasheetId,
            rel: 'modifies',
            context: `${enh.name} enhancement can be given to a model in this unit.`,
          })
        }
      }
    }
  }

  // ── 7. Weapon ability → core rule requires refs ────────────────────────────
  //
  // Weapon abilities (Sustained Hits, Lethal Hits, etc.) are properties of
  // each unit's specific weapon records. The link chain is:
  //   datasheet ←[part_of]— weapon —[requires]→ core mechanic
  //
  // Each weapon node already has a part_of ref to its datasheet (created in
  // section 2). Here we add the requires ref from the weapon to the core
  // rules node that defines the mechanic.

  const WEAPON_ABILITY_CORE_NODES: Array<{ pattern: string; coreSlug: string; label: string }> = [
    { pattern: 'sustained hits', coreSlug: 'sustained-hits', label: 'Sustained Hits' },
    { pattern: 'lethal hits', coreSlug: 'lethal-hits', label: 'Lethal Hits' },
    { pattern: 'devastating wounds', coreSlug: 'devastating-wounds', label: 'Devastating Wounds' },
    { pattern: 'hazardous', coreSlug: 'hazardous', label: 'Hazardous' },
    { pattern: 'blast', coreSlug: 'blast', label: 'Blast' },
    { pattern: 'torrent', coreSlug: 'torrent', label: 'Torrent' },
    { pattern: 'twin-linked', coreSlug: 'twin-linked', label: 'Twin-linked' },
    { pattern: 'rapid fire', coreSlug: 'rapid-fire', label: 'Rapid Fire' },
    { pattern: 'pistol', coreSlug: 'pistol', label: 'Pistol' },
    { pattern: 'melta', coreSlug: 'melta', label: 'Melta' },
    { pattern: 'lance', coreSlug: 'lance', label: 'Lance' },
    { pattern: 'anti-', coreSlug: 'anti', label: 'Anti' },
    { pattern: 'ignores cover', coreSlug: 'ignores-cover', label: 'Ignores Cover' },
    { pattern: 'indirect fire', coreSlug: 'indirect-fire', label: 'Indirect Fire' },
  ]

  for (const wg of filteredWargear) {
    const weaponNodeId = `weapon:${wg.datasheetId}:${slugify(wg.name)}`
    const desc = (wg.description ?? '').toLowerCase()

    for (const { pattern, coreSlug, label } of WEAPON_ABILITY_CORE_NODES) {
      if (desc.includes(pattern)) {
        refs.push({
          sourceId: weaponNodeId,
          targetId: `core:${coreSlug}`,
          rel: 'requires',
          context: `${wg.name} has the ${label} ability. See the core rules for how ${label} works.`,
        })
      }
    }
  }

  // ── 8. Unit ability → core rule requires refs ─────────────────────────────
  //
  // Unit abilities like Feel No Pain, Deep Strike, Stealth, etc. are on the
  // datasheet, not the weapon. Scan unitAbilities descriptions for refs to
  // core mechanic nodes.

  const UNIT_ABILITY_CORE_NODES: Array<{ pattern: string; coreSlug: string; label: string }> = [
    { pattern: 'feel no pain', coreSlug: 'feel-no-pain', label: 'Feel No Pain' },
    { pattern: 'deadly demise', coreSlug: 'deadly-demise', label: 'Deadly Demise' },
    { pattern: 'deep strike', coreSlug: 'deep-strike', label: 'Deep Strike' },
    { pattern: 'lone operative', coreSlug: 'lone-operative', label: 'Lone Operative' },
    { pattern: 'stealth', coreSlug: 'stealth', label: 'Stealth' },
    { pattern: 'scouts', coreSlug: 'scouts', label: 'Scouts' },
    { pattern: 'infiltrator', coreSlug: 'infiltrators', label: 'Infiltrators' },
    { pattern: 'battle-shock', coreSlug: 'battle-shock', label: 'Battle-shock' },
    { pattern: 'fights first', coreSlug: 'fights-first', label: 'Fights First' },
    { pattern: 'overwatch', coreSlug: 'fire-overwatch', label: 'Fire Overwatch' },
    { pattern: 'firing deck', coreSlug: 'firing-deck', label: 'Firing Deck' },
  ]

  const ALL_CORE_PATTERNS = [...WEAPON_ABILITY_CORE_NODES, ...UNIT_ABILITY_CORE_NODES]

  for (const ab of filteredUnitAbilities) {
    // Use the deduplicated ID from section 3
    const baseId = `ability:${ab.datasheetId}:${slugify(ab.name)}`
    const existingCount = seenAbilityIds.get(baseId) ?? 0
    const abilityNodeId = existingCount <= 1 ? baseId : `${baseId}-${existingCount - 1}`

    const text = `${ab.name} ${ab.description}`.toLowerCase()

    for (const { pattern, coreSlug, label } of ALL_CORE_PATTERNS) {
      if (text.includes(pattern)) {
        refs.push({
          sourceId: abilityNodeId,
          targetId: `core:${coreSlug}`,
          rel: 'requires',
          context: `${ab.name} references ${label}. See the core rules for how ${label} works.`,
        })
      }
    }
  }

  // ── 9. Stratagem/enhancement → core rule requires refs ────────────────────
  //
  // Stratagems and enhancements that grant abilities (e.g., "weapons in this
  // unit gain [SUSTAINED HITS 1]") need refs to those core mechanic nodes.
  // This is how you answer "who has sustained hits" — not just weapons that
  // natively have it, but stratagems that can grant it.

  // ALL_CORE_PATTERNS already defined above

  for (const strat of filteredStratagems) {
    const det = input.detachments.find(d => d.id === strat.detachmentId)
    if (!det) continue
    const stratNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(strat.name)}`
    const text = `${strat.name} ${strat.description}`.toLowerCase()

    for (const { pattern, coreSlug, label } of ALL_CORE_PATTERNS) {
      if (text.includes(pattern)) {
        refs.push({
          sourceId: stratNodeId,
          targetId: `core:${coreSlug}`,
          rel: 'interacts_with',
          context: `${strat.name} stratagem references ${label}. It may grant or interact with this ability.`,
        })
      }
    }
  }

  for (const enh of filteredEnhancements) {
    const det = input.detachments.find(d => d.id === enh.detachmentId)
    if (!det) continue
    const enhNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(enh.name)}`
    const text = `${enh.name} ${enh.description}`.toLowerCase()

    for (const { pattern, coreSlug, label } of ALL_CORE_PATTERNS) {
      if (text.includes(pattern)) {
        refs.push({
          sourceId: enhNodeId,
          targetId: `core:${coreSlug}`,
          rel: 'interacts_with',
          context: `${enh.name} enhancement references ${label}. It may grant or interact with this ability.`,
        })
      }
    }
  }

  // Detachment abilities too
  for (const da of filteredDetAbilities) {
    const det = input.detachments.find(d => d.id === da.detachmentId)
    if (!det) continue
    const daNodeId = `det:${normalizeFactionId(det.factionId)}:${slugify(det.name)}:${slugify(da.name)}`
    const text = `${da.name} ${da.description}`.toLowerCase()

    for (const { pattern, coreSlug, label } of ALL_CORE_PATTERNS) {
      if (text.includes(pattern)) {
        refs.push({
          sourceId: daNodeId,
          targetId: `core:${coreSlug}`,
          rel: 'interacts_with',
          context: `${da.name} detachment ability references ${label}. It may grant or interact with this ability.`,
        })
      }
    }
  }

  // ── 10. Leader attachments → interacts_with refs ──────────────────────────

  for (const la of filteredLeaderAttachments) {
    refs.push({
      sourceId: la.leaderId,
      targetId: la.attachedId,
      rel: 'interacts_with',
      context: `This leader can be attached to this unit as a Bodyguard.`,
      bidirectional: true,
    })
  }

  // ── 11. Combo detection — stacks_with refs ────────────────────────────────
  //
  // The three key fishing combos:
  //   hit re-rolls + sustained hits = fish for extra hits
  //   hit re-rolls + lethal hits = fish for auto-wounds
  //   wound re-rolls + devastating wounds = fish for mortal wounds
  //
  // Scan all non-weapon, non-datasheet nodes for what they grant and what
  // weapon type they target. Create stacks_with refs between complementary
  // pairs that share a weapon type or both target "all weapons."

  interface BuffEntry {
    nodeId: string
    title: string
    unitName: string
    factionId: string
    subfaction: string
    detachmentId: string
    scope: ReturnType<typeof detectScope>
    category: string
    weaponTypes: string[]
    grantsRerolls: 'hit' | 'wound' | null
    grantsAbility: string[]
  }

  function classifyBuff(nodeId: string, title: string, content: string, factionId: string): BuffEntry | null {
    const grants = classifyGrants(content)
    if (!grants.grantsRerolls && grants.grantsAbility.length === 0) return null

    return {
      nodeId, title, factionId,
      unitName: '',
      subfaction: '',
      detachmentId: '',
      scope: 'unit' as const,
      category: '',
      weaponTypes: detectWeaponTypes(content),
      ...grants,
    }
  }

  // Build datasheet name lookup for unit context in combos
  const dsNameMap = new Map<string, string>()
  for (const ds of filteredDatasheets) dsNameMap.set(ds.id, ds.name)
  // Build detachment name lookup
  const detNameMap = new Map<string, string>()
  for (const det of filteredDetachments) detNameMap.set(det.id, det.name)

  // Collect all buffs from abilities, stratagems, enhancements, faction abilities
  const allBuffs: BuffEntry[] = []

  for (const n of nodes) {
    if (n.category === 'weapon' || n.category === 'datasheet') continue
    const buff = classifyBuff(n.id, n.title, n.content, n.factionId ?? '')
    if (buff) {
      buff.unitName = n.datasheetId ? (dsNameMap.get(n.datasheetId) ?? '') :
                      n.detachmentId ? (detNameMap.get(n.detachmentId) ?? '') : ''
      buff.subfaction = n.subfaction ?? ''
      buff.detachmentId = n.detachmentId ?? ''
      buff.category = n.category
      buff.scope = detectScope(n.category, n.content)

      allBuffs.push(buff)
    }
  }

  // Find complementary pairs within the same faction (or generic)
  // hit re-rolls + sustained hits/lethal hits
  // wound re-rolls + devastating wounds
  const COMBOS: Array<{ rerollType: 'hit' | 'wound'; ability: string }> = [
    { rerollType: 'hit', ability: 'sustained hits' },
    { rerollType: 'hit', ability: 'lethal hits' },
    { rerollType: 'wound', ability: 'devastating wounds' },
  ]

  const seenCombos = new Set<string>()

  for (const combo of COMBOS) {
    const rerollers = allBuffs.filter(b => b.grantsRerolls === combo.rerollType)
    const abilityGranters = allBuffs.filter(b => b.grantsAbility.includes(combo.ability))

    for (const rr of rerollers) {
      for (const ag of abilityGranters) {
        if (rr.nodeId === ag.nodeId) continue

        // ── Army construction constraints ──

        // Must be same faction or one is generic
        if (rr.factionId && ag.factionId && rr.factionId !== ag.factionId) continue

        // Chapter lock: if both have subfactions, they must match
        if (rr.subfaction && ag.subfaction && rr.subfaction !== ag.subfaction) continue

        // One detachment: stratagems/enhancements from different detachments can't combine
        if (rr.detachmentId && ag.detachmentId && rr.detachmentId !== ag.detachmentId
            && (rr.category === 'stratagem' || rr.category === 'enhancement')
            && (ag.category === 'stratagem' || ag.category === 'enhancement')) continue

        // Bearer-only scope: enhancement on bearer + leader ability on unit don't fully stack
        // (only the bearer benefits from both, not the whole unit)
        // Still create the ref but mark it as bearer-limited
        const bearerLimited = rr.scope === 'bearer' || ag.scope === 'bearer'

        // Two leader abilities can't apply to the same unit (one leader per unit)
        // Leader abilities are unit-abilities from characters (have datasheetId, scope=unit)
        const bothLeaders = rr.scope === 'unit' && ag.scope === 'unit'
            && rr.category === 'unit-ability' && ag.category === 'unit-ability'
            && rr.nodeId.startsWith('ability:') && ag.nodeId.startsWith('ability:')
        if (bothLeaders) continue

        // Must share a weapon type or one targets 'all'
        const sharedTypes = rr.weaponTypes.filter(t =>
          t === 'all' || ag.weaponTypes.includes(t) || ag.weaponTypes.includes('all')
        )
        if (sharedTypes.length === 0) continue

        // Deduplicate — only create one ref per pair
        const comboKey = [rr.nodeId, ag.nodeId].sort().join('|')
        if (seenCombos.has(comboKey)) continue
        seenCombos.add(comboKey)

        const weaponTypeStr = sharedTypes.includes('all') ? 'weapons' : sharedTypes.join('/') + ' weapons'
        const factionStr = rr.factionId || ag.factionId || 'generic'
        const rrUnit = rr.unitName ? ` on ${rr.unitName}` : ''
        const agUnit = ag.unitName ? ` on ${ag.unitName}` : ''

        const bearerNote = bearerLimited ? ' [bearer only]' : ''

        refs.push({
          sourceId: rr.nodeId,
          targetId: ag.nodeId,
          rel: 'stacks_with',
          context: `[${factionStr}] ${rr.title}${rrUnit} (${combo.rerollType} re-rolls) + ${ag.title}${agUnit} (${combo.ability}) on ${weaponTypeStr}${bearerNote}.`,
          bidirectional: true,
        })
      }
    }
  }

  return { nodes, refs }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const arr = map.get(k) ?? []
    arr.push(item)
    map.set(k, arr)
  }
  return map
}


function extractWeaponKeywords(wg: DatasheetWargearRecord): string[] {
  const kw: string[] = []
  const desc = (wg.description ?? '').toLowerCase()
  const type = (wg.type ?? '').toLowerCase()

  if (type.includes('melee')) kw.push('melee')
  if (type.includes('ranged')) kw.push('ranged')
  if (desc.includes('pistol')) kw.push('pistol')
  if (desc.includes('heavy')) kw.push('heavy')
  if (desc.includes('assault')) kw.push('assault')
  if (desc.includes('rapid fire')) kw.push('rapid fire')
  if (desc.includes('blast')) kw.push('blast')
  if (desc.includes('torrent')) kw.push('torrent')
  if (desc.includes('melta')) kw.push('melta')
  if (desc.includes('twin-linked')) kw.push('twin-linked')
  if (desc.includes('sustained hits')) kw.push('sustained hits')
  if (desc.includes('lethal hits')) kw.push('lethal hits')
  if (desc.includes('devastating wounds')) kw.push('devastating wounds')
  if (desc.includes('anti-')) kw.push('anti')
  if (desc.includes('lance')) kw.push('lance')
  if (desc.includes('ignores cover')) kw.push('ignores cover')

  return kw
}

function extractTerms(text: string): string[] {
  const lower = text.toLowerCase()
  const terms = [
    'wound', 'hit', 'save', 'strength', 'toughness', 'leadership',
    'charge', 'shoot', 'fight', 'advance', 'fall back', 'overwatch',
    'battle-shock', 'deep strike', 'stratagem', 'engagement range',
    'cover', 'terrain', 'objective', 'damage', 'mortal wound',
    'feel no pain', 'invulnerable', 'transport', 'character',
    'infantry', 'vehicle', 'monster', 'leader', 'attached',
    'lone operative', 'stealth', 'scouts', 'deadly demise',
    // Weapon abilities — also appear in unit abilities, stratagems, enhancements
    'sustained hits', 'lethal hits', 'devastating wounds', 'hazardous',
    'blast', 'torrent', 'twin-linked', 'rapid fire', 'pistol', 'melta',
    'lance', 'anti-', 'ignores cover', 'indirect fire',
  ]
  return terms.filter(t => lower.includes(t))
}
