type Roll = {
  id: string
  sessionId: string
  pipValues: string // JSON-serialized number[]
  createdAt: number
}

type Props = {
  rolls: Roll[]
}

export function RollDetail({ rolls }: Props) {
  if (rolls.length === 0) {
    return <p className="text-slate-400 text-center py-4">No rolls recorded.</p>
  }

  return (
    <ol className="space-y-1">
      {rolls.map((roll, i) => {
        const pips: number[] = JSON.parse(roll.pipValues)
        return (
          <li
            key={roll.id}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
          >
            <span className="text-slate-500 w-12 shrink-0">Roll {i + 1}</span>
            <span className="text-slate-100 font-mono">{pips.join(', ')}</span>
          </li>
        )
      })}
    </ol>
  )
}
