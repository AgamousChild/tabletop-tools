/**
 * Generic metric-stack standings table.
 *
 * Column headers are derived entirely from the metricKeys[] returned by the server
 * (which come from tournament_pairing_metric / tournament_placing_metric rows).
 * No hardcoded column list exists here.
 *
 * When the server returns stackType='legacy', the player shape has flat metric
 * fields (wins, losses, draws, etc.). When stackType='pairing'|'placing', the
 * player shape has a nested `metrics` object.
 */

/** Metric keys use snake_case matching the ranking_metric.key values in the DB */
const METRIC_LABELS: Record<string, string> = {
  wins: 'W',
  losses: 'L',
  draws: 'D',
  battle_points: 'BP',
  vp_against: 'Opp',
  vp_margin: '+/-',
  sos_wins: 'SOS',
  registered_at: 'Reg',
}

/** Format a metric value for display */
function formatMetricValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (key === 'sos_wins') return `${((value as number) * 100).toFixed(1)}%`
  if (key === 'registered_at') return new Date(value as number).toLocaleDateString()
  if (key === 'vp_margin') {
    const n = value as number
    return n >= 0 ? `+${n}` : String(n)
  }
  return String(value)
}

type MetricPlayer = {
  rank: number
  id: string
  displayName: string
  faction: string
  // Metric-compute path: metrics are nested
  metrics?: Record<string, unknown>
  // Legacy path: metrics are flat
  wins?: number
  losses?: number
  draws?: number
  totalVP?: number
  margin?: number
  strengthOfSchedule?: number
}

/** Map legacy flat fields to metric key names */
const LEGACY_KEY_MAP: Record<string, string> = {
  battle_points: 'totalVP',
  vp_margin: 'margin',
  sos_wins: 'strengthOfSchedule',
}

function getPlayerMetricValue(player: MetricPlayer, key: string): unknown {
  if (player.metrics) {
    return player.metrics[key]
  }
  // Legacy flat shape
  const legacyField = LEGACY_KEY_MAP[key] ?? key
  return (player as Record<string, unknown>)[legacyField]
}

type Props = {
  round: number
  stackType: string
  metricKeys: string[]
  players: MetricPlayer[]
}

export function MetricStackStandings({ round, stackType: _stackType, metricKeys, players }: Props) {
  if (players.length === 0) {
    return <div className="text-slate-500 text-sm">No players registered yet.</div>
  }

  return (
    <div className="overflow-x-auto">
      <div className="text-xs text-slate-500 mb-2">Round {round} Standings</div>
      <table className="w-full text-sm text-left text-slate-300">
        <thead className="text-xs text-slate-500 uppercase">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2">Faction</th>
            {metricKeys.map((key) => (
              <th key={key} className="px-3 py-2 text-center" title={key}>
                {METRIC_LABELS[key] ?? key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className="border-t border-slate-800">
              <td className="px-3 py-2 text-slate-500">{p.rank}</td>
              <td className="px-3 py-2 font-medium text-slate-100">{p.displayName}</td>
              <td className="px-3 py-2 text-slate-400">{p.faction}</td>
              {metricKeys.map((key) => {
                const value = getPlayerMetricValue(p, key)
                const formatted = formatMetricValue(key, value)
                let colorClass = ''
                if (key === 'wins') colorClass = 'text-emerald-400'
                else if (key === 'losses') colorClass = 'text-red-400'
                else if (key === 'vp_margin') {
                  const n = value as number
                  colorClass = n >= 0 ? 'text-emerald-400' : 'text-red-400'
                }
                return (
                  <td key={key} className={`px-3 py-2 text-center ${colorClass}`}>
                    {formatted}
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
