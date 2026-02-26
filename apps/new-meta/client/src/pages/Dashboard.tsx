import { useState } from 'react'
import { trpc } from '../lib/trpc'
import { FactionTable } from '../components/FactionTable'
import { MatchupMatrix } from '../components/MatchupMatrix'
import { MetaWindowSelector } from '../components/MetaWindowSelector'

interface Props {
  onFactionSelect: (faction: string) => void
}

export function Dashboard({ onFactionSelect }: Props) {
  const [metaWindow, setMetaWindow] = useState<string | undefined>()

  const { data: factions = [], isLoading: loadingFactions } = trpc.meta.factions.useQuery(
    { metaWindow, minGames: 5 },
  )

  const { data: matchups = [] } = trpc.meta.matchups.useQuery(
    { metaWindow, minGames: 3 },
  )

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">Meta Dashboard</h1>
        <MetaWindowSelector value={metaWindow} onChange={setMetaWindow} />
      </div>

      <section>
        <h2 className="text-lg font-medium text-slate-200 mb-4">Faction Win Rates</h2>
        {loadingFactions ? (
          <p className="text-slate-400 text-sm">Loading…</p>
        ) : factions.length === 0 ? (
          <p className="text-slate-500 text-sm">No tournament data yet. Import CSV data or close a tournament to see analytics.</p>
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
