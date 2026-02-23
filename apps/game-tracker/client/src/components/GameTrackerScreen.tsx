import { useState } from 'react'

import { authClient } from '../lib/auth'
import { trpc } from '../lib/trpc'

type Props = {
  onSignOut: () => void
}

type View =
  | { type: 'list' }
  | { type: 'new-match' }
  | { type: 'active-match'; matchId: string }
  | { type: 'match-summary'; matchId: string }

export function GameTrackerScreen({ onSignOut }: Props) {
  const [view, setView] = useState<View>({ type: 'list' })
  const [opponentFaction, setOpponentFaction] = useState('')
  const [mission, setMission] = useState('')
  const [isTournament, setIsTournament] = useState(false)

  const { data: matches = [], refetch: refetchMatches } = trpc.match.list.useQuery()

  const startMatch = trpc.match.start.useMutation({
    onSuccess: (match) => {
      setView({ type: 'active-match', matchId: match.id })
      void refetchMatches()
      setOpponentFaction('')
      setMission('')
      setIsTournament(false)
    },
  })

  async function handleSignOut() {
    await authClient.signOut()
    onSignOut()
  }

  if (view.type === 'list') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-amber-400">Game Tracker</h1>
          <button
            onClick={() => void handleSignOut()}
            className="text-slate-400 hover:text-slate-100 text-sm"
          >
            Sign out
          </button>
        </header>

        <div className="p-6">
          <button
            onClick={() => setView({ type: 'new-match' })}
            className="mb-6 w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 transition-colors"
          >
            + New Match
          </button>

          <h2 className="text-lg font-semibold text-slate-300 mb-3">Match History</h2>

          {matches.length === 0 && (
            <p className="text-slate-500 text-sm">No matches yet. Start a new match above.</p>
          )}

          <div className="space-y-3">
            {matches.map((match) => (
              <button
                key={match.id}
                onClick={() =>
                  setView(
                    match.result
                      ? { type: 'match-summary', matchId: match.id }
                      : { type: 'active-match', matchId: match.id },
                  )
                }
                className="w-full text-left p-4 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-400/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-100">vs {match.opponentFaction}</p>
                    <p className="text-sm text-slate-400">{match.mission}</p>
                  </div>
                  <div className="text-right">
                    {match.result ? (
                      <span
                        className={`font-bold text-sm ${
                          match.result === 'WIN'
                            ? 'text-emerald-400'
                            : match.result === 'LOSS'
                              ? 'text-red-400'
                              : 'text-amber-400'
                        }`}
                      >
                        {match.result}
                      </span>
                    ) : (
                      <span className="text-amber-400 text-sm font-medium">In progress</span>
                    )}
                    {match.isTournament === 1 && (
                      <p className="text-xs text-slate-500 mt-0.5">Tournament</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (view.type === 'new-match') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setView({ type: 'list' })}
            className="text-slate-400 hover:text-slate-100"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-amber-400">New Match</h1>
        </header>

        <div className="p-6 space-y-4 max-w-sm mx-auto">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Opponent faction</label>
            <input
              type="text"
              value={opponentFaction}
              onChange={(e) => setOpponentFaction(e.target.value)}
              placeholder="e.g. Orks, Necrons, Tau…"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Mission</label>
            <input
              type="text"
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              placeholder="e.g. Scorched Earth, Priority Targets…"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isTournament}
              onChange={(e) => setIsTournament(e.target.checked)}
              className="w-4 h-4 rounded accent-amber-400"
            />
            <span className="text-sm text-slate-300">
              Tournament match <span className="text-slate-500">(feeds into meta analytics)</span>
            </span>
          </label>

          <button
            onClick={() => {
              if (!opponentFaction.trim() || !mission.trim()) return
              startMatch.mutate({
                opponentFaction: opponentFaction.trim(),
                mission: mission.trim(),
                isTournament,
              })
            }}
            disabled={!opponentFaction.trim() || !mission.trim() || startMatch.isPending}
            className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {startMatch.isPending ? 'Starting…' : 'Start Match'}
          </button>
        </div>
      </div>
    )
  }

  if (view.type === 'active-match') {
    return (
      <ActiveMatchView
        matchId={view.matchId}
        onBack={() => setView({ type: 'list' })}
        onClose={() => setView({ type: 'match-summary', matchId: view.matchId })}
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  if (view.type === 'match-summary') {
    return (
      <MatchSummaryView
        matchId={view.matchId}
        onBack={() => setView({ type: 'list' })}
      />
    )
  }

  return null
}

// ─── Active Match View ───────────────────────────────────────────────────────

type ActiveMatchProps = {
  matchId: string
  onBack: () => void
  onClose: () => void
  onSignOut: () => void
}

function ActiveMatchView({ matchId, onBack, onClose }: ActiveMatchProps) {
  const { data: match, refetch } = trpc.match.get.useQuery({ id: matchId })
  const [primaryVp, setPrimaryVp] = useState('')
  const [secondaryVp, setSecondaryVp] = useState('')
  const [cpSpent, setCpSpent] = useState('')
  const [yourUnitsLost, setYourUnitsLost] = useState('')
  const [theirUnitsLost, setTheirUnitsLost] = useState('')
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
      void refetch()
    },
  })

  const closeMatch = trpc.match.close.useMutation({
    onSuccess: () => {
      onClose()
    },
  })

  if (!match) return <div className="p-6 text-slate-400">Loading…</div>

  const yourTotalVp = match.turns.reduce(
    (sum, t) => sum + t.primaryScored + t.secondaryScored,
    0,
  )
  const nextTurnNumber = (match.turns.length > 0 ? Math.max(...match.turns.map((t) => t.turnNumber)) : 0) + 1

  function parseUnits(raw: string): Array<{ contentId: string; name: string }> {
    if (!raw.trim()) return []
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ contentId: name.toLowerCase().replace(/\s+/g, '-'), name }))
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-100">
          ← Back
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-amber-400">vs {match.opponentFaction}</h1>
          <p className="text-sm text-slate-400">{match.mission}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-amber-400">{yourTotalVp}VP</p>
        </div>
      </header>

      {/* Turn history */}
      {match.turns.length > 0 && (
        <div className="px-6 pt-4">
          <h3 className="text-sm font-medium text-slate-400 mb-2">Turns recorded</h3>
          <div className="space-y-2">
            {match.turns.map((turn) => (
              <div key={turn.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-300 font-medium">Turn {turn.turnNumber}</span>
                <span className="text-amber-400 text-sm">
                  Primary: {turn.primaryScored} · Secondary: {turn.secondaryScored} · CP: {turn.cpSpent}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add turn form */}
      <div className="p-6 space-y-4 max-w-sm mx-auto">
        <h3 className="font-semibold text-slate-300">Turn {nextTurnNumber}</h3>

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
          <label className="block text-xs text-slate-500 mb-1">Your units lost (comma-separated)</label>
          <input
            type="text"
            value={yourUnitsLost}
            onChange={(e) => setYourUnitsLost(e.target.value)}
            placeholder="Intercessors, Dreadnought…"
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Their units lost (comma-separated)</label>
          <input
            type="text"
            value={theirUnitsLost}
            onChange={(e) => setTheirUnitsLost(e.target.value)}
            placeholder="Boyz, Warboss…"
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
            })
          }}
          disabled={addTurn.isPending}
          className="w-full py-2 rounded-lg bg-slate-800 text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 font-semibold disabled:opacity-50"
        >
          {addTurn.isPending ? 'Saving…' : `End Turn ${nextTurnNumber}`}
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
                {closeMatch.isPending ? 'Saving…' : 'Confirm Result'}
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

// ─── Match Summary View ───────────────────────────────────────────────────────

type MatchSummaryProps = {
  matchId: string
  onBack: () => void
}

function MatchSummaryView({ matchId, onBack }: MatchSummaryProps) {
  const { data: match } = trpc.match.get.useQuery({ id: matchId })

  if (!match) return <div className="p-6 text-slate-400">Loading…</div>

  const yourTotal = match.yourFinalScore ?? 0
  const theirTotal = match.theirFinalScore ?? 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-100">
          ← Back
        </button>
        <h1 className="text-xl font-bold text-amber-400">Match Summary</h1>
      </header>

      <div className="p-6 space-y-6">
        {/* Result */}
        <div className="text-center p-6 rounded-xl bg-slate-900 border border-slate-700">
          <p className="text-sm text-slate-400 mb-1">vs {match.opponentFaction} · {match.mission}</p>
          <p
            className={`text-4xl font-bold ${
              match.result === 'WIN'
                ? 'text-emerald-400'
                : match.result === 'LOSS'
                  ? 'text-red-400'
                  : 'text-amber-400'
            }`}
          >
            {match.result ?? '—'}
          </p>
          <p className="text-slate-300 mt-2 text-lg">
            {yourTotal} – {theirTotal}
          </p>
        </div>

        {/* Turn history */}
        <div>
          <h3 className="font-semibold text-slate-300 mb-3">Turn by Turn</h3>
          <div className="space-y-2">
            {match.turns.map((turn) => {
              const yourVp = turn.primaryScored + turn.secondaryScored
              const lost = JSON.parse(turn.yourUnitsLost) as Array<{ name: string }>
              return (
                <div key={turn.id} className="p-4 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-200">Turn {turn.turnNumber}</span>
                    <span className="text-amber-400 text-sm">{yourVp}VP</span>
                  </div>
                  {lost.length > 0 && (
                    <p className="text-sm text-red-400">
                      Lost: {lost.map((u) => u.name).join(', ')}
                    </p>
                  )}
                  {turn.notes && <p className="text-sm text-slate-500 mt-1 italic">{turn.notes}</p>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
