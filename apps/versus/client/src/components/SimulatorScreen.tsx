import { useState, useMemo, useCallback, useRef } from 'react'
import type { WeaponAbility, WeaponProfile } from '@tabletop-tools/game-content'
import { useGameDataAvailable, useUnitCompositions } from '@tabletop-tools/game-data-store'

import { authClient } from '../lib/auth'
import { trpc } from '../lib/trpc'
import { useUnits, useGameFactions, useGameUnit, useGameLeadersForUnit, useGameUnitAbilities, useGameUnitKeywords, useGameWargearOptions, useGameDatasheetWeapons, useGameDatasheetModels } from '../lib/useGameData'
import { parseModelCount } from '../lib/modelCount'
import { simulateWeapon } from '../lib/rules/pipeline'
import type { SimResult } from '../lib/rules/pipeline'
import { SimulationResult } from './SimulationResult'
import type { WeaponBreakdown } from './SimulationResult'
import { UnitSelector } from './UnitSelector'
import { UnitProfileCard } from './UnitProfileCard'
import { WeaponSelector } from './WeaponSelector'
import { SpecialRulesEditor } from './SpecialRulesEditor'

type AttackType = 'ranged' | 'melee'

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
  const { data: wahapediaDefenderModels = [] } = useGameDatasheetModels(defenderId)

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
    if (!attacker) return []
    // Use Wahapedia weapons if available, fall back to BSData-parsed weapons
    const baseWeapons = wahapediaAttackerWeapons.length > 0
      ? wahapediaAttackerWeapons
      : attacker.weapons
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
  }, [attacker, attackerLeader, wahapediaAttackerWeapons, wahapediaLeaderWeapons])

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
    if (!attacker || !defender) return null

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

    // Use data-driven invuln/fnp from unit profile, allow override
    const effectiveInvuln = invulnSave ?? defender.invulnSave
    const effectiveFnp = fnp ?? defender.fnp

    for (const weapon of weapons) {
      const defKeywords = defenderKeywordRecords.map((k) => k.keyword)
      const r = simulateWeapon(
        weapon,
        defender.toughness,
        defender.save,
        defender.wounds,
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
      effectiveDefenderModels * defender.wounds,
    )
    worstCaseWounds = Math.min(
      worstCaseWounds,
      effectiveDefenderModels * defender.wounds,
    )

    return {
      result: {
        expectedWounds: parseFloat(totalExpectedWounds.toFixed(4)),
        expectedModelsRemoved: parseFloat(totalExpectedModelsRemoved.toFixed(4)),
        survivors: parseFloat(survivors.toFixed(4)),
        worstCase: {
          wounds: worstCaseWounds,
          modelsRemoved: Math.floor(worstCaseWounds / defender.wounds),
        },
        bestCase: {
          wounds: bestCaseWounds,
          modelsRemoved: Math.floor(bestCaseWounds / defender.wounds),
        },
      },
      breakdowns,
    }
  }, [attacker, defender, effectiveDefenderModels, invulnSave, fnp, getSelectedWeapons])

  const resultsRef = useRef<HTMLDivElement>(null)

  const handleRunClick = useCallback(() => {
    if (resultsRef.current && typeof resultsRef.current.scrollIntoView === 'function') {
      resultsRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

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
      invulnSave: invulnSave ?? defender?.invulnSave,
      fnp: fnp ?? defender?.fnp,
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
      <header className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-amber-400">Versus</h1>
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
              onFactionChange={setAttackerFaction}
              onQueryChange={setAttackerQuery}
              onSelect={handleAttackerSelect}
            />
            {attacker && <UnitProfileCard unit={attacker} />}
            {attackerAbilities.length > 0 && (
              <UnitAbilitiesDisplay abilities={attackerAbilities} />
            )}
            {attackerKeywordRecords.length > 0 && (
              <div className="text-xs text-slate-500 bg-slate-900 rounded-lg p-2 border border-slate-800">
                <p className="font-semibold text-slate-400 mb-1">Keywords</p>
                <div className="flex flex-wrap gap-1">
                  {attackerKeywordRecords.map((k, i) => (
                    <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${k.isFactionKeyword ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                      {k.keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {attackerWargear.length > 0 && (
              <div className="text-xs text-slate-500 bg-slate-900 rounded-lg p-2 border border-slate-800">
                <p className="font-semibold text-slate-400 mb-1">Wargear Options</p>
                {attackerWargear.map((w, i) => (
                  <p key={i} className="text-slate-500">{w.description}</p>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <UnitSelector
              label="Defender"
              factions={factions}
              units={defenderUnits}
              selectedUnitId={defenderId}
              isLoadingUnits={loadingDefenders}
              onFactionChange={setDefenderFaction}
              onQueryChange={setDefenderQuery}
              onSelect={handleDefenderSelect}
            />
            {defender && (
              <>
                <UnitProfileCard unit={defender} invulnSave={invulnSave} fnp={fnp} />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">
                      Models{defenderModelCount === -1 && defaultDefenderModels ? ' (from data)' : ''}
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
                    <label className="block text-xs text-slate-400 mb-1">Invuln save</label>
                    <select
                      value={invulnSave ?? defender.invulnSave ?? ''}
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
                    <label className="block text-xs text-slate-400 mb-1">FNP</label>
                    <select
                      value={fnp ?? defender.fnp ?? ''}
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
                  <UnitAbilitiesDisplay abilities={defenderAbilities} />
                )}
                {defenderKeywordRecords.length > 0 && (
                  <div className="text-xs text-slate-500 bg-slate-900 rounded-lg p-2 border border-slate-800">
                    <p className="font-semibold text-slate-400 mb-1">Keywords</p>
                    <div className="flex flex-wrap gap-1">
                      {defenderKeywordRecords.map((k, i) => (
                        <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${k.isFactionKeyword ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                          {k.keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {defenderWargear.length > 0 && (
                  <div className="text-xs text-slate-500 bg-slate-900 rounded-lg p-2 border border-slate-800">
                    <p className="font-semibold text-slate-400 mb-1">Wargear Options</p>
                    {defenderWargear.map((w, i) => (
                      <p key={i} className="text-slate-500">{w.description}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Leader attachment (if available) */}
        {attacker && availableLeaders.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <label className="block text-xs text-slate-400 mb-2">Attach Leader</label>
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

        {/* Weapon selection */}
        {attacker && combinedWeapons.length > 0 && (
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

function UnitAbilitiesDisplay({ abilities }: { abilities: { name: string; description: string; type: string }[] }) {
  if (abilities.length === 0) return null
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 p-3">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Unit Abilities</p>
      <div className="space-y-1.5">
        {abilities.map((a, i) => (
          <div key={i}>
            <p className="text-xs font-medium text-amber-400">{a.name}</p>
            <p className="text-xs text-slate-400 leading-relaxed">{a.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function LeaderSelectOption({ leaderId }: { leaderId: string }) {
  const { data: unit } = useGameUnit(leaderId)
  return <option value={leaderId}>{unit?.name ?? leaderId}</option>
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
