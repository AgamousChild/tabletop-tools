import { useState, useMemo, useCallback, useRef } from 'react'
import type { WeaponAbility, WeaponProfile } from '@tabletop-tools/game-content'
import { useGameDataAvailable } from '@tabletop-tools/game-data-store'

import { authClient } from '../lib/auth'
import { trpc } from '../lib/trpc'
import { useUnits, useGameFactions, useGameUnit } from '../lib/useGameData'
import { simulateWeapon } from '../lib/rules/pipeline'
import type { SimResult } from '../lib/rules/pipeline'
import { SimulationResult } from './SimulationResult'
import type { WeaponBreakdown } from './SimulationResult'
import { UnitSelector } from './UnitSelector'
import { UnitProfileCard } from './UnitProfileCard'
import { WeaponSelector } from './WeaponSelector'
import { SpecialRulesEditor } from './SpecialRulesEditor'

type AttackType = 'ranged' | 'melee'

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
  const [defenderModelCount, setDefenderModelCount] = useState(5)
  const [invulnSave, setInvulnSave] = useState<number | undefined>()
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

  // When attacker changes, clear overrides so defaults kick in from data
  const handleAttackerSelect = useCallback((id: string) => {
    setAttackerId(id)
    setWeaponOverrides(new Map())
    setSpecialRules([])
  }, [])

  const handleDefenderSelect = useCallback((id: string) => {
    setDefenderId(id)
    setDefenderModelCount(5)
    setInvulnSave(undefined)
  }, [])

  // Derive selected weapons from loaded data — no useEffect.
  // When attacker data loads from IndexedDB, weapons auto-select by attack type.
  // User can override individual toggles; overrides clear on unit change.
  const selectedWeapons = useMemo(() => {
    if (!attacker) return new Set<number>()
    const indices = new Set<number>()
    attacker.weapons.forEach((w, i) => {
      const isRanged = w.range !== 'melee'
      const defaultSelected =
        (attackType === 'ranged' && isRanged) || (attackType === 'melee' && !isRanged)
      const override = weaponOverrides.get(i)
      if (override !== undefined ? override : defaultSelected) {
        indices.add(i)
      }
    })
    return indices
  }, [attacker, attackType, weaponOverrides])

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
    if (!attacker) return []
    return Array.from(selectedWeapons)
      .sort((a, b) => a - b)
      .map((i) => attacker.weapons[i])
      .filter(Boolean)
      .map((w) => ({
        ...w,
        abilities: [...w.abilities, ...specialRules],
      }))
  }, [attacker, selectedWeapons, specialRules])

  // Compute simulation locally
  const simData = useMemo((): { result: SimResult; breakdowns: WeaponBreakdown[] } | null => {
    if (!attacker || !defender) return null

    const weapons = getSelectedWeapons()
    if (weapons.length === 0) {
      return {
        result: {
          expectedWounds: 0,
          expectedModelsRemoved: 0,
          survivors: defenderModelCount,
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

    for (const weapon of weapons) {
      const r = simulateWeapon(
        weapon,
        defender.toughness,
        defender.save,
        defender.wounds,
        defenderModelCount,
        invulnSave,
      )
      totalExpectedWounds += r.expectedWounds
      totalExpectedModelsRemoved += r.expectedModelsRemoved
      bestCaseWounds += r.bestCase.wounds
      worstCaseWounds += r.worstCase.wounds

      breakdowns.push({
        weaponName: weapon.name,
        expectedWounds: r.expectedWounds,
        expectedModelsRemoved: r.expectedModelsRemoved,
      })
    }

    totalExpectedModelsRemoved = Math.min(
      defenderModelCount,
      totalExpectedModelsRemoved,
    )
    const survivors = Math.max(0, defenderModelCount - totalExpectedModelsRemoved)

    bestCaseWounds = Math.min(
      bestCaseWounds,
      defenderModelCount * defender.wounds,
    )
    worstCaseWounds = Math.min(
      worstCaseWounds,
      defenderModelCount * defender.wounds,
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
  }, [attacker, defender, defenderModelCount, invulnSave, getSelectedWeapons])

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
    saveMutation.mutate({
      attackerId,
      attackerName,
      defenderId,
      defenderName,
      result: simData.result,
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
        {/* Debug — temporary */}
        <div className="bg-slate-900 border border-slate-700 rounded p-2 text-xs font-mono text-slate-400">
          <p>gameDataAvailable: {String(gameDataAvailable)}</p>
          <p>attackerId: {attackerId ?? 'null'}</p>
          <p>attacker loaded: {String(!!attacker)}</p>
          <p>attacker weapons: {attacker?.weapons?.length ?? 'n/a'}</p>
          <p>defenderId: {defenderId ?? 'null'}</p>
          <p>defender loaded: {String(!!defender)}</p>
          <p>selectedWeapons: {selectedWeapons.size}</p>
          <p>factions: {factions.length}</p>
          <p>attackerUnits: {attackerUnits.length}</p>
        </div>

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
                <UnitProfileCard unit={defender} invulnSave={invulnSave} />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">Models</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={defenderModelCount}
                      onChange={(e) => setDefenderModelCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">Invuln save</label>
                    <select
                      value={invulnSave ?? ''}
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
                </div>
              </>
            )}
          </div>
        </div>

        {/* Weapon selection */}
        {attacker && attacker.weapons.length > 0 && (
          <WeaponSelector
            weapons={attacker.weapons}
            attackType={attackType}
            selectedWeapons={selectedWeapons}
            onToggleWeapon={handleToggleWeapon}
            onAttackTypeChange={setAttackType}
          />
        )}

        {/* Special rules */}
        <SpecialRulesEditor
          rules={specialRules}
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
      </div>
    </div>
  )
}
