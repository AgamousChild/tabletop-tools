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

  // Build lookup maps
  const modelsByDatasheet = groupBy(input.datasheetModels, r => r.datasheetId)
  const keywordsByDatasheet = groupBy(input.unitKeywords, r => r.datasheetId)
  const compositionsByDatasheet = groupBy(input.unitCompositions, r => r.datasheetId)
  const costsByDatasheet = groupBy(input.unitCosts, r => r.datasheetId)
  const wargearByDatasheet = groupBy(input.datasheetWargear, r => r.datasheetId)
  const abilitiesByDatasheet = groupBy(input.unitAbilities, r => r.datasheetId)
  const abilitiesByDetachment = groupBy(input.detachmentAbilities, r => r.detachmentId)
  const stratagemsByDetachment = groupBy(input.stratagems, r => r.detachmentId)
  const enhancementsByDetachment = groupBy(input.enhancements, r => r.detachmentId)

  // ── 1. Datasheets → unit/datasheet nodes ──────────────────────────────────

  for (const ds of input.datasheets) {
    const models = modelsByDatasheet.get(ds.id) ?? []
    const keywords = keywordsByDatasheet.get(ds.id) ?? []
    const compositions = compositionsByDatasheet.get(ds.id) ?? []
    const costs = costsByDatasheet.get(ds.id) ?? []

    const statBlock = models.length > 0
      ? models.map(m => `${m.name}: M${m.move} T${m.toughness} Sv${m.save} W${m.wounds} Ld${m.leadership} OC${m.oc}${m.invSv ? ` ${m.invSv}++` : ''}`).join('\n')
      : ''

    const keywordList = keywords.map(k => k.keyword).join(', ')
    const factionKeywords = keywords.filter(k => k.isFactionKeyword).map(k => k.keyword).join(', ')
    const compositionText = compositions.map(c => c.description).join('\n')
    const costText = costs.map(c => `${c.description}: ${c.cost}pts`).join(', ')

    const content = [
      statBlock,
      ds.role ? `**Role:** ${ds.role}` : '',
      keywordList ? `**Keywords:** ${keywordList}` : '',
      factionKeywords ? `**Faction Keywords:** ${factionKeywords}` : '',
      compositionText ? `**Composition:** ${compositionText}` : '',
      costText ? `**Points:** ${costText}` : '',
      ds.transport ? `**Transport:** ${ds.transport}` : '',
      ds.loadout ? `**Loadout:** ${ds.loadout}` : '',
      ds.damagedW ? `**Damaged (${ds.damagedW}W):** ${ds.damagedDescription}` : '',
    ].filter(Boolean).join('\n\n')

    const node: Node = {
      id: ds.id,  // BSData GUID
      layer: 'unit',
      category: 'datasheet',
      title: ds.name,
      content,
      summary: `${ds.name} — ${ds.role}${costs.length ? `, ${costText}` : ''}.`,
      factionId: ds.factionId,
      datasheetId: ds.id,
      sources: [source],
      refs: [],
      version: 1,
      keywords: [...keywords.map(k => k.keyword.toLowerCase()), ds.role.toLowerCase()].filter(Boolean),
    }
    if (ds.isLegends) {
      node.keywords.push('legends')
    }
    nodes.push(node)
  }

  // ── 2. Weapons → unit/weapon nodes ────────────────────────────────────────

  for (const wg of input.datasheetWargear) {
    const weaponNodeId = `weapon:${wg.datasheetId}:${slugify(wg.name)}`

    const content = [
      `**Range:** ${wg.range} | **Type:** ${wg.type}`,
      `**A:** ${wg.attacks} | **BS/WS:** ${wg.skill} | **S:** ${wg.strength} | **AP:** ${wg.ap} | **D:** ${wg.damage}`,
      wg.description ? `\n${wg.description}` : '',
    ].filter(Boolean).join('\n')

    nodes.push({
      id: weaponNodeId,
      layer: 'unit',
      category: 'weapon',
      title: wg.name,
      content,
      summary: `${wg.name} — ${wg.range}, ${wg.attacks}A, S${wg.strength}, AP${wg.ap}, D${wg.damage}.`,
      datasheetId: wg.datasheetId,
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractWeaponKeywords(wg),
    })

    // part_of ref to datasheet
    refs.push({
      targetId: wg.datasheetId,
      rel: 'part_of',
      context: `${wg.name} is a weapon equipped by this unit.`,
      bidirectional: true,
    })
  }

  // ── 3. Unit abilities → unit/unit-ability nodes ───────────────────────────

  for (const ab of input.unitAbilities) {
    const abilityNodeId = `ability:${ab.datasheetId}:${slugify(ab.name)}`

    nodes.push({
      id: abilityNodeId,
      layer: 'unit',
      category: 'unit-ability',
      title: ab.name,
      content: ab.description,
      summary: `${ab.name} (${ab.type}) — ${truncate(ab.description, 150)}`,
      datasheetId: ab.datasheetId,
      sources: [source],
      refs: [],
      version: 1,
      keywords: [ab.type.toLowerCase(), ...extractTerms(ab.description)],
    })

    refs.push({
      targetId: ab.datasheetId,
      rel: 'part_of',
      context: `${ab.name} is a ${ab.type} ability of this unit.`,
      bidirectional: true,
    })
  }

  // ── 4. Faction abilities (army rules) → faction/faction-ability nodes ─────

  for (const ab of input.abilities) {
    const factionAbId = `faction:${ab.factionId}:${slugify(ab.name)}`

    nodes.push({
      id: factionAbId,
      layer: 'faction',
      category: 'faction-ability',
      title: ab.name,
      content: ab.description,
      summary: `${ab.name} — army rule for ${ab.factionId}. ${truncate(ab.description, 100)}`,
      factionId: ab.factionId,
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractTerms(ab.description),
    })
  }

  // ── 5. Detachments → faction/detachment-rule nodes ────────────────────────

  for (const det of input.detachments) {
    const detNodeId = `det:${det.factionId}:${slugify(det.name)}`
    const detAbilities = abilitiesByDetachment.get(det.id) ?? []
    const detStratagems = stratagemsByDetachment.get(det.id) ?? []
    const detEnhancements = enhancementsByDetachment.get(det.id) ?? []

    const content = [
      det.legend ? `*${det.legend}*` : '',
      detAbilities.length > 0
        ? `**Detachment Ability:** ${detAbilities.map(a => `${a.name} — ${truncate(a.description, 200)}`).join('\n\n')}`
        : '',
    ].filter(Boolean).join('\n\n')

    nodes.push({
      id: detNodeId,
      layer: 'faction',
      category: 'detachment-rule',
      title: det.name,
      content,
      summary: `${det.name} detachment for ${det.factionId}. ${detAbilities[0]?.name ?? ''}`,
      factionId: det.factionId,
      detachmentId: det.id,
      sources: [source],
      refs: [],
      version: 1,
      keywords: extractTerms(content),
    })

    // ── 5a. Detachment abilities → faction/faction-ability ─────────────────

    for (const da of detAbilities) {
      const daNodeId = `det:${det.factionId}:${slugify(det.name)}:${slugify(da.name)}`

      nodes.push({
        id: daNodeId,
        layer: 'faction',
        category: 'faction-ability',
        title: da.name,
        content: da.description,
        summary: `${da.name} — detachment ability for ${det.name}. ${truncate(da.description, 100)}`,
        factionId: det.factionId,
        detachmentId: det.id,
        sources: [source],
        refs: [],
        version: 1,
        keywords: extractTerms(da.description),
      })

      refs.push({
        targetId: detNodeId,
        rel: 'part_of',
        context: `${da.name} is the detachment ability of ${det.name}.`,
        bidirectional: true,
      })
    }

    // ── 5b. Stratagems → faction/stratagem ────────────────────────────────

    for (const strat of detStratagems) {
      const stratNodeId = `det:${det.factionId}:${slugify(det.name)}:${slugify(strat.name)}`

      nodes.push({
        id: stratNodeId,
        layer: 'faction',
        category: 'stratagem',
        title: strat.name,
        content: `**Type:** ${strat.type}\n**CP:** ${strat.cpCost}\n**Turn:** ${strat.turn}\n**Phase:** ${strat.phase}\n\n${strat.description}`,
        summary: `${strat.name} (${strat.cpCost}CP, ${strat.phase}) — ${truncate(strat.description, 100)}`,
        factionId: det.factionId,
        detachmentId: det.id,
        phase: mapPhase(strat.phase),
        sources: [source],
        refs: [],
        version: 1,
        keywords: ['stratagem', strat.type.toLowerCase(), ...extractTerms(strat.description)],
      })

      refs.push({
        targetId: detNodeId,
        rel: 'part_of',
        context: `${strat.name} is a ${strat.type} stratagem in the ${det.name} detachment.`,
        bidirectional: true,
      })
    }

    // ── 5c. Enhancements → faction/enhancement ───────────────────────────

    for (const enh of detEnhancements) {
      const enhNodeId = `det:${det.factionId}:${slugify(det.name)}:${slugify(enh.name)}`

      nodes.push({
        id: enhNodeId,
        layer: 'faction',
        category: 'enhancement',
        title: enh.name,
        content: `**Cost:** ${enh.cost}\n\n${enh.description}`,
        summary: `${enh.name} (${enh.cost}pts) — ${truncate(enh.description, 100)}`,
        factionId: det.factionId,
        detachmentId: det.id,
        sources: [source],
        refs: [],
        version: 1,
        keywords: ['enhancement', ...extractTerms(enh.description)],
      })

      refs.push({
        targetId: detNodeId,
        rel: 'part_of',
        context: `${enh.name} is an enhancement in the ${det.name} detachment.`,
        bidirectional: true,
      })
    }
  }

  // ── 6. Junction tables → modifies refs ────────────────────────────────────

  for (const j of input.datasheetStratagems) {
    if (j.stratagemId) {
      // Find the stratagem node
      const strat = input.stratagems.find(s => s.id === j.stratagemId)
      if (strat) {
        const det = input.detachments.find(d => d.id === strat.detachmentId)
        if (det) {
          const stratNodeId = `det:${det.factionId}:${slugify(det.name)}:${slugify(strat.name)}`
          refs.push({
            targetId: j.datasheetId,
            rel: 'modifies',
            context: `${strat.name} stratagem can be used with this unit.`,
          })
        }
      }
    }
  }

  for (const j of input.datasheetEnhancements) {
    if (j.enhancementId) {
      const enh = input.enhancements.find(e => e.id === j.enhancementId)
      if (enh) {
        const det = input.detachments.find(d => d.id === enh.detachmentId)
        if (det) {
          refs.push({
            targetId: j.datasheetId,
            rel: 'modifies',
            context: `${enh.name} enhancement can be given to a model in this unit.`,
          })
        }
      }
    }
  }

  // ── 7. Weapon ability → core rule requires refs ────────────────────────────

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

  for (const wg of input.datasheetWargear) {
    const weaponNodeId = `weapon:${wg.datasheetId}:${slugify(wg.name)}`
    const desc = (wg.description ?? '').toLowerCase()

    for (const { pattern, coreSlug, label } of WEAPON_ABILITY_CORE_NODES) {
      if (desc.includes(pattern)) {
        refs.push({
          targetId: `core:${coreSlug}`,
          rel: 'requires',
          context: `${wg.name} has the ${label} ability. See the core rules for how ${label} works.`,
        })
      }
    }
  }

  // ── 8. Leader attachments → interacts_with refs ───────────────────────────

  for (const la of input.leaderAttachments) {
    refs.push({
      targetId: la.attachedId,
      rel: 'interacts_with',
      context: `This leader can be attached to this unit as a Bodyguard.`,
      bidirectional: true,
    })
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

function truncate(text: string, maxLen: number): string {
  const clean = text.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim()
  return clean.length > maxLen ? clean.substring(0, maxLen - 3) + '...' : clean
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
  ]
  return terms.filter(t => lower.includes(t))
}
