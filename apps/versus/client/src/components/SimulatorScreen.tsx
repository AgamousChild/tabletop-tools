import { useState, useMemo, useCallback, useRef } from 'react'
import type { WeaponAbility, WeaponProfile, UnitProfile } from '@tabletop-tools/game-content'
import { useGameDataAvailable, useUnitCompositions } from '@tabletop-tools/game-data-store'
import type { DatasheetModel } from '@tabletop-tools/game-data-store'

import { HelpTip, CollapsibleSection } from '@tabletop-tools/ui'
import { authClient } from '../lib/auth'
import { trpc } from '../lib/trpc'
import { useUnits, useGameFactions, useGameUnit, useGameLeadersForUnit, useGameUnitAbilities, useGameUnitKeywords, useGameWargearOptions, useGameDatasheetWeapons, useGameDatasheetModels, useGameDetachments, useGameDetachmentAbilities, useGameEnhancements, useGameStratagems } from '../lib/useGameData'
import { parseModelCount } from '../lib/modelCount'
import { simulateWeapon, runMonteCarlo } from '../lib/rules/pipeline'
import type { SimResult, DistributionData } from '../lib/rules/pipeline'
import { SimulationResult } from './SimulationResult'
import type { WeaponBreakdown } from './SimulationResult'
import { UnitSelector } from './UnitSelector'
import { UnitProfileCard } from './UnitProfileCard'
import { WeaponSelector } from './WeaponSelector'
import { SpecialRulesEditor } from './SpecialRulesEditor'

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
  const wInvSv = model.invSv && model.invSv !== '-' && model.invSv !== '\u2013'
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
    case 'SUSTAINED_HITS': return `Sustained Hits ${a.value}`
    case 'LETHAL_HITS': return 'Lethal Hits'
    case 'DEVASTATING_WOUNDS': return 'Devastating Wounds'
    case 'TORRENT': return 'Torrent'
    case 'TWIN_LINKED': return 'Twin-linked'
    case 'BLAST': return 'Blast'
    case 'REROLL_HITS_OF_1': return 'Re-roll hits of 1'
    case 'REROLL_HITS': return 'Re-roll all hits'
    case 'REROLL_WOUNDS': return 'Re-roll wounds'
    case 'HIT_MOD': return `${a.value > 0 ? '+' : ''}${a.value} to hit`
    case 'WOUND_MOD': return `${a.value > 0 ? '+' : ''}${a.value} to wound`
    case 'STRENGTH_MOD': return `Str ${a.value > 0 ? '+' : ''}${a.value}`
    case 'ATTACKS_MOD': return a.value === 0 ? 'Extra Attacks' : `Attacks ${a.value > 0 ? '+' : ''}${a.value}`
    case 'ANTI': return `Anti-${a.keyword} ${a.value}+`
    case 'MELTA': return `Melta ${a.value}`
    case 'IGNORES_COVER': return 'Ignores Cover'
    default: return a.type
  }
}

