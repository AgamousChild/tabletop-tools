import { SkeletonTable } from '@tabletop-tools/ui'

import { trpc } from '../lib/trpc'

interface Props {
  onTournamentSelect: (eventId: string) => void
}

export function SourceData({ onTournamentSelect }: Props) {
  const { data: tournaments = [], isLoading } = trpc.source.tournaments.useQuery({ limit: 100 })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Source Data</h1>
        <p className="text-slate-400 text-sm mt-1">
          {tournaments.length} tournaments from BCP and manual imports.
        </p>
      </div>

      {isLoading ? (
        <SkeletonTable rows={12} columns={5} />
      ) : tournaments.length === 0 ? (
        <p className="text-slate-400 text-sm">No tournaments imported yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-left text-xs">
              <th className="pb-2 pr-4">Event</th>
              <th className="pb-2 pr-4">Date</th>
              <th className="pb-2 pr-4">Format</th>
              <th className="pb-2 pr-4">Location</th>
              <th className="pb-2 pr-3 text-right">Players</th>
              <th className="pb-2 pr-3 text-right">Rounds</th>
              <th className="pb-2">Winner</th>
            </tr>
          </thead>
          <tbody>
            {tournaments.map((t) => (
              <tr
                key={t.eventId}
                className="border-b border-slate-800/50 hover:bg-slate-900 cursor-pointer"
                onClick={() => onTournamentSelect(t.eventId)}
              >
                <td className="py-2 pr-4 text-slate-100 font-medium">{t.eventName}</td>
                <td className="py-2 pr-4 text-slate-400 text-xs">
                  {t.eventDate ? new Date(t.eventDate).toLocaleDateString() : '—'}
                </td>
                <td className="py-2 pr-4">
                  <FormatBadge format={t.format} />
                </td>
                <td className="py-2 pr-4 text-slate-500 text-xs max-w-[200px] truncate">
                  {t.location || '—'}
                </td>
                <td className="py-2 pr-3 text-right text-slate-400">{t.playerCount}</td>
                <td className="py-2 pr-3 text-right text-slate-400">{t.rounds || '—'}</td>
                <td className="py-2 text-slate-300 text-xs">{t.winnerFaction || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function FormatBadge({ format }: { format: string }) {
  const color =
    format === 'Super Major'
      ? 'text-amber-400 bg-amber-400/10'
      : format === 'Major'
        ? 'text-purple-400 bg-purple-400/10'
        : 'text-slate-400 bg-slate-800'
  return <span className={`text-xs px-1.5 py-0.5 rounded ${color}`}>{format}</span>
}
