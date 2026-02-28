import { useState } from 'react'
import { useLists } from '@tabletop-tools/game-data-store'
import type { LocalList } from '@tabletop-tools/game-data-store'

type Props = {
  onCreateNew: () => void
  onSelectList: (list: LocalList) => void
}

function setTournamentList(list: LocalList) {
  localStorage.setItem('tournament-list', JSON.stringify({
    listId: list.id,
    name: list.name,
    faction: list.faction,
    detachment: list.detachment ?? '',
    totalPts: list.totalPts,
  }))
}

export function MyListsScreen({ onCreateNew, onSelectList }: Props) {
  const { data: lists } = useLists()
  const [tournamentListId, setTournamentListId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem('tournament-list')
      if (stored) return JSON.parse(stored).listId ?? null
    } catch { /* ignore */ }
    return null
  })

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">My Army Lists</h2>
      <p className="text-xs text-slate-500 mb-4">Tap a list to edit it, or press "+ New List" to start building. Use "Use in Tournament" to set a list as your active tournament roster.</p>

      {lists.length === 0 && (
        <p className="text-slate-500 text-sm">No lists yet. Create your first army list to get started.</p>
      )}

      <div className="space-y-3">
        {lists.map((list) => {
          const isActive = tournamentListId === list.id
          return (
            <div
              key={list.id}
              className={`p-4 rounded-xl bg-slate-900 border transition-colors ${isActive ? 'border-amber-400/50' : 'border-slate-800'}`}
            >
              <button
                onClick={() => onSelectList(list)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-100">{list.name}</p>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {list.faction}
                      {list.detachment && ` — ${list.detachment}`}
                    </p>
                    {list.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{list.description}</p>
                    )}
                  </div>
                  <p className="text-lg font-bold text-amber-400 tabular-nums">{list.totalPts}pts</p>
                </div>
              </button>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setTournamentList(list)
                    setTournamentListId(list.id)
                  }}
                  className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                    isActive
                      ? 'bg-amber-400/20 text-amber-400 border border-amber-400/30'
                      : 'bg-slate-800 text-slate-400 hover:text-amber-400 border border-slate-700'
                  }`}
                >
                  {isActive ? 'Active for Tournament' : 'Use in Tournament'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={onCreateNew}
        className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 transition-colors"
      >
        + New List
      </button>
    </div>
  )
}
