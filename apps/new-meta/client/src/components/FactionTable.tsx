interface FactionStat {
  faction: string
  games: number
  winRate: number
  players: number
  representationPct: number
  wins: number
  losses: number
  draws: number
}

interface Props {
  stats: FactionStat[]
  onSelect?: (faction: string) => void
}

export function FactionTable({ stats, onSelect }: Props) {
  if (stats.length === 0) {
    return (
      <p className="text-slate-400 text-sm py-4 text-center">No data yet.</p>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-800 text-slate-400 text-left">
          <th className="pb-2 pr-4">Faction</th>
          <th className="pb-2 pr-4 text-right">Win%</th>
          <th className="pb-2 pr-4 text-right">W</th>
          <th className="pb-2 pr-4 text-right">L</th>
          <th className="pb-2 pr-4 text-right">D</th>
          <th className="pb-2 pr-4 text-right">Games</th>
          <th className="pb-2 text-right">Rep%</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s) => (
          <tr
            key={s.faction}
            className="border-b border-slate-800/50 hover:bg-slate-900 cursor-pointer"
            onClick={() => onSelect?.(s.faction)}
          >
            <td className="py-2 pr-4 text-slate-100 font-medium">{s.faction}</td>
            <td className="py-2 pr-4 text-right">
              <WinRateBar rate={s.winRate} />
            </td>
            <td className="py-2 pr-4 text-right text-slate-300">{s.wins}</td>
            <td className="py-2 pr-4 text-right text-slate-300">{s.losses}</td>
            <td className="py-2 pr-4 text-right text-slate-300">{s.draws}</td>
            <td className="py-2 pr-4 text-right text-slate-400">{s.games}</td>
            <td className="py-2 text-right text-slate-400">
              {(s.representationPct * 100).toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WinRateBar({ rate }: { rate: number }) {
  const pct = (rate * 100).toFixed(1)
  const color =
    rate > 0.55 ? 'text-emerald-400' : rate < 0.45 ? 'text-red-400' : 'text-slate-300'
  return <span className={color}>{pct}%</span>
}
