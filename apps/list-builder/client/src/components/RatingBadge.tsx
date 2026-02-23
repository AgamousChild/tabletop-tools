type Props = {
  rating: string | null | undefined
}

function colorFor(rating: string): string {
  if (rating === 'S' || rating === 'A') return 'bg-emerald-500 text-slate-950'
  if (rating === 'B' || rating === 'C') return 'bg-amber-400 text-slate-950'
  return 'bg-red-500 text-slate-100'
}

export function RatingBadge({ rating }: Props) {
  if (!rating) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-slate-700 text-slate-400">
        —
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${colorFor(rating)}`}
    >
      {rating}
    </span>
  )
}
