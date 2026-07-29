/**
 * combo-detection.ts — Build stacks_with refs between complementary abilities.
 *
 * MUST run after merge + massage so all nodes have their final factionId and
 * detachmentId. Running earlier produces cross-faction refs because nodes
 * haven't been normalized yet.
 */
import { classifyGrants, detectScope, detectWeaponTypes } from './filters'
import type { Node, NodeRef } from './model'

interface BuffEntry {
  nodeId: string
  title: string
  unitName: string
  factionId: string
  detachmentId: string
  scope: ReturnType<typeof detectScope>
  category: string
  weaponTypes: string[]
  grantsRerolls: 'hit' | 'wound' | null
  grantsAbility: string[]
}

function classifyBuff(
  nodeId: string,
  title: string,
  content: string,
  factionId: string,
): BuffEntry | null {
  const grants = classifyGrants(content)
  if (!grants.grantsRerolls && grants.grantsAbility.length === 0) return null

  return {
    nodeId,
    title,
    factionId,
    unitName: '',
    detachmentId: '',
    scope: 'unit' as const,
    category: '',
    weaponTypes: detectWeaponTypes(content),
    ...grants,
  }
}

/**
 * Scan all non-weapon, non-datasheet nodes for what they grant.
 * Create stacks_with refs between complementary pairs that:
 * - Share a faction (or one is generic core)
 * - Don't mix detachment-locked abilities from different detachments
 * - Share a weapon type (or one targets all)
 *
 * The three key fishing combos:
 *   hit re-rolls + sustained hits = fish for extra hits
 *   hit re-rolls + lethal hits = fish for auto-wounds
 *   wound re-rolls + devastating wounds = fish for mortal wounds
 */
