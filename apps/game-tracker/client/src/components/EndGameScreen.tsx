import { trpc } from '../lib/trpc'

type Props = {
  matchId: string
  onBack: () => void
}

export function EndGameScreen({ matchId, onBack }: Props) {
  const { data: match } = trpc.match.get.useQuery({ id: matchId })

  if (!match) return <div className="p-6 text-slate-400">Loading...</div>

  const yourTotal = match.yourFinalScore ?? 0
  const theirTotal = match.theirFinalScore ?? 0

  const opponentDisplay = match.opponentName
    ? `${match.opponentName} (${match.opponentFaction})`
    : match.opponentFaction

  // Compute per-round breakdown
  const roundBreakdown = match.turns.map((turn) => ({
    round: turn.turnNumber,
    yourVp: turn.primaryScored + turn.secondaryScored,
    primary: turn.primaryScored,
    secondary: turn.secondaryScored,
    cpSpent: turn.cpSpent,
    yourLost: JSON.parse(turn.yourUnitsLost) as Array<{ name: string }>,
    theirLost: JSON.parse(turn.theirUnitsLost) as Array<{ name: string }>,
    notes: turn.notes,
  }))

  const totalCp = roundBreakdown.reduce((sum, r) => sum + r.cpSpent, 0)
  const totalYourLost = roundBreakdown.reduce((sum, r) => sum + r.yourLost.length, 0)
  const totalTheirLost = roundBreakdown.reduce((sum, r) => sum + r.theirLost.length, 0)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-100">
          Back
        </button>
        <h1 className="text-xl font-bold text-amber-400">Match Summary</h1>
      </header>

      <div className="p-6 space-y-6">
        {/* Result card */}
        <div className="text-center p-6 rounded-xl bg-slate-900 border border-slate-700">
          <p className="text-sm text-slate-400 mb-1">
            vs {opponentDisplay} · {match.mission}
          </p>
          {match.yourDetachment && (
            <p className="text-xs text-slate-500 mb-2">
              {match.yourFaction} · {match.yourDetachment}
            </p>
          )}
          <p
            className={`text-4xl font-bold ${
              match.result === 'WIN'
                ? 'text-emerald-400'
                : match.result === 'LOSS'
                  ? 'text-red-400'
                  : 'text-amber-400'
            }`}
          >
            {match.result ?? '---'}
          </p>
          <p className="text-slate-300 mt-2 text-lg">
            {yourTotal} -- {theirTotal}
          </p>
        </div>

        {/* Match stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-slate-900 border border-slate-800">
            <p className="text-xs text-slate-500">CP Used</p>
            <p className="text-lg font-bold text-slate-100">{totalCp}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-900 border border-slate-800">
            <p className="text-xs text-slate-500">Units Lost</p>
            <p className="text-lg font-bold text-red-400">{totalYourLost}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-900 border border-slate-800">
            <p className="text-xs text-slate-500">Units Killed</p>
            <p className="text-lg font-bold text-emerald-400">{totalTheirLost}</p>
          </div>
        </div>

        {/* Round breakdown */}
        {roundBreakdown.length > 0 && (
          <div>
            <h3 className="font-semibold text-slate-300 mb-3">Round Breakdown</h3>
            <div className="space-y-2">
              {roundBreakdown.map((r) => (
                <div
                  key={r.round}
                  className="p-4 rounded-lg bg-slate-900 border border-slate-800"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-200">Round {r.round}</span>
                    <span className="text-amber-400 text-sm">
                      {r.yourVp}VP (P:{r.primary} S:{r.secondary})
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    CP: {r.cpSpent}
                    {r.yourLost.length > 0 && (
                      <span className="text-red-400 ml-2">
                        Lost: {r.yourLost.map((u) => u.name).join(', ')}
                      </span>
                    )}
                    {r.theirLost.length > 0 && (
                      <span className="text-emerald-400 ml-2">
                        Killed: {r.theirLost.map((u) => u.name).join(', ')}
                      </span>
                    )}
                  </div>
                  {r.notes && (
                    <p className="text-sm text-slate-500 mt-1 italic">{r.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
