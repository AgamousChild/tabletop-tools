import { useState, useMemo, useRef, useEffect } from 'react'

import { trpc, trpcClient } from '../lib/trpc'
import { useUnits, useUnitModelOptions, useGameEnhancements, useGameUnitKeywords } from '../lib/useGameData'
import {
  addListUnit as addListUnitInDb,
  removeListUnit as removeListUnitInDb,
  updateListUnit as updateListUnitInDb,
  updateList as updateListInDb,
  deleteList as deleteListInDb,
  useList,
  useUnit as useUnitProfile,
} from '@tabletop-tools/game-data-store'
import type { LocalListUnit, Enhancement } from '@tabletop-tools/game-data-store'
import { RatingBadge } from './RatingBadge'
import { validateArmy } from '../lib/armyRules'
import type { BattleSize, ValidationError } from '../lib/armyRules'
import { syncListToServer, deleteListFromServer } from '../lib/sync'

type Props = {
  listId: string
  faction: string
  detachment: string
  battleSize: BattleSize
  onDone: () => void
  onBack: () => void
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function ModelCountPicker({ unitId, unitName, defaultPoints, remaining, onSelect }: {
  unitId: string
  unitName: string
  defaultPoints: number
  remaining: number
  onSelect: (unitId: string, unitName: string, unitPoints: number, modelCount?: number) => void
}) {
  const options = useUnitModelOptions(unitId)

  if (options.length <= 1) {
    const pts = options.length === 1 ? options[0]!.points : defaultPoints
    const mc = options.length === 1 ? options[0]!.modelCount : undefined
    return (
      <button
        onClick={() => onSelect(unitId, unitName, pts, mc)}
        disabled={pts > remaining}
        className="ml-3 px-3 py-1 rounded bg-amber-400 text-slate-950 text-sm font-semibold hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Add
      </button>
    )
  }

  return (
    <div className="ml-3 flex gap-1 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.modelCount}
          onClick={() => onSelect(unitId, unitName, opt.points, opt.modelCount)}
          disabled={opt.points > remaining}
          className="px-2 py-1 rounded bg-amber-400 text-slate-950 text-xs font-semibold hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
          title={opt.description}
        >
          {opt.modelCount}m/{opt.points}pts
        </button>
      ))}
    </div>
  )
}

/** Shows keywords for a unit inline */
function UnitKeywordBadges({ unitId }: { unitId: string }) {
  const { data: keywords } = useGameUnitKeywords(unitId)
  const charKeyword = keywords.find((k) => k.keyword.toUpperCase() === 'CHARACTER')
  if (!charKeyword) return null
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-400 font-semibold">CHARACTER</span>
}

/** Enhancement picker dropdown for a character unit */
function EnhancementPicker({ unit, detachment, onSelect }: {
  unit: LocalListUnit
  detachment: string
  onSelect: (enhId: string | undefined, enhName: string | undefined, enhCost: number | undefined) => void
}) {
  const { data: enhancements } = useGameEnhancements(detachment)

  if (enhancements.length === 0) return null

  return (
    <select
      value={unit.enhancementId ?? ''}
      onChange={(e) => {
        const enh = enhancements.find((en: Enhancement) => en.id === e.target.value)
        if (enh) {
          const cost = parseInt(enh.cost) || 0
          onSelect(enh.id, enh.name, cost)
        } else {
          onSelect(undefined, undefined, undefined)
        }
      }}
      className="text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:border-amber-400"
      title="Select enhancement"
    >
      <option value="">No enhancement</option>
      {enhancements.map((enh: Enhancement) => (
        <option key={enh.id} value={enh.id}>
          {enh.name} (+{parseInt(enh.cost) || 0}pts)
        </option>
      ))}
    </select>
  )
}

/** Compact stat line for a unit (M/T/Sv/W/Ld/OC) */
function UnitStatLine({ unitContentId }: { unitContentId: string }) {
  const { data: profile } = useUnitProfile(unitContentId)
  if (!profile) return null
  return (
    <span className="text-[11px] text-slate-500 font-mono" data-testid="unit-stat-line">
      M{profile.move}" T{profile.toughness} Sv{profile.save}+{profile.invulnSave ? `/${profile.invulnSave}++` : ''} W{profile.wounds} Ld{profile.leadership}+ OC{profile.oc}
    </span>
  )
}

