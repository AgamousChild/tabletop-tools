import { trpc } from '../lib/trpc'

interface Props {
  onTournamentSelect: (importId: string) => void
}

export function SourceData({ onTournamentSelect }: Props) {
  const { data: tournaments = [], isLoading } = trpc.source.tournaments.useQuery({ limit: 50 })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Source Data</h1>
        <p className="text-slate-400 text-sm mt-1">
          Every imported tournament result — publicly viewable and downloadable.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Click a tournament row to view full results with player lists. You can download data as JSON or CSV.
        </p>
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : tournaments.length === 0 ? (
        <p className="text-slate-400 text-sm">No tournaments imported yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-left">
              <th className="pb-2 pr-4">Event</th>
              <th className="pb-2 pr-4">Date</th>
              <th className="pb-2 pr-4">Format</th>
              <th className="pb-2 pr-4">Meta</th>
              <th className="pb-2 text-right">Players</th>
            </tr>
          </thead>
          <tbody>
            {tournaments.map((t) => (
              <tr
                key={t.importId}
                className="border-b border-slate-800/50 hover:bg-slate-900 cursor-pointer"
                onClick={() => onTournamentSelect(t.importId)}
              >
                <td className="py-2 pr-4 text-slate-100 font-medium">{t.eventName}</td>
                <td className="py-2 pr-4 text-slate-400">
                  {new Date(t.eventDate).toLocaleDateString()}
                </td>
                <td className="py-2 pr-4 text-slate-400">{t.format}</td>
                <td className="py-2 pr-4 text-slate-400">{t.metaWindow}</td>
                <td className="py-2 text-right text-slate-400">{t.playerCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
