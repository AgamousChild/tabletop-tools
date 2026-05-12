import { trpc } from '../lib/trpc'

interface Props {
  importId: string
  onBack: () => void
}

export function TournamentDetail({ importId, onBack }: Props) {
  const { data, isLoading } = trpc.source.tournament.useQuery({ eventId: importId })

  if (isLoading) {
    return <p className="text-slate-400 text-sm">Loading...</p>
  }

  if (!data) {
    return (
      <div>
        <button onClick={onBack} className="text-amber-400 text-sm hover:text-amber-300 mb-4">
          &larr; Back
        </button>
        <p className="text-slate-400">Tournament not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <button onClick={onBack} className="text-amber-400 text-sm hover:text-amber-300 mb-4">
          &larr; Back to source data
        </button>
        <h1 className="text-2xl font-semibold text-slate-100">{data.eventName}</h1>
        <div className="flex gap-4 mt-2 text-sm text-slate-400">
          <span>{data.eventDate ? new Date(data.eventDate).toLocaleDateString() : '—'}</span>
          <FormatBadge format={data.format} />
          <span>{data.playerCount} players</span>
          {data.rounds && <span>{data.rounds} rounds</span>}
          {data.location && <span className="text-slate-500">{data.location}</span>}
        </div>
        {data.winnerFaction && (
          <p className="text-xs text-amber-400 mt-1">Winner: {data.winnerFaction}</p>
        )}
      </div>

      {data.winDistribution.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-slate-300 mb-2">Win Distribution</h2>
          <div className="flex items-end gap-1 h-20">
            {data.winDistribution.map((d) => {
              const height = Math.max(d.playerPct * 100 * 3, 4) // scale up for visibility
              return (
                <div
                  key={d.wins}
                  className="flex flex-col items-center flex-1"
                  title={`${d.wins} wins: ${d.playerCount} players (${(d.playerPct * 100).toFixed(1)}%)`}
                >
                  <div
                    className="w-full rounded-t bg-amber-400 opacity-70"
                    style={{ height: `${Math.min(height, 100)}%` }}
                  />
                  <span className="text-xs text-slate-600 mt-0.5">{d.wins}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-slate-300 mb-2">Results</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-left text-xs">
              <th className="pb-2 pr-3">#</th>
              <th className="pb-2 pr-4">Player</th>
              <th className="pb-2 pr-4">Faction</th>
              <th className="pb-2 pr-4">Detachment</th>
              <th className="pb-2 pr-3 text-right">W</th>
              <th className="pb-2 pr-3 text-right">L</th>
              <th className="pb-2 pr-3 text-right">D</th>
              <th className="pb-2">List</th>
            </tr>
          </thead>
          <tbody>
            {data.players.map((p, i) => (
              <tr key={i} className="border-b border-slate-800/50">
                <td className="py-1.5 pr-3 text-slate-500">{p.placement}</td>
                <td className="py-1.5 pr-4 text-slate-100">{p.playerName}</td>
                <td className="py-1.5 pr-4 text-slate-300">{p.faction}</td>
                <td className="py-1.5 pr-4 text-slate-400 text-xs">{p.detachment ?? '—'}</td>
                <td className="py-1.5 pr-3 text-right text-slate-300">{p.wins}</td>
                <td className="py-1.5 pr-3 text-right text-slate-300">{p.losses}</td>
                <td className="py-1.5 pr-3 text-right text-slate-300">{p.draws}</td>
                <td className="py-1.5">
                  {p.listText ? (
                    <details>
                      <summary className="text-amber-400 text-xs cursor-pointer">View</summary>
                      <pre className="mt-1 text-slate-300 text-xs font-mono whitespace-pre-wrap bg-slate-950 rounded p-2 max-w-lg overflow-x-auto">
                        {p.listText}
                      </pre>
                    </details>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function FormatBadge({ format }: { format: string }) {
  const color =
    format === 'Super Major' ? 'text-amber-400 bg-amber-400/10' :
    format === 'Major' ? 'text-purple-400 bg-purple-400/10' :
    'text-slate-400 bg-slate-800'
  return <span className={`text-xs px-1.5 py-0.5 rounded ${color}`}>{format}</span>
}
