import { useMemo } from 'react'
import { trpc } from '../lib/trpc'
import { ListCard } from '../components/ListCard'

interface Props {
  faction: string
  onBack: () => void
}

type TimelinePoint = {
  week: string
  faction: string
  wins: number
  losses: number
  draws: number
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

  const { stat, detachments, timeline, topLists } = data

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
        <p className="text-xs text-slate-500 mt-1">
          Detachment breakdowns, win rate trend over time, and top-performing lists. Tap "Back" to return to the dashboard.
        </p>
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

      {timeline && timeline.length > 0 && (
        <TimelineChart points={timeline} />
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

function TimelineChart({ points }: { points: TimelinePoint[] }) {
  const sorted = useMemo(() => {
    return [...points].sort((a, b) => a.week.localeCompare(b.week))
  }, [points])

  const maxGames = Math.max(...sorted.map((p) => p.wins + p.losses + p.draws), 1)

  return (
    <section>
      <h2 className="text-lg font-medium text-slate-200 mb-3">Win Rate Over Time</h2>
      <div className="flex items-end gap-1 h-32">
        {sorted.map((p) => {
          const games = p.wins + p.losses + p.draws
          const winRate = games > 0 ? p.wins / games : 0
          const height = Math.max((games / maxGames) * 100, 4)
          const color = winRate >= 0.55
            ? 'bg-emerald-400'
            : winRate >= 0.45
              ? 'bg-amber-400'
              : 'bg-red-400'
          return (
            <div
              key={p.week}
              className="flex flex-col items-center flex-1 min-w-0"
              title={`${p.week}: ${(winRate * 100).toFixed(1)}% (${games} games)`}
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
        <span>{sorted[0]?.week}</span>
        <span>{sorted[sorted.length - 1]?.week}</span>
      </div>
    </section>
  )
}
