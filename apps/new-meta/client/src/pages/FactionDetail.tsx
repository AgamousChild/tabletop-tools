import { trpc } from '../lib/trpc'
import { ListCard } from '../components/ListCard'

interface Props {
  faction: string
  onBack: () => void
}

export function FactionDetail({ faction, onBack }: Props) {
  const { data, isLoading } = trpc.meta.faction.useQuery({ faction })

  if (isLoading) {
    return <p className="text-slate-400 text-sm">Loading…</p>
  }

  if (!data || !data.stat) {
    return (
      <div>
        <button
          onClick={onBack}
          className="text-amber-400 text-sm hover:text-amber-300 mb-4 flex items-center gap-1"
        >
          ← Back
        </button>
        <p className="text-slate-400">No data for {faction}.</p>
      </div>
    )
  }

  const { stat, detachments, topLists } = data

  return (
    <div className="space-y-8">
      <div>
        <button
          onClick={onBack}
          className="text-amber-400 text-sm hover:text-amber-300 mb-4 flex items-center gap-1"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-semibold text-slate-100">{faction}</h1>
        <div className="flex gap-6 mt-2 text-sm text-slate-400">
          <span>
            Win rate:{' '}
            <span className="text-slate-100 font-mono">
              {(stat.winRate * 100).toFixed(1)}%
            </span>
          </span>
          <span>
            Games: <span className="text-slate-100 font-mono">{stat.games}</span>
          </span>
          <span>
            Players: <span className="text-slate-100 font-mono">{stat.players}</span>
          </span>
          <span>
            Rep:{' '}
            <span className="text-slate-100 font-mono">
              {(stat.representationPct * 100).toFixed(1)}%
            </span>
          </span>
        </div>
      </div>

      {detachments.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-slate-200 mb-3">Detachments</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-left">
                <th className="pb-2 pr-4">Detachment</th>
                <th className="pb-2 pr-4 text-right">Win%</th>
                <th className="pb-2 pr-4 text-right">W</th>
                <th className="pb-2 pr-4 text-right">L</th>
                <th className="pb-2 text-right">Games</th>
              </tr>
            </thead>
            <tbody>
              {detachments.map((d) => (
                <tr key={d.detachment} className="border-b border-slate-800/50">
                  <td className="py-1.5 pr-4 text-slate-100">{d.detachment}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-300">
                    {(d.winRate * 100).toFixed(1)}%
                  </td>
                  <td className="py-1.5 pr-4 text-right text-slate-400">{d.wins}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-400">{d.losses}</td>
                  <td className="py-1.5 text-right text-slate-400">{d.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {topLists.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-slate-200 mb-3">Top Lists</h2>
          <div className="space-y-3">
            {topLists.map((list, i) => (
              <ListCard
                key={`${list.eventName}-${list.placement}-${i}`}
                list={list}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
