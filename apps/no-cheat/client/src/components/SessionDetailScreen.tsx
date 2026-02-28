import { trpc } from '../lib/trpc'
import { RollDetail } from './RollDetail'

type Props = {
  sessionId: string
  onBack: () => void
}

export function SessionDetailScreen({ sessionId, onBack }: Props) {
  const { data, isLoading } = trpc.session.get.useQuery({ sessionId })

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  const { session, rolls } = data

  let verdictLabel: string
  let verdictColor: string
  if (!session.closedAt) {
    verdictLabel = 'In Progress'
    verdictColor = 'text-amber-400'
  } else if (session.isLoaded === 1) {
    verdictLabel = 'Loaded'
    verdictColor = 'text-red-400'
  } else {
    verdictLabel = 'Fair'
    verdictColor = 'text-emerald-400'
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            aria-label="Back"
            className="text-slate-400 hover:text-slate-100 transition-colors text-lg"
          >
            ←
          </button>
          <h2 className="text-xl font-bold text-slate-100">Session Detail</h2>
        </div>

        <p className="text-xs text-slate-500">
          Session verdict and individual rolls recorded during this session. Tap the back arrow to return to the dice set.
        </p>

        <div className="px-4 py-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
          <p className={`font-semibold ${verdictColor}`}>{verdictLabel}</p>
          {session.zScore != null && (
            <p className="text-sm text-slate-400">Z-score: {session.zScore.toFixed(2)}</p>
          )}
          {session.opponentName && (
            <p className="text-sm text-slate-400">vs {session.opponentName}</p>
          )}
          <p className="text-sm text-slate-400">
            {rolls.length} {rolls.length === 1 ? 'roll' : 'rolls'}
          </p>
        </div>

        <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Rolls</h3>
        <RollDetail rolls={rolls} />
      </div>
    </div>
  )
}
