import { useState } from 'react'

import { trpc } from '../lib/trpc'

type Props = {
  matchId: string
  onBack: () => void
  onClose: () => void
}

export function BattleScreen({ matchId, onBack, onClose }: Props) {
  const { data: match, refetch } = trpc.match.get.useQuery({ id: matchId })
  const [primaryVp, setPrimaryVp] = useState('')
  const [secondaryVp, setSecondaryVp] = useState('')
  const [cpSpent, setCpSpent] = useState('')
  const [yourUnitsLost, setYourUnitsLost] = useState('')
  const [theirUnitsLost, setTheirUnitsLost] = useState('')
  const [notes, setNotes] = useState('')
  const [yourFinalScore, setYourFinalScore] = useState('')
  const [theirFinalScore, setTheirFinalScore] = useState('')
  const [showEndGame, setShowEndGame] = useState(false)

  const addTurn = trpc.turn.add.useMutation({
    onSuccess: () => {
      setPrimaryVp('')
      setSecondaryVp('')
      setCpSpent('')
      setYourUnitsLost('')
      setTheirUnitsLost('')
      setNotes('')
      void refetch()
    },
  })

  const closeMatch = trpc.match.close.useMutation({
    onSuccess: () => {
      onClose()
    },
  })

  if (!match) return <div className="p-6 text-slate-400">Loading...</div>

  const yourTotalVp = match.turns.reduce(
    (sum, t) => sum + t.primaryScored + t.secondaryScored,
    0,
  )
  const nextTurnNumber =
    (match.turns.length > 0 ? Math.max(...match.turns.map((t) => t.turnNumber)) : 0) + 1

  function parseUnits(raw: string): Array<{ contentId: string; name: string }> {
    if (!raw.trim()) return []
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ contentId: name.toLowerCase().replace(/\s+/g, '-'), name }))
  }

  const opponentDisplay = match.opponentName
    ? `${match.opponentName} (${match.opponentFaction})`
    : match.opponentFaction

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-100">
          Back
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-amber-400">vs {opponentDisplay}</h1>
          <p className="text-sm text-slate-400">
            {match.mission}
            {match.deploymentZone ? ` · ${match.deploymentZone}` : ''}
            {` · Round ${nextTurnNumber} of 5`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-amber-400">{yourTotalVp}VP</p>
        </div>
      </header>

      {/* Turn history */}
      {match.turns.length > 0 && (
        <div className="px-6 pt-4">
          <h3 className="text-sm font-medium text-slate-400 mb-2">Rounds recorded</h3>
          <div className="space-y-2">
            {match.turns.map((turn) => (
              <div
                key={turn.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800"
              >
                <span className="text-slate-300 font-medium">Round {turn.turnNumber}</span>
                <span className="text-amber-400 text-sm">
                  P:{turn.primaryScored} S:{turn.secondaryScored} CP:{turn.cpSpent}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add turn form */}
      <div className="p-6 space-y-4 max-w-sm mx-auto">
        <h3 className="font-semibold text-slate-300">Round {nextTurnNumber}</h3>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Primary VP</label>
            <input
              type="number"
              min="0"
              value={primaryVp}
              onChange={(e) => setPrimaryVp(e.target.value)}
              placeholder="0"
              className="w-full px-2 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-center focus:outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Secondary VP</label>
            <input
              type="number"
              min="0"
              value={secondaryVp}
              onChange={(e) => setSecondaryVp(e.target.value)}
              placeholder="0"
              className="w-full px-2 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-center focus:outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">CP spent</label>
            <input
              type="number"
              min="0"
              value={cpSpent}
              onChange={(e) => setCpSpent(e.target.value)}
              placeholder="0"
              className="w-full px-2 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-center focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">
            Your units lost (comma-separated)
          </label>
          <input
            type="text"
            value={yourUnitsLost}
            onChange={(e) => setYourUnitsLost(e.target.value)}
            placeholder="Intercessors, Dreadnought..."
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">
            Their units lost (comma-separated)
          </label>
          <input
            type="text"
            value={theirUnitsLost}
            onChange={(e) => setTheirUnitsLost(e.target.value)}
            placeholder="Boyz, Warboss..."
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional round notes..."
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>

        <button
          onClick={() => {
            addTurn.mutate({
              matchId,
              turnNumber: nextTurnNumber,
              yourUnitsLost: parseUnits(yourUnitsLost),
              theirUnitsLost: parseUnits(theirUnitsLost),
              primaryScored: Number(primaryVp) || 0,
              secondaryScored: Number(secondaryVp) || 0,
              cpSpent: Number(cpSpent) || 0,
              notes: notes.trim() || undefined,
            })
          }}
          disabled={addTurn.isPending}
          className="w-full py-2 rounded-lg bg-slate-800 text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 font-semibold disabled:opacity-50"
        >
          {addTurn.isPending ? 'Saving...' : `End Round ${nextTurnNumber}`}
        </button>

        {/* End game */}
        {!showEndGame ? (
          <button
            onClick={() => setShowEndGame(true)}
            className="w-full py-2 rounded-lg bg-red-900/30 text-red-400 border border-red-900 hover:bg-red-900/50 text-sm"
          >
            End Game
          </button>
        ) : (
          <div className="space-y-3 p-4 rounded-lg bg-slate-900 border border-slate-700">
            <h4 className="font-medium text-slate-300">Final Scores</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Your score</label>
                <input
                  type="number"
                  min="0"
                  value={yourFinalScore}
                  onChange={(e) => setYourFinalScore(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-center focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Their score</label>
                <input
                  type="number"
                  min="0"
                  value={theirFinalScore}
                  onChange={(e) => setTheirFinalScore(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-center focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  closeMatch.mutate({
                    matchId,
                    yourScore: Number(yourFinalScore) || 0,
                    theirScore: Number(theirFinalScore) || 0,
                  })
                }}
                disabled={closeMatch.isPending}
                className="flex-1 py-2 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 disabled:opacity-50"
              >
                {closeMatch.isPending ? 'Saving...' : 'Confirm Result'}
              </button>
              <button
                onClick={() => setShowEndGame(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
