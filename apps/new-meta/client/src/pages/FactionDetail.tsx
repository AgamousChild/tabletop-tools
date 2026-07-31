import { useMemo } from 'react'

import { ListCard } from '../components/ListCard'
import { trpc } from '../lib/trpc'

interface Props {
  factionId: string
  onBack: () => void
}

export function FactionDetail({ factionId, onBack }: Props) {
  const { data, isLoading } = trpc.meta.faction.useQuery({ factionId })

  if (isLoading) {
    return <p className="text-slate-400 text-sm">Loading...</p>
  }

  if (!data || !data.stat) {
    return (
      <div>
        <button onClick={onBack} className="text-amber-400 text-sm hover:text-amber-300 mb-4">
          &larr; Back
        </button>
        <p className="text-slate-400">No data for this faction.</p>
      </div>
    )
  }

  const { stat, detachments, combos, timeline, topLists } = data
  // 11e armies take several detachments, so a pairing is its own thing to
  // evaluate — not the same question as how one detachment does across every
  // army it appears in.
  const multiCombos = combos.filter((c) => c.memberCount > 1)

  return (
    <div className="space-y-8">
      <div>
        <button onClick={onBack} className="text-amber-400 text-sm hover:text-amber-300 mb-4">
          &larr; Back
        </button>
        <h1 className="text-2xl font-semibold text-slate-100">{stat.faction}</h1>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <StatCard
            label="Win Rate"
            value={`${(stat.winRate * 100).toFixed(1)}%`}
            color={stat.winRate > 0.55 ? 'emerald' : stat.winRate < 0.45 ? 'red' : 'slate'}
          />
          <StatCard label="Games" value={stat.games.toLocaleString()} />
          <StatCard label="Players" value={stat.players.toLocaleString()} />
          <StatCard label="Event Wins" value={String(stat.eventWins)} color="amber" />
        </div>

        <div className="flex gap-4 mt-3 text-xs text-slate-500">
          <span>Top 4: {stat.eventTop4}</span>
          <span>Top 8: {stat.eventTop8}</span>
          <span>Meta Share: {(stat.playerPopPct * 100).toFixed(1)}%</span>
          <span>Draw Rate: {(stat.drawRate * 100).toFixed(1)}%</span>
        </div>
      </div>

      {multiCombos.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-slate-200 mb-1">Detachment Combinations</h2>
          <p className="text-xs text-slate-500 mb-3">
            11th edition armies take more than one detachment under a Detachment Points budget.
            These are the pairings actually played, scored as a whole army.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-left text-xs">
                <th className="pb-2 pr-4">Combination</th>
                <th className="pb-2 pr-3 text-right">DP</th>
                <th className="pb-2 pr-3 text-right">Win%</th>
                <th className="pb-2 pr-3 text-right">W</th>
                <th className="pb-2 pr-3 text-right">L</th>
                <th className="pb-2 pr-3 text-right">D</th>
                <th className="pb-2 pr-3 text-right">Games</th>
                <th className="pb-2 text-right">Players</th>
              </tr>
            </thead>
            <tbody>
              {multiCombos.map((c) => (
                <tr key={c.comboId} className="border-b border-slate-800/50">
                  <td className="py-1.5 pr-4 text-slate-100">{c.members}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-500">{c.totalDp ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-right">
                    <span
                      className={
                        c.winRate > 0.55
                          ? 'text-emerald-400'
                          : c.winRate < 0.45
                            ? 'text-red-400'
                            : 'text-slate-300'
                      }
                    >
                      {(c.winRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{c.wins}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{c.losses}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{c.draws}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{c.games}</td>
                  <td className="py-1.5 text-right text-slate-400">{c.players}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {detachments.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-slate-200 mb-1">Detachments</h2>
          <p className="text-xs text-slate-500 mb-3">
            Every game an army containing this detachment played, whichever position it was written
            in.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-left text-xs">
                <th className="pb-2 pr-4">Detachment</th>
                <th className="pb-2 pr-3 text-right">Win%</th>
                <th className="pb-2 pr-3 text-right">W</th>
                <th className="pb-2 pr-3 text-right">L</th>
                <th className="pb-2 pr-3 text-right">D</th>
                <th className="pb-2 pr-3 text-right">Games</th>
                <th className="pb-2 text-right">Players</th>
              </tr>
            </thead>
            <tbody>
              {detachments.map((d) => (
                <tr key={d.detachmentId} className="border-b border-slate-800/50">
                  <td className="py-1.5 pr-4 text-slate-100">{d.detachment}</td>
                  <td className="py-1.5 pr-3 text-right">
                    <span
                      className={
                        d.winRate > 0.55
                          ? 'text-emerald-400'
                          : d.winRate < 0.45
                            ? 'text-red-400'
                            : 'text-slate-300'
                      }
                    >
                      {(d.winRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{d.wins}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{d.losses}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{d.draws}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{d.games}</td>
                  <td className="py-1.5 text-right text-slate-400">{d.players}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {timeline && timeline.length > 0 && <TimelineChart points={timeline} />}

      {topLists.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-slate-200 mb-3">Top Lists</h2>
          <div className="space-y-3">
            {topLists.map((list, i) => (
              <ListCard
                key={`${list.eventName}-${list.placement}-${i}`}
                list={{
                  eventName: list.eventName,
                  eventDate: list.eventDate
                    ? new Date(list.eventDate).toISOString().slice(0, 10)
                    : '',
                  placement: list.placement,
                  faction: stat.faction,
                  detachment: list.detachment,
                  listText: list.listText,
                  wins: list.wins,
                  losses: list.losses,
                  draws: list.draws,
                  points: 0,
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  color = 'slate',
}: {
  label: string
  value: string
  color?: string
}) {
  const textColor =
    color === 'emerald'
      ? 'text-emerald-400'
      : color === 'red'
        ? 'text-red-400'
        : color === 'amber'
          ? 'text-amber-400'
          : 'text-slate-100'
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-mono font-semibold ${textColor}`}>{value}</p>
    </div>
  )
}

function TimelineChart({
  points,
}: {
  points: Array<{
    week: string
    winRate: number
    games: number
    wins: number
    losses: number
    draws: number
  }>
}) {
  const sorted = useMemo(() => [...points].sort((a, b) => a.week.localeCompare(b.week)), [points])
  const maxGames = Math.max(...sorted.map((p) => p.games), 1)

  return (
    <section>
      <h2 className="text-lg font-medium text-slate-200 mb-3">Win Rate Over Time</h2>
      <div className="flex items-end gap-1 h-32">
        {sorted.map((p) => {
          const height = Math.max((p.games / maxGames) * 100, 4)
          const color =
            p.winRate >= 0.55 ? 'bg-emerald-400' : p.winRate >= 0.45 ? 'bg-amber-400' : 'bg-red-400'
          return (
            <div
              key={p.week}
              className="flex flex-col items-center flex-1 min-w-0"
              title={`${p.week}: ${(p.winRate * 100).toFixed(1)}% (${p.games} games)`}
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
