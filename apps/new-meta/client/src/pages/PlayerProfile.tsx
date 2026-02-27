import { useMemo } from 'react'
import { trpc } from '../lib/trpc'

interface Props {
  playerId: string
  onBack: () => void
}

export function PlayerProfile({ playerId, onBack }: Props) {
  const { data, isLoading } = trpc.player.profile.useQuery({ playerId })

  const sortedHistory = useMemo(() => {
    if (!data?.history) return []
    return [...data.history].sort(
      (a, b) => (a.recordedAt ?? 0) - (b.recordedAt ?? 0),
    )
  }, [data?.history])

  if (isLoading) {
    return <p className="text-slate-400 text-sm">Loading…</p>
  }

  if (!data) {
    return (
      <div>
        <button
          onClick={onBack}
          className="text-amber-400 text-sm hover:text-amber-300 mb-4"
        >
          ← Back
        </button>
        <p className="text-slate-400">Player not found.</p>
      </div>
    )
  }

  const { player, history } = data
  const maxRating = Math.max(...sortedHistory.map((h) => h.ratingAfter), player.rating)
  const minRating = Math.min(...sortedHistory.map((h) => h.ratingAfter), player.rating)
  const range = Math.max(maxRating - minRating, 100)

  return (
    <div className="space-y-8">
      <div>
        <button
          onClick={onBack}
          className="text-amber-400 text-sm hover:text-amber-300 mb-4"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-semibold text-slate-100">{player.playerName}</h1>
        <div className="flex gap-6 mt-2 text-sm text-slate-400">
          <span>
            Rating:{' '}
            <span className="text-slate-100 font-mono">{player.displayRating}</span>
            <span className="text-slate-500"> ± {player.displayBand}</span>
          </span>
          <span>
            Games: <span className="text-slate-100 font-mono">{player.gamesPlayed}</span>
          </span>
        </div>
      </div>

      {/* Rating History Chart */}
      {sortedHistory.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-slate-200 mb-3">Rating History</h2>
          <div className="flex items-end gap-0.5 h-32">
            {sortedHistory.map((h, i) => {
              const pct = ((h.ratingAfter - minRating) / range) * 100
              const height = Math.max(pct, 4)
              const color = h.ratingAfter >= 1500 ? 'bg-emerald-400' : 'bg-amber-400'
              return (
                <div
                  key={h.id ?? i}
                  className="flex flex-col items-center justify-end flex-1 min-w-0 h-full"
                  title={`${Math.round(h.ratingAfter)} (${h.eventName ?? ''})`}
                >
                  <div
                    className={`w-full rounded-t ${color} opacity-80`}
                    style={{ height: `${height}%` }}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-1 text-xs text-slate-600">
            <span>{Math.round(minRating)}</span>
            <span>{Math.round(maxRating)}</span>
          </div>
        </section>
      )}

      {/* Recent Events */}
      {history.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-slate-200 mb-3">Recent Events</h2>
          <div className="space-y-1.5">
            {history.slice(0, 20).map((h, i) => (
              <div
                key={h.id ?? i}
                className="flex justify-between items-center text-sm px-3 py-1.5 rounded bg-slate-900 border border-slate-800"
              >
                <div>
                  <span className="text-slate-300">{h.eventName ?? 'Unknown event'}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400 font-mono">
                    {Math.round(h.ratingAfter)}
                    {' '}
                    <span className={h.ratingAfter > (h.ratingBefore ?? 1500) ? 'text-emerald-400' : 'text-red-400'}>
                      ({h.ratingAfter > (h.ratingBefore ?? 1500) ? '+' : ''}{Math.round(h.ratingAfter - (h.ratingBefore ?? 1500))})
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
