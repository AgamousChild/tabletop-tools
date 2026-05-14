import { trpc } from '../lib/trpc'

export function ImportsPage() {
  const { data, isLoading, error } = trpc.stats.recentEvents.useQuery({ limit: 50 })

  if (isLoading) {
    return <p className="text-slate-400">Loading events...</p>
  }

  if (error) {
    return (
      <div className="bg-red-950 border border-red-800 rounded-lg p-4">
        <p className="text-red-400">{error.message}</p>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Scraped Events</h2>
        <p className="text-slate-400">No events scraped yet.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-100 mb-4">
        Scraped Events <span className="text-slate-400 font-normal text-sm">({data.length})</span>
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        Tournament events scraped from BCP via the weekly scraper pipeline.
      </p>
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Event</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Source</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Players</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Rounds</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Location</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {data.map((evt) => (
              <tr key={evt.id} className="border-b border-slate-800/50 last:border-0">
                <td className="px-4 py-3 text-slate-100">{evt.name}</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 text-xs bg-slate-800 rounded text-slate-300">
                    {evt.source}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-100 text-right font-mono">{evt.playerCount}</td>
                <td className="px-4 py-3 text-slate-100 text-right font-mono">{evt.rounds ?? '—'}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{evt.location ?? '—'}</td>
                <td className="px-4 py-3 text-slate-400">{formatDate(evt.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatDate(ts: number): string {
  const d = new Date(ts > 1e12 ? ts : ts * 1000)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
