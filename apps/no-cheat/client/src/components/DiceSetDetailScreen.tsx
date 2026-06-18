import { useState } from 'react'

import { trpc } from '../lib/trpc'
import { SessionHistory } from './SessionHistory'

type DiceSet = { id: string; name: string }

type Props = {
  diceSet: DiceSet
  onBack: () => void
  onStartSession: () => void
  onSelectSession: (sessionId: string) => void
  onTrainDetection: () => void
}

export function DiceSetDetailScreen({
  diceSet,
  onBack,
  onStartSession,
  onSelectSession,
  onTrainDetection,
}: Props) {
  const {
    data: sessions = [],
    isLoading,
    refetch,
  } = trpc.session.list.useQuery({ diceSetId: diceSet.id })
  const deleteMutation = trpc.session.delete.useMutation({ onSuccess: () => refetch() })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function handleDelete(sessionId: string) {
    if (confirmDelete === sessionId) {
      deleteMutation.mutate({ sessionId })
      setConfirmDelete(null)
    } else {
      setConfirmDelete(sessionId)
    }
  }

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
        <p className="text-xs text-slate-500 mb-4">
          Past recording sessions for this dice set. Tap "New Session" to start calibrating and
          recording rolls.
        </p>

        {isLoading ? (
          <p className="text-slate-400 text-center py-8">Loading…</p>
        ) : (
          <>
            <SessionHistory
              sessions={sessions}
              onSelect={onSelectSession}
              onDelete={handleDelete}
            />
            {confirmDelete && (
              <p className="text-xs text-red-400 text-center mt-1">
                Tap × again to confirm deletion
              </p>
            )}
          </>
        )}

        <div className="mt-6 space-y-3">
          <button
            onClick={onStartSession}
            className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold text-lg hover:bg-amber-300 transition-colors"
          >
            New Session
          </button>
          <button
            onClick={onTrainDetection}
            className="w-full py-3 rounded-lg border border-slate-700 text-slate-300 hover:border-amber-400 hover:text-amber-400 transition-colors font-semibold"
          >
            Train Detection
          </button>
        </div>
      </div>
    </div>
  )
}
