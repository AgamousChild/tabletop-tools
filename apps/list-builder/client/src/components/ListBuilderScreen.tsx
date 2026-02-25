import { useState } from 'react'

import { authClient } from '../lib/auth'
import { trpcClient } from '../lib/trpc'
import { useUnits, useGameFactions } from '../lib/useGameData'
import {
  createList as createListInDb,
  addListUnit as addListUnitInDb,
  removeListUnit as removeListUnitInDb,
  updateList as updateListInDb,
  deleteList as deleteListInDb,
  useLists,
  useList,
} from '@tabletop-tools/game-data-store'
import type { LocalListUnit } from '@tabletop-tools/game-data-store'
import { RatingBadge } from './RatingBadge'

type Props = {
  onSignOut: () => void
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function ListBuilderScreen({ onSignOut }: Props) {
  const [selectedFaction, setSelectedFaction] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [newListName, setNewListName] = useState('')
  const [suggestion, setSuggestion] = useState<{
    addedName: string
    addedRating: string | null
    altName: string
    altRating: string | null
    altUnitContentId: string
  } | null>(null)

  const { data: factions = [] } = useGameFactions()
  const { data: units = [], isLoading: unitsLoading } = useUnits(
    { faction: selectedFaction || undefined, name: searchQuery || undefined },
    Boolean(selectedFaction || searchQuery),
  )
  const { data: myLists, refetch: refetchLists } = useLists()
  const { data: activeList, refetch: refetchActiveList } = useList(activeListId)

  async function handleCreateList() {
    if (!newListName.trim() || !selectedFaction) return
    const id = generateId()
    const now = Date.now()
    await createListInDb({
      id,
      faction: selectedFaction,
      name: newListName.trim(),
      totalPts: 0,
      createdAt: now,
      updatedAt: now,
    })
    setActiveListId(id)
    setNewListName('')
    refetchLists()
  }

  async function handleAddUnit(unitId: string, unitName: string, unitPoints: number) {
    if (!activeListId || !activeList) return
    const luId = generateId()
    await addListUnitInDb({
      id: luId,
      listId: activeListId,
      unitContentId: unitId,
      unitName,
      unitPoints,
      count: 1,
    })
    await updateListInDb(activeListId, {
      totalPts: activeList.totalPts + unitPoints,
      updatedAt: Date.now(),
    })
    refetchActiveList()
    refetchLists()

    // Fetch alternatives and show suggestion
    try {
      const alternatives = await trpcClient.rating.alternatives.query({})

      // Find best alternative that isn't the unit we just added
      const best = alternatives.find(
        (alt: { unitContentId: string }) => alt.unitContentId !== unitId,
      )
      if (!best) {
        setSuggestion(null)
        return
      }

      // Fetch the added unit's rating for comparison
      const addedRating = await trpcClient.rating.get.query({ unitId })

      setSuggestion({
        addedName: unitName,
        addedRating: addedRating?.rating ?? null,
        altName: best.unitContentId,
        altRating: best.rating,
        altUnitContentId: best.unitContentId,
      })
    } catch {
      setSuggestion(null)
    }
  }

  async function handleRemoveUnit(listUnitId: string, unitPoints: number, count: number) {
    if (!activeListId || !activeList) return
    await removeListUnitInDb(listUnitId)
    await updateListInDb(activeListId, {
      totalPts: Math.max(0, activeList.totalPts - unitPoints * count),
      updatedAt: Date.now(),
    })
    refetchActiveList()
    refetchLists()
  }

  async function handleDeleteList() {
    if (!activeListId || !activeList) return
    if (!confirm(`Delete "${activeList.name}"?`)) return
    await deleteListInDb(activeListId)
    setActiveListId(null)
    refetchLists()
  }

  async function handleSignOut() {
    await authClient.signOut()
    onSignOut()
  }

  function exportList(): string {
    if (!activeList) return ''
    const lines: string[] = [
      `++ ${activeList.faction} [${activeList.totalPts}pts] ++`,
      `[List] ${activeList.name}`,
      '',
    ]
    for (const unit of activeList.units) {
      const count = unit.count > 1 ? `${unit.count}x ` : ''
      lines.push(`${count}${unit.unitName} [${unit.unitPoints * unit.count}pts]`)
    }
    lines.push('')
    lines.push(`++ Total: [${activeList.totalPts}pts] ++`)
    return lines.join('\n')
  }

  function handleExport() {
    const text = exportList()
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback: open in new window
      const w = window.open('')
      w?.document.write(`<pre>${text}</pre>`)
    })
  }

  // Build a map of ratings for active list units
  const unitRatings = new Map<string, { rating: string; winContrib: number } | null>()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-amber-400">List Builder</h1>
        <button
          onClick={() => void handleSignOut()}
          className="text-slate-400 hover:text-slate-100 text-sm"
        >
          Sign out
        </button>
      </header>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Left: Unit Browser */}
        <div className="w-1/2 border-r border-slate-800 flex flex-col">
          <div className="p-4 space-y-3 border-b border-slate-800">
            <select
              value={selectedFaction}
              onChange={(e) => setSelectedFaction(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100"
              aria-label="Select faction"
            >
              <option value="">All factions</option>
              {factions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search units…"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {unitsLoading && (
              <p className="text-slate-500 text-sm">Loading units…</p>
            )}
            {!unitsLoading && units.length === 0 && (selectedFaction || searchQuery) && (
              <p className="text-slate-500 text-sm">No units found.</p>
            )}
            {!selectedFaction && !searchQuery && (
              <p className="text-slate-500 text-sm">Select a faction or search to browse units.</p>
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
                  <div className="text-sm text-slate-400 mt-0.5">
                    {unit.points}pts · {unit.faction}
                  </div>
                </div>
                <button
                  onClick={() => void handleAddUnit(unit.id, unit.name, unit.points)}
                  disabled={!activeListId}
                  className="ml-3 px-3 py-1 rounded bg-amber-400 text-slate-950 text-sm font-semibold hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: List Panel */}
        <div className="w-1/2 flex flex-col">
          {/* List selector / creator */}
          <div className="p-4 border-b border-slate-800 space-y-3">
            <select
              value={activeListId ?? ''}
              onChange={(e) => setActiveListId(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100"
              aria-label="Select list"
            >
              <option value="">— select a list —</option>
              {myLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.faction}) · {l.totalPts}pts
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="New list name…"
                className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
              <button
                onClick={() => void handleCreateList()}
                disabled={!newListName.trim() || !selectedFaction}
                className="px-4 py-2 rounded-lg bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
              >
                Create
              </button>
            </div>
          </div>

          {/* Active list */}
          {activeList && (
            <div className="flex-1 overflow-y-auto flex flex-col">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-100">{activeList.name}</h2>
                  <p className="text-sm text-slate-400">{activeList.faction}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-amber-400">{activeList.totalPts}pts</p>
                </div>
              </div>

              {/* Suggestion banner */}
              {suggestion && (
                <div className="mx-4 mt-3 p-3 rounded-lg bg-slate-800 border border-amber-400/30 text-sm">
                  <p className="text-slate-400">You added: <span className="text-slate-100">{suggestion.addedName}</span> <RatingBadge rating={suggestion.addedRating} /></p>
                  <p className="text-amber-400 mt-1">
                    Better option: <span className="text-slate-100">{suggestion.altName}</span> <RatingBadge rating={suggestion.altRating} />
                  </p>
                </div>
              )}

              {/* Unit list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {activeList.units.length === 0 && (
                  <p className="text-slate-500 text-sm">No units yet. Add units from the left panel.</p>
                )}
                {activeList.units.map((unit: LocalListUnit) => (
                  <div
                    key={unit.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-100">{unit.unitName}</span>
                        <RatingBadge rating={unitRatings.get(unit.unitContentId)?.rating ?? null} />
                      </div>
                      <div className="text-sm text-slate-400 mt-0.5">
                        {unit.unitPoints * unit.count}pts
                        {unit.count > 1 && ` (${unit.count}×${unit.unitPoints})`}
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        void handleRemoveUnit(unit.id, unit.unitPoints, unit.count)
                      }
                      className="ml-3 px-2 py-1 rounded bg-slate-700 text-slate-400 hover:bg-red-900 hover:text-red-400 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Footer: export + delete */}
              <div className="p-4 border-t border-slate-800 flex gap-3">
                <button
                  onClick={handleExport}
                  className="flex-1 py-2 rounded-lg bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 text-sm"
                >
                  Export list
                </button>
                <button
                  onClick={() => void handleDeleteList()}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-red-400 hover:bg-red-900 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          {!activeList && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-slate-500 text-sm">Select or create a list to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
