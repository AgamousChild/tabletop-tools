import { ArmyList, type ArmyListLayout, type ArmyPackage } from './ArmyList'

interface ListResult {
  eventName: string
  eventDate: string
  placement: number
  faction: string
  detachment?: string
  listText?: string
  /** The parsed army. Null when the row predates the parser or failed to parse. */
  listTtt?: ArmyPackage | null
  wins: number
  losses: number
  draws: number
  points: number
}

interface Props {
  list: ListResult
  layout: ArmyListLayout
}

export function ListCard({ list, layout }: Props) {
  const record = `${list.wins}W ${list.losses}L${list.draws > 0 ? ` ${list.draws}D` : ''}`
  const parsed = list.listTtt
  // The parser reads the total off the list header; fall back to summing the
  // units when it couldn't, and show nothing rather than a bogus "0pts".
  const points =
    parsed?.meta.totalPoints ||
    parsed?.list.units.reduce((sum, u) => sum + u.points, 0) ||
    list.points

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-semibold text-sm">#{list.placement}</span>
            <span className="text-slate-100 font-medium">{list.faction}</span>
            {list.detachment && <span className="text-slate-400 text-sm">· {list.detachment}</span>}
          </div>
          <div className="text-slate-500 text-xs mt-0.5">
            {list.eventName} · {new Date(list.eventDate).toLocaleDateString()}
          </div>
        </div>
        <div className="text-right">
          <div className="text-slate-300 text-sm font-mono">{record}</div>
          {points > 0 && <div className="text-slate-500 text-xs">{points}pts</div>}
        </div>
      </div>

      {parsed ? (
        <details className="mt-3">
          <summary className="text-amber-400 text-xs cursor-pointer hover:text-amber-300">
            View list
          </summary>
          <ArmyList pkg={parsed} layout={layout} />
        </details>
      ) : list.listText ? (
        // No stored parse — 6,504 of 36,223 lists fail to parse, mostly pasted
        // HTML and freeform text. Raw is still better than nothing, but BCP
        // strips the newlines so it reads as one run-on block; break-words at
        // least keeps it inside the card.
        <details className="mt-3">
          <summary className="text-slate-500 text-xs cursor-pointer hover:text-slate-400">
            View raw list (unparsed)
          </summary>
          <pre className="mt-2 text-slate-400 text-xs font-mono whitespace-pre-wrap break-words bg-slate-950 rounded p-3 max-h-64 overflow-y-auto">
            {list.listText}
          </pre>
        </details>
      ) : (
        <p className="text-slate-600 text-xs mt-3">No list submitted</p>
      )}
    </div>
  )
}
