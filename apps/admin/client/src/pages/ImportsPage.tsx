import { trpc } from '../lib/trpc'

export function ImportsPage() {
  const { data, isLoading, error } = trpc.stats.importHistory.useQuery({ limit: 50 })

  if (isLoading) {
    return <p className="text-slate-400">Loading imports...</p>
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
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Tournament Imports</h2>
        <p className="text-slate-400">No tournament data imported yet.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-100 mb-4">
        Tournament Imports <span className="text-slate-400 font-normal text-sm">({data.length})</span>
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        History of tournament CSV imports used to compute meta analytics and Glicko-2 ratings.
      </p>
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Event</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Format</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Meta Window</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">Players</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Imported</th>
            </tr>
          </thead>
          <tbody>
            {data.map((imp) => (
              <tr key={imp.id} className="border-b border-slate-800/50 last:border-0">
                <td className="px-4 py-3 text-slate-100">{imp.eventName}</td>
                <td className="px-4 py-3 text-slate-300">
                  <span className="inline-block px-2 py-0.5 text-xs bg-slate-800 rounded">
                    {formatLabel(imp.format)}
                  </span>
                </td>
                <td className="px-4 py-3 text-amber-400 font-mono text-xs">{imp.metaWindow}</td>
                <td className="px-4 py-3 text-slate-100 text-right font-mono">{imp.playerCount}</td>
                <td className="px-4 py-3 text-slate-400">{formatTs(imp.importedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatLabel(format: string): string {
  const labels: Record<string, string> = {
    'bcp-csv': 'BCP',
    'tabletop-admiral-csv': 'TA',
    'generic-csv': 'Generic',
  }
  return labels[format] ?? format
}

function formatTs(ts: number): string {
  // App tables store ms timestamps
  const d = new Date(ts > 1e12 ? ts : ts * 1000)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
