import type { UnitProfile, WeaponAbility, WeaponProfile } from '@tabletop-tools/game-content'
import type { DatasheetModel } from '@tabletop-tools/game-data-store'
import { useGameDataAvailable, useUnitCompositions } from '@tabletop-tools/game-data-store'
import { CollapsibleSection, HelpTip, htmlToText } from '@tabletop-tools/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { authClient } from '../lib/auth'
import { extractLeaderRules } from '../lib/leaderAbilities'
import { parseModelCount, parseModelOptions } from '../lib/modelCount'
import type { DistributionData, SimResult } from '../lib/rules/pipeline'
import { runMonteCarlo, simulateWeapon } from '../lib/rules/pipeline'
import { trpc } from '../lib/trpc'
import {
  useGameDatasheetModels,
  useGameDatasheetWeapons,
  useGameDetachmentAbilities,
  useGameDetachments,
  useGameEnhancements,
  useGameFactions,
  useGameLeadersForUnit,
  useGameStratagems,
  useGameUnit,
  useGameUnitAbilities,
  useGameUnitCosts,
  useGameUnitKeywords,
  useGameWargearOptions,
  useUnits,
} from '../lib/useGameData'
import { useSimulateV2, weaponAbilityToModifier } from '../lib/useSimulateV2'
import type { WeaponBreakdown } from './SimulationResult'
import { SimulationResult } from './SimulationResult'
import { SpecialRulesEditor } from './SpecialRulesEditor'
import { UnitProfileCard } from './UnitProfileCard'
import { UnitSelector } from './UnitSelector'
import { WeaponSelector } from './WeaponSelector'

type AttackType = 'ranged' | 'melee'

/**
 * Parses a Wahapedia stat string like "4+", "6\"", "5" to a number.
 * Returns 0 if the string can't be parsed.
 */
function parseModelStat(val: string): number {
  if (!val || val === '-' || val === '\u2013') return 0
  const n = parseInt(val.replace(/[+"'″"]/g, ''), 10)
  return isNaN(n) ? 0 : n
}

/**
 * Merges Wahapedia DatasheetModel stats into a BSData UnitProfile,
 * preferring Wahapedia values when they are non-zero (indicating valid data).
 * BSData stats may be 0 due to parse failures; Wahapedia stats are authoritative.
 */
function resolveUnitFromModel(unit: UnitProfile, model: DatasheetModel): UnitProfile {
  const wMove = parseModelStat(model.move)
  const wToughness = parseModelStat(model.toughness)
  const wSave = parseModelStat(model.save)
  const wWounds = parseModelStat(model.wounds)
  const wLd = parseModelStat(model.leadership)
  const wOc = parseModelStat(model.oc)
  const wInvSv =
    model.invSv && model.invSv !== '-' && model.invSv !== '\u2013'
      ? parseModelStat(model.invSv)
      : undefined

  return {
    ...unit,
    move: wMove || unit.move,
    toughness: wToughness || unit.toughness,
    save: wSave || unit.save,
    wounds: wWounds || unit.wounds,
    leadership: wLd || unit.leadership,
    oc: wOc || unit.oc,
    invulnSave: wInvSv ?? unit.invulnSave,
  }
}

function formatAbility(a: WeaponAbility): string {
  switch (a.type) {
    case 'SUSTAINED_HITS':
      return `Sustained Hits ${a.value}`
    case 'LETHAL_HITS':
      return 'Lethal Hits'
    case 'DEVASTATING_WOUNDS':
      return 'Devastating Wounds'
    case 'TORRENT':
      return 'Torrent'
    case 'TWIN_LINKED':
      return 'Twin-linked'
    case 'BLAST':
      return 'Blast'
    case 'REROLL_HITS_OF_1':
      return 'Re-roll hits of 1'
    case 'REROLL_HITS':
      return 'Re-roll all hits'
    case 'REROLL_WOUNDS':
      return 'Re-roll wounds'
    case 'HIT_MOD':
      return `${a.value > 0 ? '+' : ''}${a.value} to hit`
    case 'WOUND_MOD':
      return `${a.value > 0 ? '+' : ''}${a.value} to wound`
    case 'STRENGTH_MOD':
      return `Str ${a.value > 0 ? '+' : ''}${a.value}`
    case 'ATTACKS_MOD':
      return a.value === 0 ? 'Extra Attacks' : `Attacks ${a.value > 0 ? '+' : ''}${a.value}`
    case 'ANTI':
      return `Anti-${a.keyword} ${a.value}+`
    case 'MELTA':
      return `Melta ${a.value}`
    case 'IGNORES_COVER':
      return 'Ignores Cover'
    case 'PRECISION':
      return 'Precision'
    case 'TOUGHNESS_MOD':
      return `Toughness ${a.value > 0 ? '+' : ''}${a.value}`
    default:
      return a.type
  }
}

/** Simple FNV-1a hash for cache key. Not cryptographic. */
function simpleHash(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(16)
}

type Props = {
  onSignOut: () => void
}

