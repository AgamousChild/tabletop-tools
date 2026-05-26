import { useState } from 'react'

import { FactionTable } from '../components/FactionTable'
import { MatchupMatrix } from '../components/MatchupMatrix'
import { MetaWindowSelector } from '../components/MetaWindowSelector'
import { trpc } from '../lib/trpc'

interface Props {
  onFactionSelect: (factionId: string) => void
}

export function Dashboard({ onFactionSelect }: Props) {
  const [frame, setFrame] = useState<string | undefined>()

  const { data: factions = [], isLoading: loadingFactions } = trpc.meta.factions.useQuery({
    frame,
    minGames: 5,
  })

  const { data: matchups = [] } = trpc.meta.matchups.useQuery({ frame, minGames: 3 })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">Meta Dashboard</h1>
        <MetaWindowSelector value={frame} onChange={setFrame} />
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Faction win rates, event placements, and head-to-head matchups from{' '}
        {factions.length > 0
          ? `${factions.reduce((s, f) => s + f.games, 0).toLocaleString()} games across ${factions.reduce((s, f) => s + f.players, 0).toLocaleString()} player entries`
          : 'imported tournament data'}
        .
      </p>

      <section>
        <h2 className="text-lg font-medium text-slate-200 mb-4">Faction Win Rates</h2>
        {loadingFactions ? (
          <p className="text-slate-400 text-sm">Loading...</p>
        ) : factions.length === 0 ? (
          <p className="text-slate-500 text-sm">No tournament data for this period.</p>
        ) : (
          <FactionTable stats={factions} onSelect={onFactionSelect} />
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium text-slate-200 mb-4">Matchup Matrix</h2>
        {matchups.length === 0 && !loadingFactions ? (
          <p className="text-slate-500 text-sm">No matchup data available.</p>
        ) : (
          <MatchupMatrix cells={matchups} />
        )}
      </section>
    </div>
  )
}
