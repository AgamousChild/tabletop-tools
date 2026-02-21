type Props = {
  isLoaded: boolean
  zScore: number
  onSavePhoto: () => void
  onDismiss: () => void
}

export function EvidencePrompt({ isLoaded, zScore, onSavePhoto, onDismiss }: Props) {
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-6">
      {isLoaded ? (
        <div className="text-center space-y-2">
          <p className="text-2xl font-bold text-red-400">● LOADED DICE</p>
          <p className="text-slate-300">
            Z-score: <span className="font-semibold text-slate-100">{zScore.toFixed(2)}</span>
          </p>
        </div>
      ) : (
        <div className="text-center space-y-2">
          <p className="text-2xl font-bold text-emerald-400">● FAIR DICE</p>
          <p className="text-slate-300">
            Z-score: <span className="font-semibold text-slate-100">{zScore.toFixed(2)}</span>
          </p>
        </div>
      )}

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