export function SimulatorScreen({ onSignOut }: Props) {
  const [attackerFaction, setAttackerFaction] = useState<string | undefined>()
  const [defenderFaction, setDefenderFaction] = useState<string | undefined>()
  const [attackerQuery, setAttackerQuery] = useState('')
  const [defenderQuery, setDefenderQuery] = useState('')
  const [attackerId, setAttackerId] = useState<string | null>(null)
  const [defenderId, setDefenderId] = useState<string | null>(null)
  const [attackerLeaderId, setAttackerLeaderId] = useState<string | null>(null)
  const [attackerModelCount, setAttackerModelCount] = useState(-1)
  const [defenderModelCount, setDefenderModelCount] = useState(5)
  const [invulnSave, setInvulnSave] = useState<number | undefined>()
  const [fnp, setFnp] = useState<number | undefined>()
  const [attackType, setAttackType] = useState<AttackType>('ranged')
  const [weaponOverrides, setWeaponOverrides] = useState<Map<number, boolean>>(new Map())
  const [specialRules, setSpecialRules] = useState<WeaponAbility[]>([])
  const [defenderLeaderId, setDefenderLeaderId] = useState<string | null>(null)
  const [attackerDetachmentId, setAttackerDetachmentId] = useState<string | null>(null)
  const [attackerEnhancementId, setAttackerEnhancementId] = useState<string | null>(null)
  const [defenderDetachmentId, setDefenderDetachmentId] = useState<string | null>(null)
  const [showLegends, setShowLegends] = useState(false)

  const gameDataAvailable = useGameDataAvailable()
  const { data: factions = [] } = useGameFactions()

  const { data: attackerUnits = [], isLoading: loadingAttackers } = useUnits(
    {
      faction: attackerFaction,
      name: attackerQuery || undefined,
    },
    showLegends,
  )

  const { data: defenderUnits = [], isLoading: loadingDefenders } = useUnits(
    {
      faction: defenderFaction,
      name: defenderQuery || undefined,
    },
    showLegends,
  )

  const { data: attacker } = useGameUnit(attackerId)
  const { data: defender } = useGameUnit(defenderId)
  const { data: attackerLeader } = useGameUnit(attackerLeaderId)
  const { data: attackerComps = [] } = useUnitCompositions(attackerId ?? '')
  const { data: defenderComps = [] } = useUnitCompositions(defenderId ?? '')
  const { data: attackerCosts = [] } = useGameUnitCosts(attackerId)
  const { data: defenderCosts = [] } = useGameUnitCosts(defenderId)
  const { data: availableLeaders = [] } = useGameLeadersForUnit(attackerId)
  const { data: availableDefenderLeaders = [] } = useGameLeadersForUnit(defenderId)
  const { data: defenderLeader } = useGameUnit(defenderLeaderId)
  const { data: wahapediaDefenderLeaderModels = [] } = useGameDatasheetModels(defenderLeaderId)
  const { data: attackerAbilities = [] } = useGameUnitAbilities(attackerId)
  const { data: defenderAbilities = [] } = useGameUnitAbilities(defenderId)
  const { data: attackerWargear = [] } = useGameWargearOptions(attackerId)
  const { data: defenderWargear = [] } = useGameWargearOptions(defenderId)
  const { data: attackerKeywordRecords = [] } = useGameUnitKeywords(attackerId)
  const { data: defenderKeywordRecords = [] } = useGameUnitKeywords(defenderId)
  const { data: wahapediaAttackerWeapons = [] } = useGameDatasheetWeapons(attackerId)
  const { data: wahapediaLeaderWeapons = [] } = useGameDatasheetWeapons(attackerLeaderId)
  const { data: wahapediaAttackerModels = [] } = useGameDatasheetModels(attackerId)
  const { data: wahapediaDefenderModels = [] } = useGameDatasheetModels(defenderId)
  const { data: attackerDetachments = [] } = useGameDetachments(attackerFaction)
  const { data: atkDetachmentAbilities = [] } = useGameDetachmentAbilities(attackerDetachmentId)
  const { data: atkDetachmentEnhancements = [] } = useGameEnhancements(attackerDetachmentId)
  const { data: defenderDetachments = [] } = useGameDetachments(defenderFaction)
  const { data: defDetachmentAbilities = [] } = useGameDetachmentAbilities(defenderDetachmentId)
  const { data: attackerStratagems = [] } = useGameStratagems(attackerFaction, attackerDetachmentId)
  const { data: defenderStratagems = [] } = useGameStratagems(defenderFaction, defenderDetachmentId)
  const { data: leaderAbilities = [] } = useGameUnitAbilities(attackerLeaderId)

  // Auto-extract simulation rules from attached leader abilities
  const leaderRules = useMemo(() => {
    if (!attackerLeaderId || leaderAbilities.length === 0) return []
    return extractLeaderRules(leaderAbilities)
  }, [attackerLeaderId, leaderAbilities])

  // Resolve attacker/defender profiles: prefer Wahapedia model stats when available
  // (Wahapedia has correct M/T/Sv/W/Ld/OC/invSv as strings; BSData may have 0 for missing)
  const resolvedAttacker = useMemo(() => {
    if (!attacker) return null
    const model = wahapediaAttackerModels[0]
    if (!model) return attacker
    return resolveUnitFromModel(attacker, model)
  }, [attacker, wahapediaAttackerModels])

  const resolvedDefender = useMemo(() => {
    if (!defender) return null
    const model = wahapediaDefenderModels[0]
    if (!model) return defender
    return resolveUnitFromModel(defender, model)
  }, [defender, wahapediaDefenderModels])

  const resolvedDefenderLeader = useMemo(() => {
    if (!defenderLeader) return null
    const model = wahapediaDefenderLeaderModels[0]
    if (!model) return defenderLeader
    return resolveUnitFromModel(defenderLeader, model)
  }, [defenderLeader, wahapediaDefenderLeaderModels])

  // Parse model count options from unit costs (gives selectable options with points)
  const attackerModelOptions = useMemo(
    () => parseModelOptions(attackerComps, attackerCosts),
    [attackerComps, attackerCosts],
  )
  const defenderModelOptions = useMemo(
    () => parseModelOptions(defenderComps, defenderCosts),
    [defenderComps, defenderCosts],
  )

  // Auto-populate model counts: prefer cost-based options, fall back to composition parsing
  const defaultAttackerModels = useMemo(() => {
    if (attackerModelOptions.length > 0) return attackerModelOptions[0]!.modelCount
    if (attackerComps.length === 0) return null
    return parseModelCount(attackerComps)
  }, [attackerModelOptions, attackerComps])

  const defaultDefenderModels = useMemo(() => {
    if (defenderModelOptions.length > 0) return defenderModelOptions[0]!.modelCount
    if (defenderComps.length === 0) return null
    return parseModelCount(defenderComps)
  }, [defenderModelOptions, defenderComps])

  // When attacker changes, clear overrides and leader so defaults kick in from data
  const handleAttackerSelect = useCallback((id: string) => {
    setAttackerId(id)
    setAttackerLeaderId(null)
    setAttackerModelCount(-1) // sentinel: use composition data if available
    setWeaponOverrides(new Map())
    setSpecialRules([])
  }, [])

  const handleDefenderSelect = useCallback((id: string) => {
    setDefenderId(id)
    setDefenderLeaderId(null)
    setDefenderModelCount(-1) // sentinel: use composition data if available
    setInvulnSave(undefined)
    setFnp(undefined)
  }, [])

  // Resolve effective model counts: user override > composition data > default
  const effectiveAttackerModels =
    attackerModelCount === -1 ? (defaultAttackerModels ?? 1) : attackerModelCount

  const effectiveDefenderModels =
    defenderModelCount === -1 ? (defaultDefenderModels ?? 5) : defenderModelCount

  // Combine attacker weapons with leader weapons.
  // Prefers Wahapedia weapon profiles when available (cleaner, normalized data).
  // Tracks which indices are leader weapons (fired by 1 model, not the full unit).
  const { combinedWeapons, leaderWeaponIndices } = useMemo(() => {
    if (!resolvedAttacker)
      return { combinedWeapons: [] as WeaponProfile[], leaderWeaponIndices: new Set<number>() }
    // Use Wahapedia weapons if available, fall back to BSData-parsed weapons
    const baseWeapons =
      wahapediaAttackerWeapons.length > 0 ? wahapediaAttackerWeapons : resolvedAttacker.weapons
    const weapons = [...baseWeapons]
    const leaderIndices = new Set<number>()
    // Merge leader weapons
    const leaderWeapons =
      wahapediaLeaderWeapons.length > 0 ? wahapediaLeaderWeapons : (attackerLeader?.weapons ?? [])
    for (const w of leaderWeapons) {
      if (!weapons.some((ew) => ew.name === w.name)) {
        leaderIndices.add(weapons.length)
        weapons.push(w)
      }
    }
    return { combinedWeapons: weapons, leaderWeaponIndices: leaderIndices }
  }, [resolvedAttacker, attackerLeader, wahapediaAttackerWeapons, wahapediaLeaderWeapons])

  // Derive selected weapons from loaded data — no useEffect.
  // When attacker data loads from IndexedDB, weapons auto-select by attack type.
  // User can override individual toggles; overrides clear on unit change.
  // Melee constraint: only one melee profile unless weapon has "extra attacks" ability.
  const selectedWeapons = useMemo(() => {
    if (combinedWeapons.length === 0) return new Set<number>()
    const indices = new Set<number>()
    let meleeSelected = false
    combinedWeapons.forEach((w, i) => {
      const isRanged = w.range !== 'melee'
      const isExtraAttacks =
        !isRanged && w.abilities.some((a) => a.type === 'ATTACKS_MOD' && a.value === 0)
      let defaultSelected: boolean
      if (attackType === 'ranged') {
        defaultSelected = isRanged
      } else {
        // Melee mode: extra attacks weapons always selected, others limited to one
        if (isExtraAttacks) {
          defaultSelected = true
        } else if (!isRanged) {
          defaultSelected = !meleeSelected
          if (defaultSelected) meleeSelected = true
        } else {
          defaultSelected = false
        }
      }
      const override = weaponOverrides.get(i)
      if (override !== undefined ? override : defaultSelected) {
        indices.add(i)
      }
    })
    return indices
  }, [combinedWeapons, attackType, weaponOverrides])

  // Collect ability labels from selected weapons for display
  const selectedWeaponAbilities = useMemo(() => {
    if (combinedWeapons.length === 0) return []
    const labels: string[] = []
    for (const i of selectedWeapons) {
      const w = combinedWeapons[i]
      if (w) {
        for (const a of w.abilities) {
          labels.push(formatAbility(a))
        }
      }
    }
    return labels
  }, [combinedWeapons, selectedWeapons])

  const handleToggleWeapon = useCallback(
    (index: number) => {
      setWeaponOverrides((prev) => {
        const next = new Map(prev)
        // If already overridden, flip the override; otherwise set to opposite of current selection
        const isCurrentlySelected = selectedWeapons.has(index)
        next.set(index, !isCurrentlySelected)
        return next
      })
    },
    [selectedWeapons],
  )

  // Get selected weapon profiles with merged special rules (user-added + leader auto-applied)
  const leaderWeaponAbilities = useMemo(() => leaderRules.map((lr) => lr.rule), [leaderRules])
  const getSelectedWeapons = useCallback((): WeaponProfile[] => {
    if (combinedWeapons.length === 0) return []
    return Array.from(selectedWeapons)
      .sort((a, b) => a - b)
      .map((i) => combinedWeapons[i])
      .filter(Boolean)
      .map((w) => ({
        ...w,
        abilities: [...w.abilities, ...specialRules, ...leaderWeaponAbilities],
      }))
  }, [combinedWeapons, selectedWeapons, specialRules, leaderWeaponAbilities])

  // Get selected weapon indices to check if each is a leader weapon
  const getSelectedWeaponIndices = useCallback((): number[] => {
    return Array.from(selectedWeapons).sort((a, b) => a - b)
  }, [selectedWeapons])

  // Compute simulation locally
  const simData = useMemo((): { result: SimResult; breakdowns: WeaponBreakdown[] } | null => {
    if (!resolvedAttacker || !resolvedDefender) return null

    const weapons = getSelectedWeapons()
    const weaponIndices = getSelectedWeaponIndices()
    if (weapons.length === 0) {
      return {
        result: {
          expectedWounds: 0,
          expectedModelsRemoved: 0,
          survivors: effectiveDefenderModels,
          worstCase: { wounds: 0, modelsRemoved: 0 },
          bestCase: { wounds: 0, modelsRemoved: 0 },
        },
        breakdowns: [],
      }
    }

    let totalExpectedWounds = 0
    let totalExpectedModelsRemoved = 0
    let bestCaseWounds = 0
    let worstCaseWounds = 0
    const breakdowns: WeaponBreakdown[] = []

    // Use data-driven invuln/fnp from resolved profile, allow override
    const effectiveInvuln = invulnSave ?? resolvedDefender.invulnSave
    const effectiveFnp = fnp ?? resolvedDefender.fnp

    for (let wi = 0; wi < weapons.length; wi++) {
      const weapon = weapons[wi]!
      const defKeywords = defenderKeywordRecords.map((k) => k.keyword)
      // Leader weapons fire once (1 model), unit weapons fire × model count
      const weaponModelCount = leaderWeaponIndices.has(weaponIndices[wi]!)
        ? 1
        : effectiveAttackerModels
      const r = simulateWeapon(
        weapon,
        resolvedDefender.toughness,
        resolvedDefender.save,
        resolvedDefender.wounds,
        effectiveDefenderModels,
        effectiveInvuln,
        effectiveFnp,
        defKeywords,
        weaponModelCount,
      )
      totalExpectedWounds += r.expectedWounds
      totalExpectedModelsRemoved += r.expectedModelsRemoved
      bestCaseWounds += r.bestCase.wounds
      worstCaseWounds += r.worstCase.wounds

      breakdowns.push({
        weaponName: weapon.name,
        expectedWounds: r.expectedWounds,
        expectedModelsRemoved: r.expectedModelsRemoved,
        abilities: weapon.abilities.map(formatAbility),
      })
    }

    totalExpectedModelsRemoved = Math.min(effectiveDefenderModels, totalExpectedModelsRemoved)
    const survivors = Math.max(0, effectiveDefenderModels - totalExpectedModelsRemoved)

    bestCaseWounds = Math.min(bestCaseWounds, effectiveDefenderModels * resolvedDefender.wounds)
    worstCaseWounds = Math.min(worstCaseWounds, effectiveDefenderModels * resolvedDefender.wounds)

    return {
      result: {
        expectedWounds: parseFloat(totalExpectedWounds.toFixed(4)),
        expectedModelsRemoved: parseFloat(totalExpectedModelsRemoved.toFixed(4)),
        survivors: parseFloat(survivors.toFixed(4)),
        worstCase: {
          wounds: worstCaseWounds,
          modelsRemoved: Math.floor(worstCaseWounds / resolvedDefender.wounds),
        },
        bestCase: {
          wounds: bestCaseWounds,
          modelsRemoved: Math.floor(bestCaseWounds / resolvedDefender.wounds),
        },
      },
      breakdowns,
    }
  }, [
    resolvedAttacker,
    resolvedDefender,
    effectiveAttackerModels,
    effectiveDefenderModels,
    invulnSave,
    fnp,
    getSelectedWeapons,
    getSelectedWeaponIndices,
    leaderWeaponIndices,
    defenderKeywordRecords,
  ])

  // Monte Carlo distribution (runs alongside deterministic sim)
  const [distribution, setDistribution] = useState<DistributionData | null>(null)

  const handleRunClick = useCallback(() => {
    // Run Monte Carlo in the background when user clicks Run
    if (!resolvedAttacker || !resolvedDefender) return
    const weapons = getSelectedWeapons()
    const weaponIndices = getSelectedWeaponIndices()
    if (weapons.length === 0) {
      setDistribution(null)
      return
    }

    const effectiveInvuln = invulnSave ?? resolvedDefender.invulnSave
    const effectiveFnp = fnp ?? resolvedDefender.fnp
    const defKeywords = defenderKeywordRecords.map((k) => k.keyword)
    // Per-weapon model counts: leader weapons fire once, unit weapons fire × model count
    const perWeaponModelCounts = weaponIndices.map((idx) =>
      leaderWeaponIndices.has(idx) ? 1 : effectiveAttackerModels,
    )

    // Build character profile when defender has an attached leader
    const charProfile = resolvedDefenderLeader
      ? {
          wounds: resolvedDefenderLeader.wounds,
          save: resolvedDefenderLeader.save,
          invulnSave: resolvedDefenderLeader.invulnSave,
          fnp: resolvedDefenderLeader.fnp,
        }
      : undefined

    const dist = runMonteCarlo(
      weapons,
      resolvedDefender.toughness,
      resolvedDefender.save,
      resolvedDefender.wounds,
      effectiveDefenderModels,
      effectiveInvuln,
      effectiveFnp,
      defKeywords,
      5000,
      effectiveAttackerModels,
      perWeaponModelCounts,
      charProfile,
    )
    setDistribution(dist)

    if (resultsRef.current && typeof resultsRef.current.scrollIntoView === 'function') {
      resultsRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [
    resolvedAttacker,
    resolvedDefender,
    resolvedDefenderLeader,
    effectiveAttackerModels,
    effectiveDefenderModels,
    invulnSave,
    fnp,
    getSelectedWeapons,
    getSelectedWeaponIndices,
    leaderWeaponIndices,
    defenderKeywordRecords,
  ])

  const resultsRef = useRef<HTMLDivElement>(null)

  // currentConfigHash / simpleHash: kept as the reusable half of a deferred
  // closed-form-caching fallback even though their only consumer (the v1
  // `simulate.lookup` cache-check) was removed with the v1 router — see
  // W2 versus verdict Phase C §2c (wargame/w2/95-consolidation-roadmap.md).
  const currentConfigHash = useMemo(() => {
    if (!simData || simData.breakdowns.length === 0) return null
    const weaponConfig = {
      attackType,
      effectiveAttackerModels,
      effectiveDefenderModels,
      invulnSave: invulnSave ?? resolvedDefender?.invulnSave,
      fnp: fnp ?? resolvedDefender?.fnp,
      specialRules,
      selectedWeapons: getSelectedWeapons().map((w) => w.name),
      leaderContentId: attackerLeaderId ?? undefined,
    }
    return simpleHash(JSON.stringify(weaponConfig))
  }, [
    simData,
    attackType,
    effectiveAttackerModels,
    effectiveDefenderModels,
    invulnSave,
    fnp,
    specialRules,
    getSelectedWeapons,
    attackerLeaderId,
    resolvedDefender,
  ])
  // No current consumer — see comment above. Referenced here only to satisfy
  // no-unused-vars until the closed-form-caching fallback lands.
  void currentConfigHash

  const { save: saveV2 } = useSimulateV2()

  const attackerName =
    attackerUnits.find((u) => u.id === attackerId)?.name ?? attacker?.name ?? attackerId ?? ''
  const defenderName =
    defenderUnits.find((u) => u.id === defenderId)?.name ?? defender?.name ?? defenderId ?? ''

  async function handleSignOut() {
    await authClient.signOut()
    onSignOut()
  }

  function handleSave() {
    if (!simData?.result || !attackerId || !defenderId) return
    const weapons = getSelectedWeapons()
    const weaponIndices = getSelectedWeaponIndices()

    // Build per-weapon rows with attack-count factors
    const weaponInputs = weapons.map((w, i) => {
      const isLeaderWeapon = leaderWeaponIndices.has(weaponIndices[i]!)
      const modelCount = isLeaderWeapon ? 1 : effectiveAttackerModels
      const attacksNotation = String(w.attacks)
      const breakdown = simData.breakdowns[i]!
      return {
        profileKind: attackType === 'ranged' ? ('ranged' as const) : ('melee' as const),
        profileId: null,
        weaponName: w.name,
        modelCount,
        weaponsPerModel: 1,
        attacksNotation,
        expectedWounds: breakdown.expectedWounds,
        expectedModelsRemoved: breakdown.expectedModelsRemoved,
      }
    })

    // Collect modifiers from all active weapon abilities
    const allModifiers = weapons.flatMap((w) =>
      w.abilities.map((a) => weaponAbilityToModifier(a, 'weapon_ability')),
    )
    // Deduplicate by key (same key may appear on multiple weapons — store once per run)
    const seen = new Set<string>()
    const dedupedModifiers = allModifiers.filter((m) => {
      const k = `${m.side}:${m.key}:${m.value ?? ''}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    saveV2({
      attackerName,
      defenderName,
      expectedWounds: simData.result.expectedWounds,
      expectedModelsRemoved: simData.result.expectedModelsRemoved,
      survivors: simData.result.survivors,
      worstWounds: simData.result.worstCase.wounds,
      worstModels: simData.result.worstCase.modelsRemoved,
      bestWounds: simData.result.bestCase.wounds,
      bestModels: simData.result.bestCase.modelsRemoved,
      weapons: weaponInputs,
      modifiers: dedupedModifiers,
    })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            title="Back to Home"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path
                fillRule="evenodd"
                d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z"
                clipRule="evenodd"
              />
            </svg>
            Home
          </a>
          <h1 className="text-lg font-bold text-amber-400">Versus</h1>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Sign out
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <p className="text-xs text-slate-500 mb-4">
          Select factions, pick attacker and defender units, then configure weapons and abilities to
          simulate combat. Click "Run Simulation" to see expected wounds and models removed.
        </p>

        {/* No data warning */}
        {!gameDataAvailable && (
          <div className="bg-slate-900 border border-amber-400/30 rounded-lg p-4 text-center">
            <p className="text-slate-200 font-semibold">No game data imported</p>
            <p className="text-slate-400 text-sm mt-1">
              Import unit profiles from the{' '}
              <a href="/data-import/" className="text-amber-400 hover:underline">
                Data Import
              </a>{' '}
              app (Unit Profiles tab) to use the combat simulator.
            </p>
          </div>
        )}

        {/* Legends toggle */}
        <div className="flex justify-end">
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showLegends}
              onChange={(e) => setShowLegends(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-400 focus:ring-amber-400"
            />
            Include Legends units
          </label>
        </div>

        {/* Unit selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <UnitSelector
              label="Attacker"
              factions={factions}
              units={attackerUnits}
              selectedUnitId={attackerId}
              isLoadingUnits={loadingAttackers}
              hasFaction={!!attackerFaction}
              onFactionChange={setAttackerFaction}
              onQueryChange={setAttackerQuery}
              onSelect={handleAttackerSelect}
            />
            {resolvedAttacker && (
              <>
                <UnitProfileCard
                  unit={resolvedAttacker}
                  additionalModels={wahapediaAttackerModels}
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">
                      Models
                      {attackerModelCount === -1 && defaultAttackerModels ? ' (from data)' : ''}
                      <HelpTip text="Number of models in the attacking unit. Each model fires the selected weapons." />
                    </label>
                    {attackerModelOptions.length > 0 ? (
                      <select
                        value={effectiveAttackerModels}
                        onChange={(e) => setAttackerModelCount(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                      >
                        {attackerModelOptions.map((opt) => (
                          <option key={opt.modelCount} value={opt.modelCount}>
                            {opt.modelCount} models — {opt.points}pts
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={effectiveAttackerModels}
                        onChange={(e) =>
                          setAttackerModelCount(Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                      />
                    )}
                  </div>
                </div>
              </>
            )}
            {attackerAbilities.length > 0 && (
              <CollapsibleSection title="Unit Abilities" count={attackerAbilities.length}>
                <div className="space-y-1.5">
                  {attackerAbilities.map((a, i) => (
                    <div key={i}>
                      <p className="text-xs font-medium text-amber-400">{a.name}</p>
                      <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                        {htmlToText(a.description)}
                      </p>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}
            {attackerKeywordRecords.length > 0 && (
              <CollapsibleSection title="Keywords" count={attackerKeywordRecords.length}>
                <div className="flex flex-wrap gap-1">
                  {attackerKeywordRecords.map((k, i) => (
                    <span
                      key={i}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${k.isFactionKeyword ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}
                    >
                      {k.keyword}
                    </span>
                  ))}
                </div>
              </CollapsibleSection>
            )}
            {attackerWargear.length > 0 && (
              <CollapsibleSection title="Wargear Options" count={attackerWargear.length}>
                {attackerWargear.map((w, i) => (
                  <p key={i} className="text-xs text-slate-500 whitespace-pre-wrap">
                    {htmlToText(w.description)}
                  </p>
                ))}
              </CollapsibleSection>
            )}
          </div>

          <div className="space-y-4">
            <UnitSelector
              label="Defender"
              factions={factions}
              units={defenderUnits}
              selectedUnitId={defenderId}
              isLoadingUnits={loadingDefenders}
              hasFaction={!!defenderFaction}
              onFactionChange={setDefenderFaction}
              onQueryChange={setDefenderQuery}
              onSelect={handleDefenderSelect}
            />
            {resolvedDefender && (
              <>
                <UnitProfileCard
                  unit={resolvedDefender}
                  invulnSave={invulnSave}
                  fnp={fnp}
                  additionalModels={wahapediaDefenderModels}
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">
                      Models
                      {defenderModelCount === -1 && defaultDefenderModels ? ' (from data)' : ''}
                      <HelpTip text="Number of models in the defending unit." />
                    </label>
                    {defenderModelOptions.length > 0 ? (
                      <select
                        value={effectiveDefenderModels}
                        onChange={(e) => setDefenderModelCount(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                      >
                        {defenderModelOptions.map((opt) => (
                          <option key={opt.modelCount} value={opt.modelCount}>
                            {opt.modelCount} models — {opt.points}pts
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={effectiveDefenderModels}
                        onChange={(e) =>
                          setDefenderModelCount(Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">
                      Invuln
                      <HelpTip text="Invulnerable save. Ignores AP. Overrides unit data if set." />
                    </label>
                    <select
                      value={invulnSave ?? resolvedDefender.invulnSave ?? ''}
                      onChange={(e) =>
                        setInvulnSave(e.target.value ? parseInt(e.target.value) : undefined)
                      }
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                    >
                      <option value="">None</option>
                      <option value="2">2+</option>
                      <option value="3">3+</option>
                      <option value="4">4+</option>
                      <option value="5">5+</option>
                      <option value="6">6+</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">
                      FNP
                      <HelpTip text="Feel No Pain. Each point of damage is ignored on this roll. Applied after saves." />
                    </label>
                    <select
                      value={fnp ?? resolvedDefender.fnp ?? ''}
                      onChange={(e) =>
                        setFnp(e.target.value ? parseInt(e.target.value) : undefined)
                      }
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                    >
                      <option value="">None</option>
                      <option value="2">2+</option>
                      <option value="3">3+</option>
                      <option value="4">4+</option>
                      <option value="5">5+</option>
                      <option value="6">6+</option>
                    </select>
                  </div>
                </div>
                {defenderAbilities.length > 0 && (
                  <CollapsibleSection title="Unit Abilities" count={defenderAbilities.length}>
                    <div className="space-y-1.5">
                      {defenderAbilities.map((a, i) => (
                        <div key={i}>
                          <p className="text-xs font-medium text-amber-400">{a.name}</p>
                          <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                            {htmlToText(a.description)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}
                {defenderKeywordRecords.length > 0 && (
                  <CollapsibleSection title="Keywords" count={defenderKeywordRecords.length}>
                    <div className="flex flex-wrap gap-1">
                      {defenderKeywordRecords.map((k, i) => (
                        <span
                          key={i}
                          className={`px-1.5 py-0.5 rounded text-[10px] ${k.isFactionKeyword ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}
                        >
                          {k.keyword}
                        </span>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}
                {defenderWargear.length > 0 && (
                  <CollapsibleSection title="Wargear Options" count={defenderWargear.length}>
                    {defenderWargear.map((w, i) => (
                      <p key={i} className="text-xs text-slate-500 whitespace-pre-wrap">
                        {htmlToText(w.description)}
                      </p>
                    ))}
                  </CollapsibleSection>
                )}
              </>
            )}
          </div>
        </div>

        {/* Leader attachment (if available) */}
        {resolvedAttacker && availableLeaders.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <label className="block text-xs text-slate-400 mb-2">
              Attach Leader
              <HelpTip text="Add a leader to the attacker. Leaders provide additional weapons and abilities." />
            </label>
            <select
              value={attackerLeaderId ?? ''}
              onChange={(e) => {
                setAttackerLeaderId(e.target.value || null)
                setWeaponOverrides(new Map())
              }}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
            >
              <option value="">No leader</option>
              {availableLeaders.map((la) => (
                <LeaderSelectOption key={la.leaderId} leaderId={la.leaderId} />
              ))}
            </select>
            {attackerLeader && <UnitProfileCard unit={attackerLeader} />}
          </div>
        )}

        {/* Defender leader attachment (for Precision targeting) */}
        {resolvedDefender && availableDefenderLeaders.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <label className="block text-xs text-slate-400 mb-2">
              Defender Leader
              <HelpTip text="Attach a leader to the defender. Precision weapons will target the character, while other attacks hit bodyguards first (Look Out, Sir)." />
            </label>
            <select
              value={defenderLeaderId ?? ''}
              onChange={(e) => setDefenderLeaderId(e.target.value || null)}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
            >
              <option value="">No leader</option>
              {availableDefenderLeaders.map((la) => (
                <LeaderSelectOption key={la.leaderId} leaderId={la.leaderId} />
              ))}
            </select>
            {resolvedDefenderLeader && <UnitProfileCard unit={resolvedDefenderLeader} />}
          </div>
        )}

        {/* Detachments */}
        {(attackerDetachments.length > 0 || defenderDetachments.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Attacker Detachment */}
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Attacker Detachment
              </p>
              {attackerDetachments.length > 0 ? (
                <>
                  <select
                    value={attackerDetachmentId ?? ''}
                    onChange={(e) => {
                      setAttackerDetachmentId(e.target.value || null)
                      setAttackerEnhancementId(null)
                    }}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                  >
                    <option value="">No detachment</option>
                    {attackerDetachments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  {atkDetachmentAbilities.length > 0 && (
                    <CollapsibleSection
                      title="Detachment Abilities"
                      count={atkDetachmentAbilities.length}
                    >
                      <div className="text-xs space-y-1.5">
                        {atkDetachmentAbilities.map((a) => (
                          <div key={a.id}>
                            <p className="font-medium text-amber-400">{a.name}</p>
                            <p className="text-slate-400 leading-relaxed whitespace-pre-wrap">
                              {htmlToText(a.description)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}
                  {atkDetachmentEnhancements.length > 0 && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Enhancement</label>
                      <select
                        value={attackerEnhancementId ?? ''}
                        onChange={(e) => setAttackerEnhancementId(e.target.value || null)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                      >
                        <option value="">No enhancement</option>
                        {atkDetachmentEnhancements.map((enh) => (
                          <option key={enh.id} value={enh.id}>
                            {enh.name} ({enh.cost}pts)
                          </option>
                        ))}
                      </select>
                      {attackerEnhancementId &&
                        (() => {
                          const enh = atkDetachmentEnhancements.find(
                            (e) => e.id === attackerEnhancementId,
                          )
                          if (!enh) return null
                          return (
                            <div className="mt-1.5 text-xs">
                              <p className="font-medium text-amber-400">{enh.name}</p>
                              <p className="text-slate-400 leading-relaxed whitespace-pre-wrap">
                                {htmlToText(enh.description)}
                              </p>
                            </div>
                          )
                        })()}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-500">Select attacker faction</p>
              )}
            </div>
            {/* Defender Detachment */}
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Defender Detachment
              </p>
              {defenderDetachments.length > 0 ? (
                <>
                  <select
                    value={defenderDetachmentId ?? ''}
                    onChange={(e) => setDefenderDetachmentId(e.target.value || null)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                  >
                    <option value="">No detachment</option>
                    {defenderDetachments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  {defDetachmentAbilities.length > 0 && (
                    <CollapsibleSection
                      title="Detachment Abilities"
                      count={defDetachmentAbilities.length}
                    >
                      <div className="text-xs space-y-1.5">
                        {defDetachmentAbilities.map((a) => (
                          <div key={a.id}>
                            <p className="font-medium text-amber-400">{a.name}</p>
                            <p className="text-slate-400 leading-relaxed whitespace-pre-wrap">
                              {htmlToText(a.description)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-500">Select defender faction</p>
              )}
            </div>
          </div>
        )}

        {/* Stratagems Reference */}
        {(attackerStratagems.length > 0 || defenderStratagems.length > 0) && (
          <StratagemReference
            attackerStratagems={attackerStratagems}
            defenderStratagems={defenderStratagems}
          />
        )}

        {/* Weapon selection */}
        {resolvedAttacker && combinedWeapons.length > 0 && (
          <WeaponSelector
            weapons={combinedWeapons}
            attackType={attackType}
            selectedWeapons={selectedWeapons}
            onToggleWeapon={handleToggleWeapon}
            onAttackTypeChange={setAttackType}
          />
        )}

        {/* Special rules */}
        <SpecialRulesEditor
          rules={specialRules}
          weaponAbilities={selectedWeaponAbilities}
          leaderRules={leaderRules}
          onAdd={(rule) => setSpecialRules((prev) => [...prev, rule])}
          onRemove={(index) => setSpecialRules((prev) => prev.filter((_, i) => i !== index))}
        />

        {/* Run button */}
        <button
          disabled={!attackerId || !defenderId || selectedWeapons.size === 0}
          onClick={handleRunClick}
          className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {!attackerId || !defenderId
            ? 'Select attacker and defender'
            : selectedWeapons.size === 0
              ? 'Select weapons to simulate'
              : 'Run Simulation'}
        </button>

        {/* Result */}
        {simData && simData.breakdowns.length > 0 && (
          <div ref={resultsRef}>
            <SimulationResult
              attackerName={attackerName}
              defenderName={defenderName}
              result={simData.result}
              weaponBreakdowns={simData.breakdowns}
              distribution={distribution}
              onSave={handleSave}
            />
          </div>
        )}

        {/* History */}
        <SimulationHistory
          onLoadSimulation={(sim) => {
            // Navigate to the simulation's attacker/defender
            setAttackerId(sim.attackerContentId)
            setDefenderId(sim.defenderContentId)
          }}
        />
      </div>
    </div>
  )
}

function LeaderSelectOption({ leaderId }: { leaderId: string }) {
  const { data: unit } = useGameUnit(leaderId)
  return <option value={leaderId}>{unit?.name ?? leaderId}</option>
}

interface StratagemItem {
  id: string
  name: string
  type: string
  cpCost: string
  turn: string
  phase: string
  legend: string
  description: string
}

function StratagemReference({
  attackerStratagems,
  defenderStratagems,
}: {
  attackerStratagems: StratagemItem[]
  defenderStratagems: StratagemItem[]
}) {
  return (
    <CollapsibleSection
      title="Stratagems"
      count={attackerStratagems.length + defenderStratagems.length}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
        {attackerStratagems.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Attacker
            </p>
            <div className="space-y-2">
              {attackerStratagems.map((s) => (
                <div key={s.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-amber-400">{s.name}</span>
                    <span className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                      {s.cpCost}CP
                    </span>
                    <span className="px-1 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px]">
                      {s.phase}
                    </span>
                  </div>
                  <p className="text-slate-500 mt-0.5 leading-relaxed whitespace-pre-wrap">
                    {htmlToText(s.legend)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        {defenderStratagems.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Defender
            </p>
            <div className="space-y-2">
              {defenderStratagems.map((s) => (
                <div key={s.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-amber-400">{s.name}</span>
                    <span className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                      {s.cpCost}CP
                    </span>
                    <span className="px-1 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px]">
                      {s.phase}
                    </span>
                  </div>
                  <p className="text-slate-500 mt-0.5 leading-relaxed whitespace-pre-wrap">
                    {htmlToText(s.legend)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}

interface HistorySimulation {
  id: string
  attackerContentId: string
  attackerName: string
  defenderContentId: string
  defenderName: string
  result: string
  createdAt: number
}

function SimulationHistory({
  onLoadSimulation: _onLoadSimulation,
}: {
  onLoadSimulation: (sim: HistorySimulation) => void
}) {
  const [showHistory, setShowHistory] = useState(false)
  // Use simulateV2.history — returns normalized rows with real columns (no JSON parsing)
  const { data: history = [] } = trpc.simulateV2.history.useQuery(undefined, {
    enabled: showHistory,
  })
  const utils = trpc.useUtils()
  const deleteSim = trpc.simulateV2.delete.useMutation({
    onSuccess: () => utils.simulateV2.history.invalidate(),
  })

  return (
    <CollapsibleSection title="Simulation History">
      {/* Trigger data fetch when section opens */}
      <HistoryLoader onShow={() => setShowHistory(true)} />
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {!showHistory && <p className="text-sm text-slate-500">Loading...</p>}
        {showHistory && history.length === 0 && (
          <p className="text-sm text-slate-500">No saved simulations yet.</p>
        )}
        {history.map((sim) => (
          <div key={sim.id} className="relative group">
            <div className="w-full text-left rounded-lg bg-slate-800 border border-slate-700 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-amber-400">{sim.attackerName}</span>
                  <span className="text-xs text-slate-500 mx-2">vs</span>
                  <span className="text-sm font-medium text-slate-200">{sim.defenderName}</span>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(sim.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {sim.expectedWounds.toFixed(1)} wounds, {sim.expectedModelsRemoved.toFixed(1)}{' '}
                models removed
              </p>
              {sim.weapons.length > 0 && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {sim.weapons.map((w) => `${w.weaponName} (${w.totalAttacks} attacks)`).join(', ')}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                if (confirm('Delete this simulation?')) {
                  deleteSim.mutate({ id: sim.id })
                }
              }}
              className="absolute top-2 right-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 01.78.72l.5 6a.75.75 0 01-1.499.12l-.5-6a.75.75 0 01.72-.78zm2.84 0a.75.75 0 01.72.78l-.5 6a.75.75 0 11-1.499-.12l.5-6a.75.75 0 01.78-.72z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  )
}

/** Triggers the history data fetch when mounted (i.e. when CollapsibleSection opens) */
function HistoryLoader({ onShow }: { onShow: () => void }) {
  const onShowRef = useRef(onShow)
  onShowRef.current = onShow
  useEffect(() => {
    onShowRef.current()
  }, [])
  return null
}