export function buildComboRefs(allNodes: Node[]): NodeRef[] {
  const refs: NodeRef[] = []

  // Build name lookups for context strings
  const dsNameMap = new Map<string, string>()
  const detNameMap = new Map<string, string>()
  for (const n of allNodes) {
    if (n.category === 'datasheet') dsNameMap.set(n.id, n.title)
    if (n.category === 'detachment-rule') detNameMap.set(n.id, n.title)
  }

  // Only consider nodes that ARE game rules — not community content, errata, or balance changes
  const RULES_LAYERS = new Set(['faction', 'unit', 'core'])
  const RULES_CATEGORIES = new Set([
    'army-rule',
    'army-ability',
    'faction-ability',
    'detachment-rule',
    'stratagem',
    'enhancement',
    'unit-ability',
  ])

  // Collect all buffs
  const allBuffs: BuffEntry[] = []
  for (const n of allNodes) {
    if (!RULES_LAYERS.has(n.layer)) continue
    if (!RULES_CATEGORIES.has(n.category)) continue
    const buff = classifyBuff(n.id, n.title, n.content, n.factionId ?? '')
    if (buff) {
      buff.unitName = n.datasheetId
        ? (dsNameMap.get(n.datasheetId) ?? '')
        : n.detachmentId
          ? (detNameMap.get(n.detachmentId) ?? '')
          : ''
      buff.detachmentId = n.detachmentId ?? ''
      buff.category = n.category
      buff.scope = detectScope(n.category, n.content)
      allBuffs.push(buff)
    }
  }

  const COMBOS: Array<{ rerollType: 'hit' | 'wound'; ability: string }> = [
    { rerollType: 'hit', ability: 'sustained hits' },
    { rerollType: 'hit', ability: 'lethal hits' },
    { rerollType: 'wound', ability: 'devastating wounds' },
  ]

  const seenCombos = new Set<string>()

  for (const combo of COMBOS) {
    const rerollers = allBuffs.filter((b) => b.grantsRerolls === combo.rerollType)
    const abilityGranters = allBuffs.filter((b) => b.grantsAbility.includes(combo.ability))

    for (const rr of rerollers) {
      for (const ag of abilityGranters) {
        if (rr.nodeId === ag.nodeId) continue

        // ── Army construction constraints ──

        // Must be same faction or one is generic core (no faction at all)
        if (rr.factionId && ag.factionId && rr.factionId !== ag.factionId) continue

        // If one has a faction and the other doesn't, only allow if the
        // factionless one is truly generic (no detachment lock)
        if (rr.factionId !== ag.factionId) {
          const factionless = !rr.factionId ? rr : !ag.factionId ? ag : null
          if (factionless && factionless.detachmentId) continue
        }

        // Detachment lock: stratagems/enhancements from different detachments can't combine
        if (
          rr.detachmentId &&
          ag.detachmentId &&
          rr.detachmentId !== ag.detachmentId &&
          (rr.category === 'stratagem' || rr.category === 'enhancement') &&
          (ag.category === 'stratagem' || ag.category === 'enhancement')
        )
          continue

        // Bearer-only scope
        const bearerLimited = rr.scope === 'bearer' || ag.scope === 'bearer'

        // Two leader abilities can't apply to the same unit
        const bothLeaders =
          rr.scope === 'unit' &&
          ag.scope === 'unit' &&
          rr.category === 'unit-ability' &&
          ag.category === 'unit-ability' &&
          rr.nodeId.startsWith('ability:') &&
          ag.nodeId.startsWith('ability:')
        if (bothLeaders) continue

        // Must share a weapon type or one targets 'all'
        const sharedTypes = rr.weaponTypes.filter(
          (t) => t === 'all' || ag.weaponTypes.includes(t) || ag.weaponTypes.includes('all'),
        )
        if (sharedTypes.length === 0) continue

        // Deduplicate
        const comboKey = [rr.nodeId, ag.nodeId].sort().join('|')
        if (seenCombos.has(comboKey)) continue
        seenCombos.add(comboKey)

        const weaponTypeStr = sharedTypes.includes('all')
          ? 'weapons'
          : sharedTypes.join('/') + ' weapons'
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

  return refs
}

/**
 * Build faction root nodes — one per playable army.
 *
 * Flat model: SM chapters (Blood Angels, Dark Angels, etc.) are their own
 * top-level factions in `dim_faction` and land here as ordinary factionIds
 * post-PR-B. Chapter access to the SM shared pool is expressed via
 * `dim_subfaction` at retrieval time, not via a scalar tag on nodes.
 */
export function buildFactionNodes(allNodes: Node[]): { nodes: Node[]; refs: NodeRef[] } {
  const nodes: Node[] = []
  const refs: NodeRef[] = []

  // Collect all playable armies: unique factionIds
  const factionIds = new Set<string>()
  const factionNames = new Map<string, string>()

  for (const n of allNodes) {
    if (!n.factionId) continue
    factionIds.add(n.factionId)
    if (n.factionName) factionNames.set(n.factionId, n.factionName)
  }

  // Build faction nodes for each factionId
  for (const fid of factionIds) {
    const displayName = factionNames.get(fid) || fid.replace(/-/g, ' ').toUpperCase()

    const detachments = allNodes.filter(
      (n) => n.category === 'detachment-rule' && n.factionId === fid,
    )
    const armyRules = allNodes.filter(
      (n) => n.category === 'army-rule' && !n.detachmentId && n.factionId === fid,
    )
    const unitCount = allNodes.filter(
      (n) => n.category === 'datasheet' && n.factionId === fid,
    ).length

    nodes.push({
      id: `faction-root:${fid}`,
      layer: 'faction',
      category: 'faction',
      title: displayName,
      content: `${displayName} faction. ${detachments.length} detachments, ${armyRules.length} army rules, ${unitCount} datasheets.`,
      summary: `${displayName} — ${detachments.length} detachments, ${unitCount} units`,
      factionId: fid,
      factionName: displayName,
      sources: [
        {
          type: 'manual' as const,
          title: 'Auto-generated faction node',
          retrievedAt: new Date().toISOString(),
        },
      ],
      refs: [],
      version: 1,
      keywords: [fid, displayName.toLowerCase(), 'faction'],
    })

    for (const rule of armyRules) {
      refs.push({
        sourceId: rule.id,
        targetId: `faction-root:${fid}`,
        rel: 'part_of',
        context: `${rule.title} is an army rule for ${displayName}.`,
      })
    }
    // Connect detachment CONTAINERS to faction (not detachment-rules)
    for (const det of detachments) {
      refs.push({
        sourceId: `detachment:${det.id}`,
        targetId: `faction-root:${fid}`,
        rel: 'part_of',
        context: `${det.title} is a detachment in ${displayName}.`,
      })
    }
  }

  return { nodes, refs }
}

/**
 * Reclassify nodes: faction-ability without detachmentId → army-rule category.
 * Mutates nodes in place.
 */
export function reclassifyArmyRules(allNodes: Node[]): number {
  let count = 0
  for (const n of allNodes) {
    if (n.category === 'faction-ability' && !n.detachmentId) {
      ;(n as any).category = 'army-rule'
      count++
    }
  }
  return count
}

/**
 * Build detachment container nodes from existing detachment-rule nodes.
 * Each detachment-rule becomes the "rule" inside a new container node.
 * Stratagems/enhancements with matching detachmentId connect to the container.
 */
export function buildDetachmentNodes(allNodes: Node[]): { nodes: Node[]; refs: NodeRef[] } {
  const nodes: Node[] = []
  const refs: NodeRef[] = []

  const detRules = allNodes.filter((n) => n.category === 'detachment-rule')

  // Skip rules that already have a canonical `category: 'detachment'` container
  // for the same (factionId, normalized-title). Without this guard, every 10e
  // Wahapedia detachment-rule with an 11e MFM/pack counterpart gets a legacy
  // `detachment:${rule.id}` container emitted here, then step 8b in build-graph
  // flips its edition to 11th, producing parallel dupes of the real 11e node.
  // See the worker.ts `detachments-11e` browse filter for the historical
  // workaround that only masked the symptom.
  const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const canonicalKeys = new Set<string>()
  for (const n of allNodes) {
    if (n.category !== 'detachment') continue
    canonicalKeys.add(`${n.factionId ?? ''}::${normTitle(n.title)}`)
  }

  for (const rule of detRules) {
    if (canonicalKeys.has(`${rule.factionId ?? ''}::${normTitle(rule.title)}`)) continue
    const containerId = `detachment:${rule.id}`

    // Count what's inside this detachment
    const strats = allNodes.filter((n) => n.detachmentId === rule.id && n.category === 'stratagem')
    const enhancements = allNodes.filter(
      (n) => n.detachmentId === rule.id && n.category === 'enhancement',
    )
    const factionAbilities = allNodes.filter(
      (n) => n.detachmentId === rule.id && n.category === 'faction-ability',
    )
    const targetKw = (rule as any).targetKeywords as string[] | undefined
    const kwNote = targetKw?.length ? ` Primarily benefits: ${targetKw.join(', ')}.` : ''
    const containerContent = `**${rule.title}** detachment. ${strats.length} stratagem${strats.length !== 1 ? 's' : ''}, ${enhancements.length} enhancement${enhancements.length !== 1 ? 's' : ''}${factionAbilities.length > 0 ? `, ${factionAbilities.length} detachment abilit${factionAbilities.length !== 1 ? 'ies' : 'y'}` : ''}.${kwNote}\n\n**Detachment Rule:** ${rule.title}\n${rule.summary}`
    const containerSummary = `${rule.title} — ${strats.length} stratagems, ${enhancements.length} enhancements.${kwNote}`

    nodes.push({
      id: containerId,
      layer: 'faction',
      category: 'detachment',
      title: rule.title,
      content: containerContent,
      summary: containerSummary,
      factionId: rule.factionId,
      factionName: rule.factionName,
      edition: rule.edition,
      sources: rule.sources,
      refs: [],
      version: 1,
      keywords: [...rule.keywords, 'detachment'],
    })

    // The rule is part of this detachment
    refs.push({
      sourceId: rule.id,
      targetId: containerId,
      rel: 'part_of',
      context: `${rule.title} is the detachment rule for this detachment.`,
    })

    // Find stratagems/enhancements that belong to this detachment
    for (const n of allNodes) {
      if (
        n.detachmentId === rule.id &&
        (n.category === 'stratagem' ||
          n.category === 'enhancement' ||
          n.category === 'faction-ability')
      ) {
        refs.push({
          sourceId: n.id,
          targetId: containerId,
          rel: 'part_of',
          context: `${n.title} belongs to the ${rule.title} detachment.`,
        })
      }
    }
  }

  return { nodes, refs }
}

/**
 * Build eligible_for refs connecting datasheets to detachments they can be used in.
 *
 * A unit is eligible for a detachment if it shares a factionId with the
 * detachment. Chapter access to the SM shared pool is handled at retrieval
 * time via the `dim_subfaction` expansion (see `factions.ts`), not by a
 * scalar tag matched here.
 *
 * This gives every unit direct connections to the detachments it can legally join.
 */
export function buildEligibleForRefs(allNodes: Node[]): NodeRef[] {
  const refs: NodeRef[] = []

  const datasheets = allNodes.filter((n) => n.category === 'datasheet')
  const detachments = allNodes.filter((n) => n.category === 'detachment')

  // Build keyword lookup: detachment container ID → target keywords from its rule
  const detKeywords = new Map<string, string[]>()
  const detRules = allNodes.filter((n) => n.category === 'detachment-rule')
  for (const rule of detRules) {
    const containerId = `detachment:${rule.id}`
    if ((rule as any).targetKeywords?.length > 0) {
      detKeywords.set(containerId, (rule as any).targetKeywords)
    }
  }

  for (const unit of datasheets) {
    if (!unit.factionId) continue

    for (const det of detachments) {
      if (!det.factionId) continue
      if (det.factionId !== unit.factionId) continue

      // Compute keyword affinity: how many of the detachment's target keywords
      // match the unit's keywords?
      const targetKw = detKeywords.get(det.id) || []
      const unitKwLower = new Set(unit.keywords.map((k) => k.toLowerCase()))
      let matchCount = 0
      const matchedKeywords: string[] = []
      for (const kw of targetKw) {
        if (unitKwLower.has(kw.toLowerCase())) {
          matchCount++
          matchedKeywords.push(kw)
        }
      }

      const affinity = targetKw.length === 0 ? 'generic' : matchCount > 0 ? 'high' : 'low'
      const affinityNote =
        matchedKeywords.length > 0
          ? ` (${matchedKeywords.join(', ')} keyword match)`
          : targetKw.length > 0
            ? ` (no keyword match — generic benefit only)`
            : ''

      refs.push({
        sourceId: unit.id,
        targetId: det.id,
        rel: 'eligible_for',
        context: `${unit.title} can be fielded in the ${det.title} detachment [${affinity}]${affinityNote}.`,
      })
    }
  }

  return refs
}
