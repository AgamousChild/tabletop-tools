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
import { SpecialRulesEditor } from './SpecialRulesEditor'

const inputClass = 'w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-amber-400'

type Props = {
  onSignOut: () => void
}

export function SimulatorScreen({ onSignOut }: Props) {
  // Defender stats (manual entry, or populated from unit selector)
  const [defToughness, setDefToughness] = useState(4)
  const [defSave, setDefSave] = useState(3)
  const [defWounds, setDefWounds] = useState(2)
  const [defModels, setDefModels] = useState(5)
  const [defInvuln, setDefInvuln] = useState<number | undefined>()
  const [defFnp, setDefFnp] = useState<number | undefined>()
  const [defenderName, setDefenderName] = useState('Defender')

  // Weapons (manual entry + from unit selector)
  const [weapons, setWeapons] = useState<WeaponProfile[]>([])
  const [attackerName, setAttackerName] = useState('Attacker')

  // Manual weapon form
  const [wepName, setWepName] = useState('')
  const [wepAttacks, setWepAttacks] = useState('2')
  const [wepSkill, setWepSkill] = useState(3)
  const [wepStrength, setWepStrength] = useState(4)
  const [wepAp, setWepAp] = useState(0)
  const [wepDamage, setWepDamage] = useState('1')

  // Special rules
  const [specialRules, setSpecialRules] = useState<WeaponAbility[]>([])

  // Unit selector (optional, collapsible)
  const [showUnitPicker, setShowUnitPicker] = useState(false)
  const [pickerFaction, setPickerFaction] = useState<string | undefined>()
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerUnitId, setPickerUnitId] = useState<string | null>(null)
  const [pickerTarget, setPickerTarget] = useState<'attacker' | 'defender'>('attacker')

  const gameDataAvailable = useGameDataAvailable()
  const { data: factions = [] } = useGameFactions()
  const { data: pickerUnits = [], isLoading: loadingUnits } = useUnits({
    faction: pickerFaction,
    name: pickerQuery || undefined,
  })
  const { data: pickerUnit } = useGameUnit(pickerUnitId)

  // When a unit is selected from picker, populate the relevant side
  const handlePickUnit = useCallback((id: string) => {
    setPickerUnitId(id)
  }, [])

  const handleApplyUnit = useCallback(() => {
    if (!pickerUnit) return
    if (pickerTarget === 'attacker') {
      setAttackerName(pickerUnit.name)
      setWeapons(pickerUnit.weapons)
    } else {
      setDefenderName(pickerUnit.name)
      setDefToughness(pickerUnit.toughness)
      setDefSave(pickerUnit.save)
      setDefWounds(pickerUnit.wounds)
    }
    setShowUnitPicker(false)
    setPickerUnitId(null)
    setPickerQuery('')
  }, [pickerUnit, pickerTarget])

  // Add manual weapon
  const handleAddWeapon = useCallback(() => {
    const attacks = /^\d*D\d/i.test(wepAttacks) ? wepAttacks : (parseInt(wepAttacks) || 1)
    const damage = /^\d*D\d/i.test(wepDamage) ? wepDamage : (parseInt(wepDamage) || 1)
    const newWeapon: WeaponProfile = {
      name: wepName || `Weapon ${weapons.length + 1}`,
      range: 24,
      attacks,
      skill: wepSkill,
      strength: wepStrength,
      ap: -Math.abs(wepAp),
      damage,
      abilities: [],
    }
    setWeapons((prev) => [...prev, newWeapon])
    setWepName('')
  }, [wepName, wepAttacks, wepSkill, wepStrength, wepAp, wepDamage, weapons.length])

  const handleRemoveWeapon = useCallback((index: number) => {
    setWeapons((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Build weapon profiles with special rules merged
  const weaponsWithRules = useMemo(() => {
    return weapons.map((w) => ({
      ...w,
      abilities: [...w.abilities, ...specialRules],
    }))
  }, [weapons, specialRules])

  // Compute simulation
  const simData = useMemo((): { result: SimResult; breakdowns: WeaponBreakdown[] } | null => {
    if (weapons.length === 0) return null

    let totalExpectedWounds = 0
    let totalExpectedModelsRemoved = 0
    let bestCaseWounds = 0
    let worstCaseWounds = 0
    const breakdowns: WeaponBreakdown[] = []

    for (const weapon of weaponsWithRules) {
      const r = simulateWeapon(
        weapon,
        defToughness,
        defSave,
        defWounds,
        defModels,
        defInvuln,
        defFnp,
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

    totalExpectedModelsRemoved = Math.min(defModels, totalExpectedModelsRemoved)
    const survivors = Math.max(0, defModels - totalExpectedModelsRemoved)
    bestCaseWounds = Math.min(bestCaseWounds, defModels * defWounds)
    worstCaseWounds = Math.min(worstCaseWounds, defModels * defWounds)

    return {
      result: {
        expectedWounds: parseFloat(totalExpectedWounds.toFixed(4)),
        expectedModelsRemoved: parseFloat(totalExpectedModelsRemoved.toFixed(4)),
        survivors: parseFloat(survivors.toFixed(4)),
        worstCase: {
          wounds: worstCaseWounds,
          modelsRemoved: Math.floor(worstCaseWounds / defWounds),
        },
        bestCase: {
          wounds: bestCaseWounds,
          modelsRemoved: Math.floor(bestCaseWounds / defWounds),
        },
      },
      breakdowns,
    }
  }, [weaponsWithRules, defToughness, defSave, defWounds, defModels, defInvuln, defFnp, weapons.length])

  const resultsRef = useRef<HTMLDivElement>(null)

  const handleRunClick = useCallback(() => {
    if (resultsRef.current && typeof resultsRef.current.scrollIntoView === 'function') {
      resultsRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  const saveMutation = trpc.simulate.save.useMutation()

  async function handleSignOut() {
    await authClient.signOut()
    onSignOut()
  }

  function handleSave() {
    if (!simData?.result) return
    saveMutation.mutate({
      attackerId: 'manual',
      attackerName,
      defenderId: 'manual',
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

        {/* Unit picker (optional) */}
        {gameDataAvailable && (
          <div>
            <button
              onClick={() => setShowUnitPicker(!showUnitPicker)}
              className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
            >
              {showUnitPicker ? 'Hide unit picker' : 'Load from imported data'}
            </button>

            {showUnitPicker && (
              <div className="mt-3 rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setPickerTarget('attacker')}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      pickerTarget === 'attacker'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    Pick Attacker
                  </button>
                  <button
                    onClick={() => setPickerTarget('defender')}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      pickerTarget === 'defender'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    Pick Defender
                  </button>
                </div>
                <select
                  className={inputClass}
                  onChange={(e) => setPickerFaction(e.target.value || undefined)}
                  defaultValue=""
                >
                  <option value="">All factions</option>
                  {factions.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Search units…"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  className={inputClass}
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {loadingUnits ? (
                    <p className="text-slate-400 text-sm py-2">Loading…</p>
                  ) : pickerUnits.length === 0 ? (
                    <p className="text-slate-500 text-sm py-2 italic">No units found</p>
                  ) : (
                    pickerUnits.map((unit) => (
                      <button
                        key={unit.id}
                        onClick={() => handlePickUnit(unit.id)}
                        className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                          pickerUnitId === unit.id
                            ? 'bg-amber-400/20 border border-amber-400 text-amber-400'
                            : 'bg-slate-800 border border-slate-700 text-slate-100 hover:border-slate-600'
                        }`}
                      >
                        {unit.name} <span className="text-slate-500">{unit.points}pts</span>
                      </button>
                    ))
                  )}
                </div>
                {pickerUnit && (
                  <button
                    onClick={handleApplyUnit}
                    className="w-full py-2 rounded-lg bg-amber-400 text-slate-950 font-semibold text-sm hover:bg-amber-300 transition-colors"
                  >
                    Apply as {pickerTarget === 'attacker' ? 'Attacker' : 'Defender'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Attacker — Weapons */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Attacker: {attackerName}
            </h2>

            {/* Weapon list */}
            {weapons.length > 0 && (
              <div className="space-y-2">
                {weapons.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100">{w.name}</p>
                      <div className="flex flex-wrap gap-x-3 text-xs text-slate-400 mt-0.5">
                        <span>A:{w.attacks}</span>
                        <span>WS/BS:{w.skill}+</span>
                        <span>S:{w.strength}</span>
                        <span>AP:{w.ap}</span>
                        <span>D:{w.damage}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveWeapon(i)}
                      className="text-slate-500 hover:text-red-400 text-xs px-1"
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add weapon form */}
            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Add Weapon</p>
              <input
                type="text"
                placeholder="Weapon name (optional)"
                value={wepName}
                onChange={(e) => setWepName(e.target.value)}
                className={inputClass}
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-0.5">Attacks</label>
                  <input
                    type="text"
                    value={wepAttacks}
                    onChange={(e) => setWepAttacks(e.target.value)}
                    placeholder="2 or D6"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-0.5">Skill</label>
                  <select value={wepSkill} onChange={(e) => setWepSkill(parseInt(e.target.value))} className={inputClass}>
                    <option value="2">2+</option>
                    <option value="3">3+</option>
                    <option value="4">4+</option>
                    <option value="5">5+</option>
                    <option value="6">6+</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-0.5">Strength</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={wepStrength}
                    onChange={(e) => setWepStrength(parseInt(e.target.value) || 1)}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-0.5">AP</label>
                  <select value={wepAp} onChange={(e) => setWepAp(parseInt(e.target.value))} className={inputClass}>
                    <option value="0">0</option>
                    <option value="1">-1</option>
                    <option value="2">-2</option>
                    <option value="3">-3</option>
                    <option value="4">-4</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-0.5">Damage</label>
                  <input
                    type="text"
                    value={wepDamage}
                    onChange={(e) => setWepDamage(e.target.value)}
                    placeholder="1 or D6"
                    className={inputClass}
                  />
                </div>
              </div>
              <button
                onClick={handleAddWeapon}
                className="w-full py-1.5 rounded-lg bg-slate-800 text-amber-400 text-sm font-medium hover:bg-slate-700 transition-colors"
              >
                + Add Weapon
              </button>
            </div>
          </div>

          {/* Defender — Stats */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Defender: {defenderName}
            </h2>

            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-0.5">Toughness</label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={defToughness}
                    onChange={(e) => setDefToughness(parseInt(e.target.value) || 1)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-0.5">Save</label>
                  <select value={defSave} onChange={(e) => setDefSave(parseInt(e.target.value))} className={inputClass}>
                    <option value="2">2+</option>
                    <option value="3">3+</option>
                    <option value="4">4+</option>
                    <option value="5">5+</option>
                    <option value="6">6+</option>
                    <option value="7">None</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-0.5">Wounds</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={defWounds}
                    onChange={(e) => setDefWounds(parseInt(e.target.value) || 1)}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-0.5">Models</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={defModels}
                    onChange={(e) => setDefModels(Math.max(1, parseInt(e.target.value) || 1))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-0.5">Invuln</label>
                  <select
                    value={defInvuln ?? ''}
                    onChange={(e) => setDefInvuln(e.target.value ? parseInt(e.target.value) : undefined)}
                    className={inputClass}
                  >
                    <option value="">None</option>
                    <option value="2">2+</option>
                    <option value="3">3+</option>
                    <option value="4">4+</option>
                    <option value="5">5+</option>
                    <option value="6">6+</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-0.5">FNP</label>
                  <select
                    value={defFnp ?? ''}
                    onChange={(e) => setDefFnp(e.target.value ? parseInt(e.target.value) : undefined)}
                    className={inputClass}
                  >
                    <option value="">None</option>
                    <option value="4">4+</option>
                    <option value="5">5+</option>
                    <option value="6">6+</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Special rules */}
        <SpecialRulesEditor
          rules={specialRules}
          onAdd={(rule) => setSpecialRules((prev) => [...prev, rule])}
          onRemove={(index) => setSpecialRules((prev) => prev.filter((_, i) => i !== index))}
        />

        {/* Run button */}
        <button
          disabled={weapons.length === 0}
          onClick={handleRunClick}
          className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {weapons.length === 0 ? 'Add a weapon to simulate' : 'Run Simulation'}
        </button>

        {/* Result */}
        {simData && (
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
