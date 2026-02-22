type Session = {
  id: string
  userId: string
  diceSetId: string
  isLoaded: number | null
  zScore: number | null
  opponentName: string | null
  createdAt: number
  closedAt: number | null
  photoUrl: string | null
}

type Props = {
  sessions: Session[]
  onSelect: (sessionId: string) => void
}

function verdict(session: Session): { label: string; color: string } {
  if (!session.closedAt) return { label: 'In Progress', color: 'text-amber-400' }
  if (session.isLoaded === 1) return { label: 'Loaded', color: 'text-red-400' }
  return { label: 'Fair', color: 'text-emerald-400' }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function SessionHistory({ sessions, onSelect }: Props) {
  if (sessions.length === 0) {
    return <p className="text-slate-400 text-center py-8">No sessions yet. Start one below.</p>
  }

  return (
    <ul className="space-y-2">
      {sessions.map((session) => {
        const { label, color } = verdict(session)
        return (
          <li key={session.id}>
            <button
              onClick={() => onSelect(session.id)}
              className="w-full text-left px-4 py-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-400 transition-colors space-y-0.5"
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${color}`}>{label}</span>
                <span className="text-xs text-slate-500">{formatDate(session.createdAt)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                {session.opponentName && <span>vs {session.opponentName}</span>}
                {session.zScore != null && <span>Z: {session.zScore.toFixed(2)}</span>}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
