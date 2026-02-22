import { useState } from 'react'
import { trpc } from '../lib/trpc'
import { GlickoBar } from '../components/GlickoBar'

export function PlayerRanking() {
  const [minGames, setMinGames] = useState(10)

  const { data: players = [], isLoading } = trpc.player.leaderboard.useQuery({ minGames })

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

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-1">
        <div className="flex items-center gap-4 px-3 py-1.5 text-xs text-slate-500 border-b border-slate-800">
          <span className="w-8 text-right">#</span>
          <span className="flex-1">Player</span>
          <span className="font-mono">Rating</span>
          <span className="font-mono">±2RD</span>
          <span className="w-16 text-right">Games</span>
        </div>

        {isLoading ? (
          <p className="text-slate-400 text-sm p-4 text-center">Loading…</p>
        ) : players.length === 0 ? (
          <p className="text-slate-400 text-sm p-4 text-center">
            No players with {minGames}+ games yet.
          </p>
        ) : (
          players.map((player, i) => (
            <GlickoBar
              key={player.id}
              rank={i + 1}
              playerName={player.playerName}
              rating={player.rating}
              ratingDeviation={player.ratingDeviation}
              gamesPlayed={player.gamesPlayed}
            />
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
