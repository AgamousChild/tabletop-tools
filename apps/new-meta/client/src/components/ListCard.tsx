interface ListResult {
  eventName: string
  eventDate: string
  placement: number
  faction: string
  detachment?: string
  listText?: string
  wins: number
  losses: number
  draws: number
  points: number
}

interface Props {
  list: ListResult
}

export function ListCard({ list }: Props) {
  const record = `${list.wins}W ${list.losses}L${list.draws > 0 ? ` ${list.draws}D` : ''}`

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-semibold text-sm">#{list.placement}</span>
            <span className="text-slate-100 font-medium">{list.faction}</span>
            {list.detachment && (
              <span className="text-slate-400 text-sm">· {list.detachment}</span>
            )}
          </div>
          <div className="text-slate-500 text-xs mt-0.5">
            {list.eventName} · {new Date(list.eventDate).toLocaleDateString()}
          </div>
        </div>
        <div className="text-right">
          <div className="text-slate-300 text-sm font-mono">{record}</div>
          <div className="text-slate-500 text-xs">{list.points}pts</div>
        </div>
      </div>

      {list.listText ? (
        <details className="mt-3">
          <summary className="text-amber-400 text-xs cursor-pointer hover:text-amber-300">
            View list
          </summary>
          <pre className="mt-2 text-slate-300 text-xs font-mono whitespace-pre-wrap bg-slate-950 rounded p-3 overflow-x-auto">
            {list.listText}
          </pre>
        </details>
      ) : (
        <p className="text-slate-600 text-xs mt-3">No list submitted</p>
      )}
    </div>
  )
}
