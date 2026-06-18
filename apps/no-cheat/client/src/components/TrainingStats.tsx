type Props = {
  stats: {
    totalGuesses: number
    correctGuesses: number
    corrections: number
  } | null
  exampleCounts: Map<number, number>
  totalExamples: number
  onClear: () => void
  onViewHistory?: () => void
}

function formatAccuracy(stats: Props['stats']): string {
  if (!stats || stats.totalGuesses === 0) return '—'
  return ((stats.correctGuesses / stats.totalGuesses) * 100).toFixed(1) + '%'
}

export function TrainingStats({
  stats,
  exampleCounts,
  totalExamples,
  onClear,
  onViewHistory,
}: Props) {
  if (totalExamples === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <p className="text-slate-400 text-sm text-center">No training data</p>
        <button
          onClick={onClear}
          className="mt-3 w-full px-3 py-1.5 text-sm font-medium text-red-400 bg-red-400/10 border border-red-400/30 rounded hover:bg-red-400/20"
        >
          Clear Training Data
        </button>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
      {/* Total examples */}
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm">Total examples</span>
        <span className="text-slate-100 font-mono font-bold">{totalExamples}</span>
      </div>

      {/* Per-class counts */}
      <div className="grid grid-cols-6 gap-1">
        {[1, 2, 3, 4, 5, 6].map((pip) => (
          <div
            key={pip}
            data-testid={`class-${pip}`}
            className="flex flex-col items-center bg-slate-800 rounded px-1 py-1.5"
          >
            <span className="text-slate-400 text-xs">{pip}</span>
            <span className="text-slate-100 font-mono text-sm font-bold">
              {exampleCounts.get(pip) ?? 0}
            </span>
          </div>
        ))}
      </div>

      {/* Accuracy */}
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm">Accuracy</span>
        <span data-testid="accuracy-value" className="text-slate-100 font-mono font-bold">
          {formatAccuracy(stats)}
        </span>
      </div>

      {/* Corrections */}
      {stats && (
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-sm">Corrections</span>
          <span className="text-slate-100 font-mono font-bold">{stats.corrections}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {onViewHistory && (
          <button
            onClick={onViewHistory}
            className="flex-1 px-3 py-1.5 text-sm font-medium text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded hover:bg-amber-400/20"
          >
            View History
          </button>
        )}
        <button
          onClick={onClear}
          className="flex-1 px-3 py-1.5 text-sm font-medium text-red-400 bg-red-400/10 border border-red-400/30 rounded hover:bg-red-400/20"
        >
          Clear Training Data
        </button>
      </div>
    </div>
  )
}
