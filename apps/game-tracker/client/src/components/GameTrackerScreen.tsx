import { useState } from 'react'

import { authClient } from '../lib/auth'
import { HelpTip } from '@tabletop-tools/ui'
import { trpc } from '../lib/trpc'
import { MatchSetupScreen, type MatchSetupData } from './MatchSetupScreen'
import { MissionSetupScreen, type MissionSetupData } from './MissionSetupScreen'
import { PregameScreen, type PregameData } from './PregameScreen'
import { BattleScreen } from './BattleScreen'
import { EndGameScreen } from './EndGameScreen'

type Props = {
  onSignOut: () => void
}

type Screen =
  | { type: 'list' }
  | { type: 'match-setup' }
  | { type: 'mission-setup'; setupData: MatchSetupData }
  | { type: 'pregame'; setupData: MatchSetupData; missionData: MissionSetupData }
  | { type: 'battle'; matchId: string }
  | { type: 'summary'; matchId: string }

export function GameTrackerScreen({ onSignOut }: Props) {
  const [screen, setScreen] = useState<Screen>({ type: 'list' })

  const { data: matches = [], refetch: refetchMatches } = trpc.match.list.useQuery()

  const startMatch = trpc.match.start.useMutation({
    onSuccess: (match) => {
      setScreen({ type: 'battle', matchId: match.id })
      void refetchMatches()
    },
  })

  async function handleSignOut() {
    await authClient.signOut()
    onSignOut()
  }

  function handleStartBattle(
    setupData: MatchSetupData,
    missionData: MissionSetupData,
    pregameData: PregameData,
  ) {
    startMatch.mutate({
      opponentFaction: setupData.opponentFaction,
      mission: missionData.mission,
      isTournament: setupData.isTournament,
      listId: setupData.listId ?? undefined,
      opponentName: setupData.opponentName || undefined,
      opponentDetachment: setupData.opponentDetachment || undefined,
      yourFaction: setupData.yourFaction || undefined,
      yourDetachment: setupData.yourDetachment || undefined,
      terrainLayout: missionData.terrainLayout || undefined,
      deploymentZone: missionData.deploymentZone || undefined,
      twistCards: missionData.includeTwists ? JSON.stringify(missionData.twistCards) : undefined,
      challengerCards: missionData.includeChallenger ? JSON.stringify(missionData.challengerCards) : undefined,
      requirePhotos: missionData.requirePhotos,
      attackerDefender: pregameData.attackerDefender || undefined,
      whoGoesFirst: pregameData.whoGoesFirst || undefined,
      date: setupData.date || undefined,
      location: setupData.location || undefined,
      tournamentName: setupData.tournamentName || undefined,
      tournamentId: setupData.tournamentId ?? undefined,
    })
  }

  // ─── List Screen ─────────────────────────────────────────────────
  if (screen.type === 'list') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <h1><a href="/" className="text-2xl font-bold text-amber-400 hover:text-amber-300 transition-colors">Game Tracker</a></h1>
          <button
            onClick={() => void handleSignOut()}
            className="text-slate-400 hover:text-slate-100 text-sm"
          >
            Sign out
          </button>
        </header>

        <p className="text-[10px] text-slate-500 px-6 pt-2">Track 40K matches turn-by-turn: setup, mission, scoring, and end-game summary.</p>

        <div className="p-6">
          <button
            onClick={() => setScreen({ type: 'match-setup' })}
            className="mb-6 w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 transition-colors"
          >
            + New Match
          </button>

          <h2 className="text-lg font-semibold text-slate-300 mb-3">Match History<HelpTip text="Tap a match to view details or resume an in-progress game" /></h2>

          {matches.length === 0 && (
            <p className="text-slate-500 text-sm">No matches yet. Start a new match above.</p>
          )}

          <div className="space-y-3">
            {matches.map((match) => (
              <button
                key={match.id}
                onClick={() =>
                  setScreen(
                    match.result
                      ? { type: 'summary', matchId: match.id }
                      : { type: 'battle', matchId: match.id },
                  )
                }
                className="w-full text-left p-4 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-400/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-100">
                      vs {match.opponentName ? `${match.opponentName} (${match.opponentFaction})` : match.opponentFaction}
                    </p>
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

  // ─── Match Setup ─────────────────────────────────────────────────
  if (screen.type === 'match-setup') {
    return (
      <MatchSetupScreen
        onNext={(data) => setScreen({ type: 'mission-setup', setupData: data })}
        onBack={() => setScreen({ type: 'list' })}
      />
    )
  }

  // ─── Mission Setup ───────────────────────────────────────────────
  if (screen.type === 'mission-setup') {
    return (
      <MissionSetupScreen
        onNext={(missionData) =>
          setScreen({ type: 'pregame', setupData: screen.setupData, missionData })
        }
        onBack={() => setScreen({ type: 'match-setup' })}
      />
    )
  }

  // ─── Pregame ─────────────────────────────────────────────────────
  if (screen.type === 'pregame') {
    return (
      <PregameScreen
        opponentFaction={screen.setupData.opponentFaction}
        mission={screen.missionData.mission}
        onStart={(pregameData) =>
          handleStartBattle(screen.setupData, screen.missionData, pregameData)
        }
        onBack={() =>
          setScreen({ type: 'mission-setup', setupData: screen.setupData })
        }
      />
    )
  }

  // ─── Battle ──────────────────────────────────────────────────────
  if (screen.type === 'battle') {
    return (
      <BattleScreen
        matchId={screen.matchId}
        onBack={() => setScreen({ type: 'list' })}
        onClose={() => setScreen({ type: 'summary', matchId: screen.matchId })}
      />
    )
  }

  // ─── Summary ─────────────────────────────────────────────────────
  if (screen.type === 'summary') {
    return (
      <EndGameScreen
        matchId={screen.matchId}
        onBack={() => setScreen({ type: 'list' })}
      />
    )
  }

  return null
}