/** Strip HTML tags from a string, returning plain text. */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim()
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
  const [defenderModelCount, setDefenderModelCount] = useState(5)
  const [invulnSave, setInvulnSave] = useState<number | undefined>()
  const [fnp, setFnp] = useState<number | undefined>()
  const [attackType, setAttackType] = useState<AttackType>('ranged')
  const [weaponOverrides, setWeaponOverrides] = useState<Map<number, boolean>>(new Map())
  const [specialRules, setSpecialRules] = useState<WeaponAbility[]>([])
  const [attackerDetachmentId, setAttackerDetachmentId] = useState<string | null>(null)
  const [attackerEnhancementId, setAttackerEnhancementId] = useState<string | null>(null)
  const [defenderDetachmentId, setDefenderDetachmentId] = useState<string | null>(null)

  const gameDataAvailable = useGameDataAvailable()
  const { data: factions = [] } = useGameFactions()

  const { data: attackerUnits = [], isLoading: loadingAttackers } = useUnits({
    faction: attackerFaction,
    name: attackerQuery || undefined,
  })

  const { data: defenderUnits = [], isLoading: loadingDefenders } = useUnits({
    faction: defenderFaction,
    name: defenderQuery || undefined,
  })

  const { data: attacker } = useGameUnit(attackerId)
  const { data: defender } = useGameUnit(defenderId)
  const { data: attackerLeader } = useGameUnit(attackerLeaderId)
  const { data: defenderComps = [] } = useUnitCompositions(defenderId ?? '')
  const { data: availableLeaders = [] } = useGameLeadersForUnit(attackerId)
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

  // Auto-populate defender model count from composition data
  const defaultDefenderModels = useMemo(() => {
    if (defenderComps.length === 0) return null
    return parseModelCount(defenderComps)
  }, [defenderComps])

  // When attacker changes, clear overrides and leader so defaults kick in from data
  const handleAttackerSelect = useCallback((id: string) => {
    setAttackerId(id)
    setAttackerLeaderId(null)
    setWeaponOverrides(new Map())
    setSpecialRules([])
  }, [])

  const handleDefenderSelect = useCallback((id: string) => {
    setDefenderId(id)
    setDefenderModelCount(-1) // sentinel: use composition data if available
    setInvulnSave(undefined)
    setFnp(undefined)
  }, [])

  // Resolve effective model count: user override > composition data > default 5
  const effectiveDefenderModels = defenderModelCount === -1
    ? (defaultDefenderModels ?? 5)
    : defenderModelCount

  // Combine attacker weapons with leader weapons.
  // Prefers Wahapedia weapon profiles when available (cleaner, normalized data).
  const combinedWeapons = useMemo((): WeaponProfile[] => {
    if (!resolvedAttacker) return []
    // Use Wahapedia weapons if available, fall back to BSData-parsed weapons
    const baseWeapons = wahapediaAttackerWeapons.length > 0
      ? wahapediaAttackerWeapons
      : resolvedAttacker.weapons
    const weapons = [...baseWeapons]
    // Merge leader weapons
    const leaderWeapons = wahapediaLeaderWeapons.length > 0
      ? wahapediaLeaderWeapons
      : (attackerLeader?.weapons ?? [])
    for (const w of leaderWeapons) {
      if (!weapons.some(ew => ew.name === w.name)) {
        weapons.push(w)
      }
    }
    return weapons
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
      const isExtraAttacks = !isRanged && w.abilities.some(a => a.type === 'ATTACKS_MOD' && a.value === 0)
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

  const handleToggleWeapon = useCallback((index: number) => {
    setWeaponOverrides((prev) => {
      const next = new Map(prev)
      // If already overridden, flip the override; otherwise set to opposite of current selection
      const isCurrentlySelected = selectedWeapons.has(index)
      next.set(index, !isCurrentlySelected)
      return next
    })
  }, [selectedWeapons])

  // Get selected weapon profiles with merged special rules
  const getSelectedWeapons = useCallback((): WeaponProfile[] => {
    if (combinedWeapons.length === 0) return []
    return Array.from(selectedWeapons)
      .sort((a, b) => a - b)
      .map((i) => combinedWeapons[i])
      .filter(Boolean)
      .map((w) => ({
        ...w,
        abilities: [...w.abilities, ...specialRules],
      }))
  }, [combinedWeapons, selectedWeapons, specialRules])

  // Compute simulation locally
  const simData = useMemo((): { result: SimResult; breakdowns: WeaponBreakdown[] } | null => {
    if (!resolvedAttacker || !resolvedDefender) return null

    const weapons = getSelectedWeapons()
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

    for (const weapon of weapons) {
      const defKeywords = defenderKeywordRecords.map((k) => k.keyword)
      const r = simulateWeapon(
        weapon,
        resolvedDefender.toughness,
        resolvedDefender.save,
        resolvedDefender.wounds,
        effectiveDefenderModels,
        effectiveInvuln,
        effectiveFnp,
        defKeywords,
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

    totalExpectedModelsRemoved = Math.min(
      effectiveDefenderModels,
      totalExpectedModelsRemoved,
    )
    const survivors = Math.max(0, effectiveDefenderModels - totalExpectedModelsRemoved)

    bestCaseWounds = Math.min(
      bestCaseWounds,
      effectiveDefenderModels * resolvedDefender.wounds,
    )
    worstCaseWounds = Math.min(
      worstCaseWounds,
      effectiveDefenderModels * resolvedDefender.wounds,
    )

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
  }, [resolvedAttacker, resolvedDefender, effectiveDefenderModels, invulnSave, fnp, getSelectedWeapons])

  // Monte Carlo distribution (runs alongside deterministic sim)
  const [distribution, setDistribution] = useState<DistributionData | null>(null)

  const handleRunClick = useCallback(() => {
    // Run Monte Carlo in the background when user clicks Run
    if (!resolvedAttacker || !resolvedDefender) return
    const weapons = getSelectedWeapons()
    if (weapons.length === 0) { setDistribution(null); return }

    const effectiveInvuln = invulnSave ?? resolvedDefender.invulnSave
    const effectiveFnp = fnp ?? resolvedDefender.fnp
    const defKeywords = defenderKeywordRecords.map((k) => k.keyword)

    const dist = runMonteCarlo(
      weapons,
      resolvedDefender.toughness,
      resolvedDefender.save,
      resolvedDefender.wounds,
      effectiveDefenderModels,
      effectiveInvuln,
      effectiveFnp,
      defKeywords,
    )
    setDistribution(dist)

    if (resultsRef.current && typeof resultsRef.current.scrollIntoView === 'function') {
      resultsRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [resolvedAttacker, resolvedDefender, effectiveDefenderModels, invulnSave, fnp, getSelectedWeapons, defenderKeywordRecords])

  const resultsRef = useRef<HTMLDivElement>(null)

  const saveMutation = trpc.simulate.save.useMutation()

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
    const weaponConfig = {
      attackType,
      effectiveDefenderModels,
      invulnSave: invulnSave ?? resolvedDefender?.invulnSave,
      fnp: fnp ?? resolvedDefender?.fnp,
      specialRules,
      selectedWeapons: weapons.map((w) => w.name),
      leaderContentId: attackerLeaderId ?? undefined,
      breakdowns: simData.breakdowns,
    }
    const configStr = JSON.stringify(weaponConfig)
    saveMutation.mutate({
      attackerId,
      attackerName,
      defenderId,
      defenderName,
      result: simData.result,
      weaponConfig: configStr,
      configHash: simpleHash(configStr),
    })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors" title="Back to Home">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
            </svg>
            Home
          </a>
          <span className="text-lg font-bold text-amber-400">Versus</span>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Sign out
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* No data warning */}
        {!gameDataAvailable && (
          <div className="bg-slate-900 border border-amber-400/30 rounded-lg p-4 text-center">
            <p className="text-slate-200 font-semibold">No game data imported</p>
            <p className="text-slate-400 text-sm mt-1">
              Import unit profiles from the{' '}
              <a href="/data-import/" className="text-amber-400 hover:underline">Data Import</a>{' '}
              app (Unit Profiles tab) to use the combat simulator.
            </p>
          </div>
        )}

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
            {resolvedAttacker && <UnitProfileCard unit={resolvedAttacker} />}
            {attackerAbilities.length > 0 && (
              <CollapsibleSection title="Unit Abilities" count={attackerAbilities.length}>
                <div className="space-y-1.5">
                  {attackerAbilities.map((a, i) => (
                    <div key={i}>
                      <p className="text-xs font-medium text-amber-400">{a.name}</p>
                      <p className="text-xs text-slate-400 leading-relaxed">{a.description}</p>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}
            {attackerKeywordRecords.length > 0 && (
              <CollapsibleSection title="Keywords" count={attackerKeywordRecords.length}>
                <div className="flex flex-wrap gap-1">
                  {attackerKeywordRecords.map((k, i) => (
                    <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${k.isFactionKeyword ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                      {k.keyword}
                    </span>
                  ))}
                </div>
              </CollapsibleSection>
            )}
            {attackerWargear.length > 0 && (
              <CollapsibleSection title="Wargear Options" count={attackerWargear.length}>
                {attackerWargear.map((w, i) => (
                  <p key={i} className="text-xs text-slate-500">{w.description}</p>
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
                <UnitProfileCard unit={resolvedDefender} invulnSave={invulnSave} fnp={fnp} />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">
                      Models{defenderModelCount === -1 && defaultDefenderModels ? ' (from data)' : ''}
                      <HelpTip text="Number of models in the defending unit. Auto-filled from unit data when available." />
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={effectiveDefenderModels}
                      onChange={(e) => setDefenderModelCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">Invuln<HelpTip text="Invulnerable save. Ignores AP. Overrides unit data if set." /></label>
                    <select
                      value={invulnSave ?? resolvedDefender.invulnSave ?? ''}
                      onChange={(e) => setInvulnSave(e.target.value ? parseInt(e.target.value) : undefined)}
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
                    <label className="block text-xs text-slate-400 mb-1">FNP<HelpTip text="Feel No Pain. Each point of damage is ignored on this roll. Applied after saves." /></label>
                    <select
                      value={fnp ?? resolvedDefender.fnp ?? ''}
                      onChange={(e) => setFnp(e.target.value ? parseInt(e.target.value) : undefined)}
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
                          <p className="text-xs text-slate-400 leading-relaxed">{a.description}</p>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}
                {defenderKeywordRecords.length > 0 && (
                  <CollapsibleSection title="Keywords" count={defenderKeywordRecords.length}>
                    <div className="flex flex-wrap gap-1">
                      {defenderKeywordRecords.map((k, i) => (
                        <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${k.isFactionKeyword ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                          {k.keyword}
                        </span>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}
                {defenderWargear.length > 0 && (
                  <CollapsibleSection title="Wargear Options" count={defenderWargear.length}>
                    {defenderWargear.map((w, i) => (
                      <p key={i} className="text-xs text-slate-500">{w.description}</p>
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
            <label className="block text-xs text-slate-400 mb-2">Attach Leader<HelpTip text="Add a leader to the attacker. Leaders provide additional weapons and abilities." /></label>
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

        {/* Detachments */}
        {(attackerDetachments.length > 0 || defenderDetachments.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Attacker Detachment */}
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Attacker Detachment</p>
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
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  {atkDetachmentAbilities.length > 0 && (
                    <CollapsibleSection title="Detachment Abilities" count={atkDetachmentAbilities.length}>
                      <div className="text-xs space-y-1.5">
                        {atkDetachmentAbilities.map((a) => (
                          <div key={a.id}>
                            <p className="font-medium text-amber-400">{a.name}</p>
                            <p className="text-slate-400 leading-relaxed">{stripHtmlTags(a.description)}</p>
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
                          <option key={enh.id} value={enh.id}>{enh.name} ({enh.cost}pts)</option>
                        ))}
                      </select>
                      {attackerEnhancementId && (() => {
                        const enh = atkDetachmentEnhancements.find(e => e.id === attackerEnhancementId)
                        if (!enh) return null
                        return (
                          <div className="mt-1.5 text-xs">
                            <p className="font-medium text-amber-400">{enh.name}</p>
                            <p className="text-slate-400 leading-relaxed">{stripHtmlTags(enh.description)}</p>
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
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Defender Detachment</p>
              {defenderDetachments.length > 0 ? (
                <>
                  <select
                    value={defenderDetachmentId ?? ''}
                    onChange={(e) => setDefenderDetachmentId(e.target.value || null)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                  >
                    <option value="">No detachment</option>
                    {defenderDetachments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  {defDetachmentAbilities.length > 0 && (
                    <CollapsibleSection title="Detachment Abilities" count={defDetachmentAbilities.length}>
                      <div className="text-xs space-y-1.5">
                        {defDetachmentAbilities.map((a) => (
                          <div key={a.id}>
                            <p className="font-medium text-amber-400">{a.name}</p>
                            <p className="text-slate-400 leading-relaxed">{stripHtmlTags(a.description)}</p>
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

function StratagemReference({ attackerStratagems, defenderStratagems }: {
  attackerStratagems: StratagemItem[]
  defenderStratagems: StratagemItem[]
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between text-sm font-semibold text-slate-300 hover:text-slate-100"
      >
        <span>Stratagems ({attackerStratagems.length + defenderStratagems.length})</span>
        <span className="text-slate-500">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
          {attackerStratagems.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Attacker</p>
              <div className="space-y-2">
                {attackerStratagems.map((s) => (
                  <div key={s.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-amber-400">{s.name}</span>
                      <span className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">{s.cpCost}CP</span>
                      <span className="px-1 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px]">{s.phase}</span>
                    </div>
                    <p className="text-slate-500 mt-0.5 leading-relaxed">{stripHtmlTags(s.legend)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {defenderStratagems.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Defender</p>
              <div className="space-y-2">
                {defenderStratagems.map((s) => (
                  <div key={s.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-amber-400">{s.name}</span>
                      <span className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">{s.cpCost}CP</span>
                      <span className="px-1 py-0.5 rounded bg-slate-800 text-slate-500 text-[10px]">{s.phase}</span>
                    </div>
                    <p className="text-slate-500 mt-0.5 leading-relaxed">{stripHtmlTags(s.legend)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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

function SimulationHistory({ onLoadSimulation }: {
  onLoadSimulation: (sim: HistorySimulation) => void
}) {
  const [showHistory, setShowHistory] = useState(false)
  const { data: history = [] } = trpc.simulate.history.useQuery(undefined, { enabled: showHistory })

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <button
        onClick={() => setShowHistory((prev) => !prev)}
        className="w-full flex items-center justify-between text-sm font-semibold text-slate-300 hover:text-slate-100"
      >
        <span>Simulation History</span>
        <span className="text-slate-500">{showHistory ? '▲' : '▼'}</span>
      </button>

      {showHistory && (
        <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
          {history.length === 0 && (
            <p className="text-sm text-slate-500">No saved simulations yet.</p>
          )}
          {history.map((sim) => {
            let result: { expectedWounds: number; expectedModelsRemoved: number } | null = null
            try {
              result = JSON.parse(sim.result as string)
            } catch { /* empty */ }

            return (
              <button
                key={sim.id as string}
                onClick={() => onLoadSimulation(sim as unknown as HistorySimulation)}
                className="w-full text-left rounded-lg bg-slate-800 border border-slate-700 p-3 hover:border-amber-400/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-amber-400">{sim.attackerName as string}</span>
                    <span className="text-xs text-slate-500 mx-2">vs</span>
                    <span className="text-sm font-medium text-slate-200">{sim.defenderName as string}</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(sim.createdAt as number).toLocaleDateString()}
                  </span>
                </div>
                {result && (
                  <p className="text-xs text-slate-400 mt-1">
                    {(result.expectedWounds ?? 0).toFixed(1)} wounds, {result.expectedModelsRemoved ?? 0} models removed
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
