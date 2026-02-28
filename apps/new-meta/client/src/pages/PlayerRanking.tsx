import { useState } from 'react'
import { trpc } from '../lib/trpc'
import { GlickoBar } from '../components/GlickoBar'

interface Props {
  onPlayerSelect?: (playerId: string) => void
}

export function PlayerRanking({ onPlayerSelect }: Props) {
  const [minGames, setMinGames] = useState(10)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearch, setActiveSearch] = useState('')

  const { data: players = [], isLoading } = trpc.player.leaderboard.useQuery({ minGames })
  const { data: searchResults } = trpc.player.search.useQuery(
    { name: activeSearch },
    { enabled: activeSearch.length > 0 },
  )

  const displayPlayers = activeSearch ? (searchResults ?? []) : players

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">Player Rankings</h1>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <label htmlFor="min-games">Min games:</label>
          <select
            id="min-games"
            value={minGames}
            onChange={(e) => setMinGames(Number(e.target.value))}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-100"
          >
            <option value={0}>All</option>
            <option value={5}>5+</option>
            <option value={10}>10+</option>
            <option value={20}>20+</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Glicko-2 leaderboard based on tournament performance. Click a player to view their profile and rating history.
      </p>

      {/* Player search */}
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setActiveSearch(searchQuery.trim()) }}
          placeholder="Search players by name..."
          className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
          aria-label="Search players"
        />
        <button
          onClick={() => setActiveSearch(searchQuery.trim())}
          className="px-4 py-2 rounded-lg bg-amber-400 text-slate-950 text-sm font-medium hover:bg-amber-300 transition-colors"
        >
          Search
        </button>
        {activeSearch && (
          <button
            onClick={() => { setActiveSearch(''); setSearchQuery('') }}
            className="px-3 py-2 rounded-lg bg-slate-800 text-slate-400 text-sm hover:text-slate-200 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {activeSearch && (
        <p className="text-xs text-slate-500">
          Showing results for "{activeSearch}" ({displayPlayers.length} found)
        </p>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-1">
        <div className="flex items-center gap-4 px-3 py-1.5 text-xs text-slate-500 border-b border-slate-800">
          <span className="w-8 text-right">#</span>
          <span className="flex-1">Player</span>
          <span className="font-mono">Rating</span>
          <span className="font-mono">±2RD</span>
          <span className="w-16 text-right">Games</span>
        </div>

        {isLoading && !activeSearch ? (
          <p className="text-slate-400 text-sm p-4 text-center">Loading…</p>
        ) : displayPlayers.length === 0 ? (
          <p className="text-slate-400 text-sm p-4 text-center">
            {activeSearch ? `No players matching "${activeSearch}".` : `No players with ${minGames}+ games yet.`}
          </p>
        ) : (
          displayPlayers.map((player, i) => (
            <button
              key={player.id}
              onClick={() => onPlayerSelect?.(player.id)}
              className="w-full text-left hover:bg-slate-800/50 transition-colors"
            >
              <GlickoBar
                rank={i + 1}
                playerName={player.playerName}
                rating={player.rating}
                ratingDeviation={player.ratingDeviation}
                gamesPlayed={player.gamesPlayed}
              />
            </button>
          ))
        )}
      </div>

      <p className="text-slate-500 text-xs">
        Rating shown as <span className="font-mono text-slate-400">1687 ± 94</span>
        {' '}(±2×RD uncertainty band). Wide band = fewer games played.
      </p>
    </div>
  )
}
