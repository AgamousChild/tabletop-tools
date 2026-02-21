type DiceSet = {
  id: string
  name: string
  userId: string
  createdAt: number
}

type Props = {
  diceSets: DiceSet[]
  onSelect: (diceSet: DiceSet) => void
}

export function DiceSetList({ diceSets, onSelect }: Props) {
  if (diceSets.length === 0) {
    return (
      <p className="text-slate-400 text-center py-8">
        No dice sets yet. Create one below.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {diceSets.map((ds) => (
        <li key={ds.id}>
          <button
            onClick={() => onSelect(ds)}
            className="w-full text-left px-4 py-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-400 text-slate-100 transition-colors"
          >
            {ds.name}
          </button>
        </li>
      ))}
    </ul>
  )
}
