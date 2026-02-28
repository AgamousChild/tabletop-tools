import { trpc } from '../lib/trpc'

const APP_LABELS: Record<string, string> = {
  'no-cheat': 'No Cheat',
  'versus': 'Versus',
  'list-builder': 'List Builder',
  'game-tracker': 'Game Tracker',
  'tournament': 'Tournament',
  'new-meta': 'New Meta',
}

export function ActivityPage() {
  const { data, isLoading, error } = trpc.stats.appActivity.useQuery()

  if (isLoading) {
    return <p className="text-slate-400">Loading activity...</p>
  }

  if (error) {
    return (
      <div className="bg-red-950 border border-red-800 rounded-lg p-4">
        <p className="text-red-400">{error.message}</p>
      </div>
    )
  }

  if (!data) return null

  const maxTotal = Math.max(...data.map((d) => d.total), 1)

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-100 mb-4">App Activity</h2>
      <p className="text-xs text-slate-500 mb-4">
        Usage breakdown per app, showing total records and activity in the last 7 days.
      </p>
      <div className="space-y-3">
        {data.map((entry) => (
          <div key={entry.app} className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-100">
                {APP_LABELS[entry.app] ?? entry.app}
              </span>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-300">{entry.total} total</span>
                <span className="text-amber-400">{entry.recent} this week</span>
              </div>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div
                className="bg-amber-400 h-2 rounded-full transition-all"
                style={{ width: `${(entry.total / maxTotal) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
