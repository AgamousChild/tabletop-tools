import { trpc } from '../lib/trpc'

export function SessionsPage() {
  const { data, isLoading, error } = trpc.stats.activeSessions.useQuery()

  if (isLoading) {
    return <p className="text-slate-400">Loading sessions...</p>
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
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Active Sessions</h2>
        <p className="text-slate-400">No active sessions.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-100 mb-4">
        Active Sessions <span className="text-slate-400 font-normal text-sm">({data.length})</span>
      </h2>
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">User</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Email</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">IP</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Expires</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id} className="border-b border-slate-800/50 last:border-0">
                <td className="px-4 py-3 text-slate-100">{s.userName}</td>
                <td className="px-4 py-3 text-slate-300">{s.userEmail}</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{s.ipAddress ?? '—'}</td>
                <td className="px-4 py-3 text-slate-400">
                  {s.expiresAt ? formatDate(s.expiresAt) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatDate(ts: Date | number | string): string {
  const d = ts instanceof Date ? ts : new Date(typeof ts === 'number' ? ts * 1000 : ts)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
