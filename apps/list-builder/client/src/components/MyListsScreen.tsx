import { useLists } from '@tabletop-tools/game-data-store'
import type { LocalList } from '@tabletop-tools/game-data-store'

type Props = {
  onCreateNew: () => void
  onSelectList: (list: LocalList) => void
}

export function MyListsScreen({ onCreateNew, onSelectList }: Props) {
  const { data: lists } = useLists()

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">My Army Lists</h2>

      {lists.length === 0 && (
        <p className="text-slate-500 text-sm">No lists yet. Create your first army list to get started.</p>
      )}

      <div className="space-y-3">
        {lists.map((list) => (
          <button
            key={list.id}
            onClick={() => onSelectList(list)}
            className="w-full text-left p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-400/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-100">{list.name}</p>
                <p className="text-sm text-slate-400 mt-0.5">{list.faction}</p>
              </div>
              <p className="text-lg font-bold text-amber-400 tabular-nums">{list.totalPts}pts</p>
            </div>
          </button>
        ))}
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
