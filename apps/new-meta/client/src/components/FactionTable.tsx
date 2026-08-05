interface FactionStat {
  factionId: string
  faction: string
  allegiance: string
  winRate: number
  drawRate: number
  overRep: number
  fourOhStart: number
  eventWins: number
  eventFinals: number
  eventTop4: number
  eventTop8: number
  eventTop16: number
  playerPopPct: number
  wins: number
  losses: number
  draws: number
  games: number
  players: number
}

interface Props {
  /**
   * What a row IS at the selected granularity — "Faction", "Detachment",
   * "Combination". The header said "Faction" at every level, which read as a
   * bug once Detachment rollups existed and the rows were detachments.
   */
  rowLabel?: string
  stats: FactionStat[]
  onSelect?: (factionId: string) => void
}

export function FactionTable({ stats, onSelect, rowLabel = 'Faction' }: Props) {
  if (stats.length === 0) {
    return <p className="text-slate-400 text-sm py-4 text-center">No data yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400 text-left text-xs">
            <th className="pb-2 pr-4">{rowLabel}</th>
            <th className="pb-2 pr-3 text-right">Win%</th>
            <th className="pb-2 pr-3 text-right">W</th>
            <th className="pb-2 pr-3 text-right">L</th>
            <th className="pb-2 pr-3 text-right">D</th>
            <th className="pb-2 pr-3 text-right">Games</th>
            <th className="pb-2 pr-3 text-right">Players</th>
            <th className="pb-2 pr-3 text-right" title="Percentage of meta playerbase">
              Meta%
            </th>
            <th className="pb-2 pr-3 text-right" title="Event wins">
              1st
            </th>
            <th className="pb-2 text-right" title="Top 4 finishes">
              T4
            </th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr
              key={s.factionId}
              className="border-b border-slate-800/50 hover:bg-slate-900 cursor-pointer"
              onClick={() => onSelect?.(s.factionId)}
            >
              <td className="py-2 pr-4">
                <span className="text-slate-100 font-medium">{s.faction}</span>
                <AllegianceDot allegiance={s.allegiance} />
              </td>
              <td className="py-2 pr-3 text-right">
                <WinRateBar rate={s.winRate} />
              </td>
              <td className="py-2 pr-3 text-right text-slate-300">{s.wins}</td>
              <td className="py-2 pr-3 text-right text-slate-300">{s.losses}</td>
              <td className="py-2 pr-3 text-right text-slate-300">{s.draws}</td>
              <td className="py-2 pr-3 text-right text-slate-400">{s.games}</td>
              <td className="py-2 pr-3 text-right text-slate-400">{s.players}</td>
              <td className="py-2 pr-3 text-right">
                <MetaPctBadge value={s.playerPopPct} />
              </td>
              <td className="py-2 pr-3 text-right text-amber-400 font-mono">{s.eventWins || ''}</td>
              <td className="py-2 text-right text-slate-400 font-mono">{s.eventTop4 || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WinRateBar({ rate }: { rate: number }) {
  const pct = (rate * 100).toFixed(1)
  const color = rate > 0.55 ? 'text-emerald-400' : rate < 0.45 ? 'text-red-400' : 'text-slate-300'
  return <span className={`font-mono ${color}`}>{pct}%</span>
}

function MetaPctBadge({ value }: { value: number }) {
  const pct = (value * 100).toFixed(1)
  const color = value > 0.08 ? 'text-amber-400' : value < 0.03 ? 'text-blue-400' : 'text-slate-300'
  return <span className={`text-xs font-mono ${color}`}>{pct}%</span>
}

function AllegianceDot({ allegiance }: { allegiance: string }) {
  const color =
    allegiance === 'imperium'
      ? 'bg-blue-400'
      : allegiance === 'chaos'
        ? 'bg-red-400'
        : 'bg-green-400'
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${color} ml-2 opacity-60`}
      title={allegiance}
    />
  )
}
