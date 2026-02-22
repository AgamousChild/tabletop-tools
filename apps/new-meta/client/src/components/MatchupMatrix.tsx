interface MatchupCell {
  factionA: string
  factionB: string
  aWinRate: number
  totalGames: number
}

interface Props {
  cells: MatchupCell[]
}

export function MatchupMatrix({ cells }: Props) {
  if (cells.length === 0) {
    return (
      <p className="text-slate-400 text-sm py-4 text-center">
        No matchup data yet. Import more tournament results to build the matchup matrix.
      </p>
    )
  }

  // Get unique factions
  const factions = [...new Set(cells.flatMap((c) => [c.factionA, c.factionB]))].sort()

  // Build a lookup map
  const lookup = new Map<string, number>()
  for (const cell of cells) {
    lookup.set(`${cell.factionA}::${cell.factionB}`, cell.aWinRate)
    lookup.set(`${cell.factionB}::${cell.factionA}`, 1 - cell.aWinRate)
  }

  function cellColor(rate: number | undefined): string {
    if (rate === undefined) return 'bg-slate-900 text-slate-600'
    if (rate > 0.6) return 'bg-emerald-900/40 text-emerald-300'
    if (rate > 0.55) return 'bg-emerald-900/20 text-emerald-400'
    if (rate < 0.4) return 'bg-red-900/40 text-red-300'
    if (rate < 0.45) return 'bg-red-900/20 text-red-400'
    return 'bg-slate-800/50 text-slate-300'
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-1 text-slate-400 text-right pr-2">vs</th>
            {factions.map((f) => (
              <th key={f} className="p-1 text-slate-400 text-center max-w-16">
                <span className="truncate block max-w-16" title={f}>
                  {f.slice(0, 6)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {factions.map((rowFaction) => (
            <tr key={rowFaction}>
              <td className="p-1 text-slate-300 text-right pr-2 font-medium whitespace-nowrap">
                {rowFaction.slice(0, 16)}
              </td>
              {factions.map((colFaction) => {
                if (rowFaction === colFaction) {
                  return (
                    <td key={colFaction} className="p-1 bg-slate-800 text-center text-slate-600">
                      —
                    </td>
                  )
                }
                const rate = lookup.get(`${rowFaction}::${colFaction}`)
                return (
                  <td
                    key={colFaction}
                    className={`p-1 text-center rounded ${cellColor(rate)}`}
                    title={
                      rate !== undefined
                        ? `${rowFaction} vs ${colFaction}: ${(rate * 100).toFixed(1)}%`
                        : 'No data'
                    }
                  >
                    {rate !== undefined ? `${(rate * 100).toFixed(0)}` : '·'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
