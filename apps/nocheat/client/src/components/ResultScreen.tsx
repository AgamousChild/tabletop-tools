type Result = {
  zScore: number
  isLoaded: boolean
  outlierFace: number
  observedRate: number
  rollCount: number
}

type Props = {
  result: Result
  onSavePhoto: () => void
  onDismiss: () => void
}

const EXPECTED_RATE = 1 / 6 // 16.7%

export function ResultScreen({ result, onSavePhoto, onDismiss }: Props) {
  const { zScore, isLoaded, outlierFace, observedRate, rollCount } = result

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-6 max-w-sm mx-auto">
      {/* Verdict */}
      <div className="text-center space-y-1">
        {isLoaded ? (
          <p className="text-3xl font-bold text-red-400">● LOADED DICE</p>
        ) : (
          <p className="text-3xl font-bold text-emerald-400">● FAIR DICE</p>
        )}
      </div>

      {/* Stats */}
      <div className="space-y-1 text-sm text-slate-300">
        <div className="flex justify-between">
          <span className="text-slate-400">Z-score</span>
          <span className="font-semibold text-slate-100">{zScore.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Expected</span>
          <span>{(EXPECTED_RATE * 100).toFixed(1)}%</span>
        </div>
        {outlierFace > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-400">Observed ({outlierFace}s)</span>
            <span className={isLoaded ? 'text-red-400 font-semibold' : ''}>
              {(observedRate * 100).toFixed(1)}%
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-slate-400">Rolls</span>
          <span>{rollCount}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {isLoaded && (
          <button
            onClick={onSavePhoto}
            className="w-full py-2 rounded-lg bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 transition-colors"
          >
            Save Evidence
          </button>
        )}
        <button
          onClick={onDismiss}
          className="w-full py-2 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
