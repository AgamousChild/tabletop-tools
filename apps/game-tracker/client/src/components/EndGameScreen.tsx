import { trpc } from '../lib/trpc'

type Props = {
  matchId: string
  onBack: () => void
}

type Turn = {
  turnNumber: number
  primaryScored: number
  secondaryScored: number
  cpSpent: number
  yourUnitsLost: string
  theirUnitsLost: string
  yourPrimary?: number
  theirPrimary?: number
  yourSecondary?: number
  theirSecondary?: number
  yourCpGained?: number
  yourCpSpent?: number
  theirCpGained?: number
  theirCpSpent?: number
  yourUnitsDestroyed?: string
  theirUnitsDestroyed?: string
  yourPhotoUrl?: string | null
  theirPhotoUrl?: string | null
  notes: string | null
}

type Secondary = {
  id: string
  player: string
  secondaryName: string
  vpPerRound: string
}

export function EndGameScreen({ matchId, onBack }: Props) {
  const { data: match } = trpc.match.get.useQuery({ id: matchId })

  if (!match) return <div className="p-6 text-slate-400">Loading...</div>

  const yourTotal = match.yourFinalScore ?? 0
  const theirTotal = match.theirFinalScore ?? 0

  const opponentDisplay = match.opponentName
    ? `${match.opponentName} (${match.opponentFaction})`
    : match.opponentFaction

  const turns = match.turns as Turn[]
  const secondaries = (match.secondaries ?? []) as Secondary[]

  const yourSecondaries = secondaries.filter((s) => s.player === 'YOUR')
  const theirSecondaries = secondaries.filter((s) => s.player === 'THEIRS')

  // Compute per-round breakdown with V3 per-player data
  const roundBreakdown = turns.map((turn) => ({
    round: turn.turnNumber,
    yourPrimary: turn.yourPrimary ?? turn.primaryScored,
    theirPrimary: turn.theirPrimary ?? 0,
    yourSecondary: turn.yourSecondary ?? turn.secondaryScored,
    theirSecondary: turn.theirSecondary ?? 0,
    yourVp: (turn.yourPrimary ?? turn.primaryScored) + (turn.yourSecondary ?? turn.secondaryScored),
    theirVp: (turn.theirPrimary ?? 0) + (turn.theirSecondary ?? 0),
    yourCpGained: turn.yourCpGained ?? 1,
    yourCpSpent: turn.yourCpSpent ?? turn.cpSpent,
    theirCpGained: turn.theirCpGained ?? 1,
    theirCpSpent: turn.theirCpSpent ?? 0,
    yourLost: JSON.parse(turn.yourUnitsLost) as Array<{ name: string }>,
    theirLost: JSON.parse(turn.theirUnitsLost) as Array<{ name: string }>,
    yourDestroyed: turn.yourUnitsDestroyed ? JSON.parse(turn.yourUnitsDestroyed) as Array<{ name: string }> : [],
    theirDestroyed: turn.theirUnitsDestroyed ? JSON.parse(turn.theirUnitsDestroyed) as Array<{ name: string }> : [],
    yourPhotoUrl: turn.yourPhotoUrl,
    theirPhotoUrl: turn.theirPhotoUrl,
    notes: turn.notes,
  }))

  const totalYourCpSpent = roundBreakdown.reduce((sum, r) => sum + r.yourCpSpent, 0)
  const totalTheirCpSpent = roundBreakdown.reduce((sum, r) => sum + r.theirCpSpent, 0)
  const totalYourLost = roundBreakdown.reduce((sum, r) => sum + r.yourLost.length, 0)
  const totalTheirLost = roundBreakdown.reduce((sum, r) => sum + r.theirLost.length, 0)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-100">
          Back
        </button>
        <a href="/" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors" title="Back to Home">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
          </svg>
          Home
        </a>
        <h1 className="text-xl font-bold text-amber-400">Match Summary</h1>
      </header>

      <div className="p-6 space-y-6">
        <p className="text-xs text-slate-500 mb-4">Here is your match summary with round-by-round breakdown. Tap Back to return to your match list and start a new game.</p>
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

        {/* Per-player stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
            <h4 className="text-xs text-slate-500 text-center mb-2">You</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">CP Used</span>
                <span className="font-medium text-slate-100">{totalYourCpSpent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Units Lost</span>
                <span className="font-medium text-red-400">{totalYourLost}</span>
              </div>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
            <h4 className="text-xs text-slate-500 text-center mb-2">Opponent</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">CP Used</span>
                <span className="font-medium text-slate-100">{totalTheirCpSpent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Units Lost</span>
                <span className="font-medium text-red-400">{totalTheirLost}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Secondaries summary */}
        {(yourSecondaries.length > 0 || theirSecondaries.length > 0) && (
          <div>
            <h3 className="font-semibold text-slate-300 mb-3">Secondaries</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <h4 className="text-xs text-slate-500">Yours</h4>
                {yourSecondaries.map((s) => {
                  const vps: number[] = JSON.parse(s.vpPerRound)
                  const total = vps.reduce((a, b) => a + b, 0)
                  return (
                    <div key={s.id} className="flex justify-between text-sm">
                      <span className="text-slate-300">{s.secondaryName}</span>
                      <span className="text-amber-400">{total} VP</span>
                    </div>
                  )
                })}
              </div>
              <div className="space-y-1">
                <h4 className="text-xs text-slate-500">Theirs</h4>
                {theirSecondaries.map((s) => {
                  const vps: number[] = JSON.parse(s.vpPerRound)
                  const total = vps.reduce((a, b) => a + b, 0)
                  return (
                    <div key={s.id} className="flex justify-between text-sm">
                      <span className="text-slate-300">{s.secondaryName}</span>
                      <span className="text-amber-400">{total} VP</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

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
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-1">
                    <div>
                      <span className="text-slate-500">You: </span>
                      <span className="text-amber-400">
                        {r.yourVp}VP (P:{r.yourPrimary} S:{r.yourSecondary})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Them: </span>
                      <span className="text-slate-400">
                        {r.theirVp}VP (P:{r.theirPrimary} S:{r.theirSecondary})
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    CP: You {r.yourCpSpent} / Them {r.theirCpSpent}
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
