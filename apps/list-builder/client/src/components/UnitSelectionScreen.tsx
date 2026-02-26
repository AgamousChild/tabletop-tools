import { useState, useCallback, useRef, useEffect } from 'react'

import { trpcClient } from '../lib/trpc'
import { useUnits, useUnitModelOptions } from '../lib/useGameData'
import {
  addListUnit as addListUnitInDb,
  removeListUnit as removeListUnitInDb,
  updateList as updateListInDb,
  deleteList as deleteListInDb,
  useList,
} from '@tabletop-tools/game-data-store'
import type { LocalListUnit } from '@tabletop-tools/game-data-store'
import { RatingBadge } from './RatingBadge'
import { validateArmy } from '../lib/armyRules'
import type { BattleSize, ValidationError } from '../lib/armyRules'
import { syncListToServer, deleteListFromServer } from '../lib/sync'
import type { ModelOption } from '../lib/modelOptions'

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
    // Single or no options — add immediately at default/first cost
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

export function UnitSelectionScreen({ listId, faction, detachment, battleSize, onDone, onBack }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestion, setSuggestion] = useState<{
    addedName: string
    addedRating: string | null
    altName: string
    altRating: string | null
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

  // Initialize name/desc from loaded list data
  useEffect(() => {
    if (activeList && !nameInitialized.current) {
      setNameValue(activeList.name)
      setDescValue(activeList.description ?? '')
      nameInitialized.current = true
    }
  }, [activeList])

  const listUnits = activeList?.units ?? []
  const totalPts = listUnits.reduce((sum, u) => sum + u.unitPoints * u.count, 0)
  const remaining = battleSize.points - totalPts

  const errors: ValidationError[] = activeList
    ? validateArmy(
        listUnits.map((u) => ({
          unitContentId: u.unitContentId,
          unitName: u.unitName,
          unitPoints: u.unitPoints,
          count: u.count,
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

    // Fetch alternatives and show suggestion
    try {
      const alternatives = await trpcClient.rating.alternatives.query({})
      const best = alternatives.find(
        (alt: { unitContentId: string }) => alt.unitContentId !== unitId,
      )
      if (!best) {
        setSuggestion(null)
        return
      }
      const addedRating = await trpcClient.rating.get.query({ unitId })
      setSuggestion({
        addedName: unitName,
        addedRating: addedRating?.rating ?? null,
        altName: best.unitContentId,
        altRating: best.rating,
      })
    } catch {
      setSuggestion(null)
    }
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
    for (const unit of listUnits) {
      const count = unit.count > 1 ? `${unit.count}x ` : ''
      lines.push(`${count}${unit.unitName} [${unit.unitPoints * unit.count}pts]`)
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
      {errors.filter((e) => e.type !== 'NO_WARLORD').map((err, i) => (
        <div key={i} className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/30 text-sm text-red-400">
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
                    <RatingBadge rating={null} />
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">{unit.points}pts</p>
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
              <p className="text-amber-400 mt-1">
                Better option: <span className="text-slate-100">{suggestion.altName}</span> <RatingBadge rating={suggestion.altRating} />
              </p>
            </div>
          )}

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {listUnits.length === 0 && (
              <p className="text-slate-500 text-sm">No units yet. Add units from the left panel.</p>
            )}
            {listUnits.map((unit: LocalListUnit) => (
              <div
                key={unit.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800"
              >
                <div>
                  <span className="font-medium text-slate-100">{unit.unitName}</span>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {unit.unitPoints * unit.count}pts
                    {unit.count > 1 && ` (${unit.count}x${unit.unitPoints})`}
                    {unit.modelCount && ` · ${unit.modelCount} models`}
                  </p>
                </div>
                <button
                  onClick={() => void handleRemoveUnit(unit.id, unit.unitPoints, unit.count)}
                  className="ml-3 px-2 py-1 rounded bg-slate-700 text-slate-400 hover:bg-red-900 hover:text-red-400 text-sm"
                >
                  Remove
                </button>
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
