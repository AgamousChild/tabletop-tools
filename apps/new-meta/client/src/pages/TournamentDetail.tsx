import { trpc } from '../lib/trpc'

interface Props {
  importId: string
  onBack: () => void
}

export function TournamentDetail({ importId, onBack }: Props) {
  const { data, isLoading } = trpc.source.tournament.useQuery({ importId })

  const handleDownload = (format: 'json' | 'csv') => {
    // Trigger download via fetch
    const url = `/trpc/source.download?batch=1&input=%7B%220%22%3A%7B%22importId%22%3A%22${encodeURIComponent(importId)}%22%2C%22format%22%3A%22${format}%22%7D%7D`
    window.open(url, '_blank')
  }

  if (isLoading) {
    return <p className="text-slate-400 text-sm">Loading…</p>
  }

  if (!data) {
    return (
      <div>
        <button onClick={onBack} className="text-amber-400 text-sm hover:text-amber-300 mb-4">
          ← Back
        </button>
        <p className="text-slate-400">Tournament not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={onBack}
          className="text-amber-400 text-sm hover:text-amber-300 mb-4 flex items-center gap-1"
        >
          ← Back to source data
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">{data.eventName}</h1>
            <p className="text-xs text-slate-500 mt-1">
              Full results table. Click "View" on a player's list to expand it. Use the download buttons to export data.
            </p>
            <div className="flex gap-4 mt-1 text-sm text-slate-400">
              <span>{new Date(data.eventDate).toLocaleDateString()}</span>
              <span>{data.format}</span>
              <span>{data.metaWindow}</span>
              <span>{data.players.length} players</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleDownload('json')}
              className="text-xs border border-slate-700 text-slate-300 hover:text-slate-100 rounded px-3 py-1.5"
            >
              ↓ JSON
            </button>
            <button
              onClick={() => handleDownload('csv')}
              className="text-xs border border-slate-700 text-slate-300 hover:text-slate-100 rounded px-3 py-1.5"
            >
              ↓ CSV
            </button>
          </div>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400 text-left">
            <th className="pb-2 pr-3">#</th>
            <th className="pb-2 pr-4">Faction</th>
            <th className="pb-2 pr-4">Detachment</th>
            <th className="pb-2 pr-3 text-right">W</th>
            <th className="pb-2 pr-3 text-right">L</th>
            <th className="pb-2 pr-3 text-right">D</th>
            <th className="pb-2 pr-3 text-right">Pts</th>
            <th className="pb-2">List</th>
          </tr>
        </thead>
        <tbody>
          {data.players.map((p, i) => (
            <tr key={i} className="border-b border-slate-800/50">
              <td className="py-1.5 pr-3 text-slate-500">{p.placement}</td>
              <td className="py-1.5 pr-4 text-slate-100">{p.faction}</td>
              <td className="py-1.5 pr-4 text-slate-400">{p.detachment ?? '—'}</td>
              <td className="py-1.5 pr-3 text-right text-slate-300">{p.wins}</td>
              <td className="py-1.5 pr-3 text-right text-slate-300">{p.losses}</td>
              <td className="py-1.5 pr-3 text-right text-slate-300">{p.draws}</td>
              <td className="py-1.5 pr-3 text-right text-slate-400">{p.points}</td>
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
    </div>
  )
}
