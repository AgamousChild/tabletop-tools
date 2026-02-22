interface Props {
  rating: number
  ratingDeviation: number
  rank?: number
  playerName: string
  gamesPlayed: number
}

/**
 * Displays a Glicko-2 rating with its ±2×RD uncertainty band.
 * Wide band = uncertain/new player.
 */
export function GlickoBar({ rating, ratingDeviation, rank, playerName, gamesPlayed }: Props) {
  const displayRating = Math.round(rating)
  const band = Math.round(2 * ratingDeviation)

  // Uncertainty level: narrow (<50), medium (50–150), wide (>150)
  const bandColor =
    band < 50
      ? 'text-emerald-400'
      : band < 150
        ? 'text-amber-400'
        : 'text-slate-400'

  return (
    <div className="flex items-center gap-4 py-2">
      {rank !== undefined && (
        <span className="text-slate-500 text-sm w-8 text-right flex-shrink-0">#{rank}</span>
      )}
      <span className="text-slate-100 flex-1 truncate">{playerName}</span>
      <span className="text-slate-100 font-mono font-semibold">
        {displayRating}
      </span>
      <span className={`font-mono text-sm ${bandColor}`}>±{band}</span>
      <span className="text-slate-500 text-xs w-16 text-right">{gamesPlayed}g</span>
    </div>
  )
}
