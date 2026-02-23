import { trpc } from '../lib/trpc'
import { SessionHistory } from './SessionHistory'

type DiceSet = { id: string; name: string }

type Props = {
  diceSet: DiceSet
  onBack: () => void
  onStartSession: () => void
  onSelectSession: (sessionId: string) => void
}

export function DiceSetDetailScreen({ diceSet, onBack, onStartSession, onSelectSession }: Props) {
  const { data: sessions = [], isLoading } = trpc.session.list.useQuery({ diceSetId: diceSet.id })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={onBack}
            aria-label="Back"
            className="text-slate-400 hover:text-slate-100 transition-colors text-lg"
          >
            ←
          </button>
          <h2 className="text-xl font-bold text-slate-100">{diceSet.name}</h2>
        </div>

        <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-3">
          Sessions
        </h3>

        {isLoading ? (
          <p className="text-slate-400 text-center py-8">Loading…</p>
        ) : (
          <SessionHistory sessions={sessions} onSelect={onSelectSession} />
        )}

        <div className="mt-6">
          <button
            onClick={onStartSession}
            className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold text-lg hover:bg-amber-300 transition-colors"
          >
            New Session
          </button>
        </div>
      </div>
    </div>
  )
}
