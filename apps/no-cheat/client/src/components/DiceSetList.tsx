type DiceSet = {
  id: string
  name: string
  userId: string
  createdAt: number
}

type Props = {
  diceSets: DiceSet[]
  onSelect: (diceSet: DiceSet) => void
  onDelete: (diceSet: DiceSet) => void
}

export function DiceSetList({ diceSets, onSelect, onDelete }: Props) {
  if (diceSets.length === 0) {
    return <p className="text-slate-400 text-center py-8">No dice sets yet. Create one below.</p>
  }

  return (
    <ul className="space-y-2">
      {diceSets.map((ds) => (
        <li key={ds.id} className="flex items-center gap-2">
          <button
            onClick={() => onSelect(ds)}
            className="flex-1 text-left px-4 py-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-400 text-slate-100 transition-colors"
          >
            {ds.name}
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${ds.name}"?`)) onDelete(ds)
            }}
            className="p-2 text-slate-600 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 01.78.72l.5 6a.75.75 0 01-1.499.12l-.5-6a.75.75 0 01.72-.78zm2.84 0a.75.75 0 01.72.78l-.5 6a.75.75 0 11-1.499-.12l.5-6a.75.75 0 01.78-.72z" clipRule="evenodd" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  )
}
