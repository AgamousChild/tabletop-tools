import { SkeletonTable } from '@tabletop-tools/ui'

import { FactionTable } from '../components/FactionTable'
import { GranularitySelector } from '../components/GranularitySelector'
import { MatchupMatrix } from '../components/MatchupMatrix'
import { MetaWindowSelector } from '../components/MetaWindowSelector'
import { trpc } from '../lib/trpc'

interface Props {
  onFactionSelect: (factionId: string) => void
  // Owned by the URL rather than by this component, so the selection survives
  // navigation to a faction page instead of resetting to the server default.
  frame: string | undefined
  granularityId: number | undefined
  onFrameChange: (frame: string | undefined) => void
  onGranularityChange: (granularityId: number | undefined) => void
}

export function Dashboard({
  onFactionSelect,
  frame,
  granularityId,
  onFrameChange,
  onGranularityChange,
}: Props) {
  const { data: factions = [], isLoading: loadingFactions } = trpc.meta.factions.useQuery({
    frame,
    granularityId,
    minGames: 5,
  })

  const { data: matchups = [] } = trpc.meta.matchups.useQuery({ frame, granularityId, minGames: 3 })

  // Faction granularity is the default (no explicit id). Everything else is a
  // finer breakdown where one army can appear in several rows, so faction-level
  // framing — totals, the "Faction Win Rates" heading, the matchup matrix —
  // stops being meaningful.
  const { data: filters } = trpc.meta.availableFilters.useQuery({})
  const factionGranularityId = filters?.granularities.find((g) => g.name === 'Faction')?.id
  const isFactionGranularity = granularityId == null || granularityId === factionGranularityId
  const granularityName =
    filters?.granularities.find((g) => g.id === granularityId)?.name ?? 'Faction'

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">Meta Dashboard</h1>
        <div className="flex items-center gap-2">
          <GranularitySelector value={granularityId} onChange={onGranularityChange} />
          <MetaWindowSelector value={frame} onChange={onFrameChange} />
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        {isFactionGranularity ? (
          <>
            Faction win rates, event placements, and head-to-head matchups from{' '}
            {factions.length > 0
              ? `${factions.reduce((s, f) => s + f.games, 0).toLocaleString()} games across ${factions.reduce((s, f) => s + f.players, 0).toLocaleString()} player entries`
              : 'imported tournament data'}
            .
          </>
        ) : (
          // Rows are no longer one-per-army at this granularity: an army with
          // two detachments contributes a row to each, so summing games here
          // would double-count it. The totals belong to the Faction rollup.
          <>Showing {factions.length.toLocaleString()} rows for the selected breakdown.</>
        )}
      </p>

      <section>
        <h2 className="text-lg font-medium text-slate-200 mb-4">
          {isFactionGranularity ? 'Faction Win Rates' : 'Win Rates'}
        </h2>
        {loadingFactions ? (
          <SkeletonTable rows={12} columns={6} />
        ) : factions.length === 0 ? (
          <p className="text-slate-500 text-sm">No tournament data for this period.</p>
        ) : (
          <FactionTable stats={factions} onSelect={onFactionSelect} rowLabel={granularityName} />
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