export function UnitSelectionScreen({ listId, faction, detachment, battleSize, onDone, onBack }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestion, setSuggestion] = useState<{
    addedName: string
    addedRating: string | null
    alternatives: Array<{ unitContentId: string; unitName: string; rating: string; points: number }>
  } | null>(null)

  // Name/description editing
  const [editingName, setEditingName] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [descValue, setDescValue] = useState('')
  const nameInitialized = useRef(false)

  const { data: units = [], isLoading: unitsLoading } = useUnits(
    { faction, name: searchQuery || undefined },
    true,
  )
  const { data: activeList, refetch: refetchList } = useList(listId)

  // Fetch all ratings for rating badges in the unit browser
  const { data: allRatings = [] } = trpc.rating.alternatives.useQuery({})
  const ratingMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of allRatings) {
      map.set(r.unitContentId, r.rating)
    }
    return map
  }, [allRatings])

  // Build a points lookup from available units
  const unitPointsMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const u of units) {
      map.set(u.id, u.points)
    }
    return map
  }, [units])

  // Initialize name/desc from loaded list data
  useEffect(() => {
    if (activeList && !nameInitialized.current) {
      setNameValue(activeList.name)
      setDescValue(activeList.description ?? '')
      nameInitialized.current = true
    }
  }, [activeList])

  const listUnits = activeList?.units ?? []
  const enhancementPtsCost = listUnits.reduce((sum, u) => sum + (u.enhancementCost ?? 0), 0)
  const totalPts = listUnits.reduce((sum, u) => sum + u.unitPoints * u.count, 0) + enhancementPtsCost
  const remaining = battleSize.points - totalPts

  const errors: ValidationError[] = activeList
    ? validateArmy(
        listUnits.map((u) => ({
          unitContentId: u.unitContentId,
          unitName: u.unitName,
          unitPoints: u.unitPoints,
          count: u.count,
          isWarlord: u.isWarlord,
        })),
        battleSize,
      )
    : []

  async function handleAddUnit(unitId: string, unitName: string, unitPoints: number, modelCount?: number) {
    if (!activeList) return
    const luId = generateId()
    await addListUnitInDb({
      id: luId,
      listId,
      unitContentId: unitId,
      unitName,
      unitPoints,
      modelCount,
      count: 1,
    })
    await updateListInDb(listId, {
      totalPts: totalPts + unitPoints,
      updatedAt: Date.now(),
    })
    refetchList()
    syncListToServer(listId)

    // Fetch alternatives filtered by similar points cost and show suggestions
    try {
      const alternatives = await trpcClient.rating.alternatives.query({})
      const addedRating = ratingMap.get(unitId) ?? null
      // Filter: different unit, similar or lower points, better rating
      const ratingOrder = ['S', 'A', 'B', 'C', 'D']
      const addedRank = addedRating ? ratingOrder.indexOf(addedRating) : 999
      const filtered = alternatives
        .filter((alt: { unitContentId: string; rating: string }) => {
          if (alt.unitContentId === unitId) return false
          const altPts = unitPointsMap.get(alt.unitContentId) ?? 0
          if (altPts === 0 || altPts > unitPoints) return false
          const altRank = ratingOrder.indexOf(alt.rating)
          return altRank < addedRank
        })
        .slice(0, 3)
        .map((alt: { unitContentId: string; rating: string }) => ({
          unitContentId: alt.unitContentId,
          unitName: alt.unitContentId, // Will be resolved from units data
          rating: alt.rating,
          points: unitPointsMap.get(alt.unitContentId) ?? 0,
        }))

      if (filtered.length > 0) {
        // Try to resolve unit names from loaded units
        for (const f of filtered) {
          const found = units.find((u) => u.id === f.unitContentId)
          if (found) f.unitName = found.name
        }
        setSuggestion({
          addedName: unitName,
          addedRating: addedRating,
          alternatives: filtered,
        })
      } else {
        setSuggestion(null)
      }
    } catch {
      setSuggestion(null)
    }
  }

  async function handleToggleWarlord(unit: LocalListUnit) {
    if (!activeList) return
    // If this unit is already warlord, toggle off. Otherwise set it and clear others.
    const newValue = !unit.isWarlord
    // Clear all warlords first
    for (const u of listUnits) {
      if (u.isWarlord) {
        await updateListUnitInDb(u.id, { isWarlord: false })
      }
    }
    // Set the new warlord
    if (newValue) {
      await updateListUnitInDb(unit.id, { isWarlord: true })
    }
    refetchList()
    syncListToServer(listId)
  }

  async function handleSetEnhancement(unit: LocalListUnit, enhId: string | undefined, enhName: string | undefined, enhCost: number | undefined) {
    if (!activeList) return
    await updateListUnitInDb(unit.id, {
      enhancementId: enhId,
      enhancementName: enhName,
      enhancementCost: enhCost,
    })
    refetchList()
    syncListToServer(listId)
  }

  async function handleRemoveUnit(listUnitId: string, unitPoints: number, count: number) {
    if (!activeList) return
    await removeListUnitInDb(listUnitId)
    await updateListInDb(listId, {
      totalPts: Math.max(0, totalPts - unitPoints * count),
      updatedAt: Date.now(),
    })
    refetchList()
    syncListToServer(listId)
  }

  async function handleDeleteList() {
    if (!activeList) return
    if (!confirm(`Delete "${activeList.name}"?`)) return
    await deleteListInDb(listId)
    deleteListFromServer(listId)
    onBack()
  }

  async function handleSaveName() {
    setEditingName(false)
    if (!activeList || nameValue === activeList.name) return
    await updateListInDb(listId, { name: nameValue, updatedAt: Date.now() })
    refetchList()
    syncListToServer(listId)
  }

  async function handleSaveDescription() {
    setEditingDesc(false)
    if (!activeList) return
    await updateListInDb(listId, { description: descValue || undefined, updatedAt: Date.now() })
    refetchList()
    syncListToServer(listId)
  }

  function exportList(): string {
    if (!activeList) return ''
    const lines: string[] = [
      `++ ${faction} — ${detachment} [${totalPts}/${battleSize.points}pts] ++`,
      `[List] ${activeList.name}`,
      '',
    ]
    const warlord = listUnits.find((u) => u.isWarlord)
    if (warlord) {
      lines.push(`Warlord: ${warlord.unitName}`)
      if (warlord.enhancementName) {
        lines.push(`  Enhancement: ${warlord.enhancementName} (+${warlord.enhancementCost ?? 0}pts)`)
      }
      lines.push('')
    }
    for (const unit of listUnits) {
      const count = unit.count > 1 ? `${unit.count}x ` : ''
      const enhStr = unit.enhancementName && !unit.isWarlord
        ? ` [${unit.enhancementName} +${unit.enhancementCost ?? 0}pts]`
        : ''
      lines.push(`${count}${unit.unitName} [${unit.unitPoints * unit.count}pts]${enhStr}`)
    }
    lines.push('')
    lines.push(`++ Total: [${totalPts}/${battleSize.points}pts] ++`)
    return lines.join('\n')
  }

  function handleExport() {
    const text = exportList()
    navigator.clipboard.writeText(text).catch(() => {
      const w = window.open('')
      w?.document.write(`<pre>${text}</pre>`)
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-200 text-sm">Back</button>
          <div>
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={() => void handleSaveName()}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveName() }}
                className="bg-slate-900 border border-amber-400 rounded px-2 py-0.5 text-slate-100 font-semibold focus:outline-none"
              />
            ) : (
              <h2
                className="font-semibold text-slate-100 cursor-pointer hover:text-amber-400"
                onClick={() => setEditingName(true)}
                title="Click to rename"
              >
                {activeList?.name ?? 'List'}
              </h2>
            )}
            <p className="text-xs text-slate-400">{faction} — {detachment}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-amber-400 tabular-nums">{totalPts}<span className="text-sm text-slate-500">/{battleSize.points}pts</span></p>
          <p className="text-xs text-slate-400">{remaining}pts remaining</p>
        </div>
      </div>

      {/* Description */}
      {editingDesc ? (
        <textarea
          autoFocus
          value={descValue}
          onChange={(e) => setDescValue(e.target.value)}
          onBlur={() => void handleSaveDescription()}
          placeholder="Add notes about this list..."
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-amber-400 text-slate-100 placeholder-slate-500 focus:outline-none text-sm resize-none"
          rows={2}
        />
      ) : (
        <button
          onClick={() => setEditingDesc(true)}
          className="text-left w-full text-sm text-slate-500 hover:text-slate-300 py-1"
        >
          {descValue || 'Add notes about this list...'}
        </button>
      )}

      {/* Validation errors */}
      {errors.map((err, i) => (
        <div key={i} className={`px-3 py-2 rounded-lg text-sm ${err.type === 'NO_WARLORD' ? 'bg-amber-900/20 border border-amber-500/30 text-amber-400' : 'bg-red-900/20 border border-red-500/30 text-red-400'}`}>
          {err.message}
        </div>
      ))}

      {/* Two-column layout */}
      <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 240px)' }}>
        {/* Left: Unit browser */}
        <div className="w-1/2 space-y-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search units..."
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {unitsLoading && <p className="text-slate-500 text-sm">Loading units...</p>}
            {!unitsLoading && units.length === 0 && (
              <p className="text-slate-500 text-sm">No units found.</p>
            )}
            {units.map((unit) => (
              <div
                key={unit.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-100">{unit.name}</span>
                    <RatingBadge rating={ratingMap.get(unit.id) ?? null} />
                    <UnitKeywordBadges unitId={unit.id} />
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">{unit.points}pts</p>
                  <UnitStatLine unitContentId={unit.id} />
                </div>
                <ModelCountPicker
                  unitId={unit.id}
                  unitName={unit.name}
                  defaultPoints={unit.points}
                  remaining={remaining}
                  onSelect={(id, name, pts, mc) => void handleAddUnit(id, name, pts, mc)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Right: Current list */}
        <div className="w-1/2 space-y-3">
          {/* Suggestion banner */}
          {suggestion && (
            <div className="p-3 rounded-lg bg-slate-800 border border-amber-400/30 text-sm">
              <p className="text-slate-400">Added: <span className="text-slate-100">{suggestion.addedName}</span> <RatingBadge rating={suggestion.addedRating} /></p>
              <p className="text-amber-400 mt-1 mb-1">Better alternatives at same or lower cost:</p>
              {suggestion.alternatives.map((alt, i) => (
                <p key={i} className="text-slate-300 ml-2">
                  {alt.unitName} ({alt.points}pts) <RatingBadge rating={alt.rating} />
                </p>
              ))}
            </div>
          )}

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {listUnits.length === 0 && (
              <p className="text-slate-500 text-sm">No units yet. Add units from the left panel.</p>
            )}
            {listUnits.map((unit: LocalListUnit) => (
              <div
                key={unit.id}
                className={`p-3 rounded-lg bg-slate-900 border ${unit.isWarlord ? 'border-amber-400' : 'border-slate-800'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-100">{unit.unitName}</span>
                      {unit.isWarlord && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-bold">WARLORD</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {unit.unitPoints * unit.count + (unit.enhancementCost ?? 0)}pts
                      {unit.count > 1 && ` (${unit.count}x${unit.unitPoints})`}
                      {unit.modelCount && ` · ${unit.modelCount} models`}
                      {unit.enhancementName && (
                        <span className="text-amber-400"> · {unit.enhancementName} +{unit.enhancementCost}pts</span>
                      )}
                    </p>
                    <UnitStatLine unitContentId={unit.unitContentId} />
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => void handleToggleWarlord(unit)}
                      title={unit.isWarlord ? 'Remove Warlord' : 'Set as Warlord'}
                      className={`px-2 py-1 rounded text-xs ${unit.isWarlord ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-700 text-slate-400 hover:bg-amber-400/20 hover:text-amber-400'}`}
                    >
                      W
                    </button>
                    <button
                      onClick={() => void handleRemoveUnit(unit.id, unit.unitPoints, unit.count)}
                      className="px-2 py-1 rounded bg-slate-700 text-slate-400 hover:bg-red-900 hover:text-red-400 text-xs"
                    >
                      X
                    </button>
                  </div>
                </div>
                {/* Enhancement picker row */}
                <div className="mt-1">
                  <EnhancementPicker
                    unit={unit}
                    detachment={detachment}
                    onSelect={(enhId, enhName, enhCost) => void handleSetEnhancement(unit, enhId, enhName, enhCost)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-3 border-t border-slate-800">
            <button
              onClick={handleExport}
              className="flex-1 py-2 rounded-lg bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 text-sm"
            >
              Export list
            </button>
            <button
              onClick={onDone}
              className="flex-1 py-2 rounded-lg border border-amber-400 text-amber-400 hover:bg-amber-400/10 font-semibold text-sm"
            >
              Done
            </button>
            <button
              onClick={() => void handleDeleteList()}
              className="px-4 py-2 rounded-lg bg-slate-800 text-red-400 hover:bg-red-900 text-sm"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
