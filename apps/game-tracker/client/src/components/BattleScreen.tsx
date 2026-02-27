import { useState, useMemo } from 'react'

import { trpc } from '../lib/trpc'
import { useStratagems, useList, useMissions } from '@tabletop-tools/game-data-store'
import { Scoreboard } from './battle/Scoreboard'
import { RoundWizard } from './battle/RoundWizard'
import type { TurnData } from './battle/types'
import type { SecondaryMission } from './battle/SecondaryPicker'

type Props = {
  matchId: string
  onBack: () => void
  onClose: () => void
}

export function BattleScreen({ matchId, onBack, onClose }: Props) {
  const { data: match, refetch } = trpc.match.get.useQuery({ id: matchId })
  const [yourFinalScore, setYourFinalScore] = useState('')
  const [theirFinalScore, setTheirFinalScore] = useState('')
  const [showEndGame, setShowEndGame] = useState(false)

  const addTurn = trpc.turn.add.useMutation({
    onSuccess: () => {
      void refetch()
    },
  })

  const closeMatch = trpc.match.close.useMutation({
    onSuccess: () => {
      onClose()
    },
  })

  // Secondary mutations (optional — may not exist if server not updated yet)
  const setSecondary = trpc.secondary?.set?.useMutation?.() ?? { mutate: () => {}, isPending: false }
  const removeSecondary = trpc.secondary?.remove?.useMutation?.() ?? { mutate: () => {}, isPending: false }
  const scoreSecondary = trpc.secondary?.score?.useMutation?.() ?? { mutate: () => {}, isPending: false }

  // Load stratagems from IndexedDB based on match faction/detachment
  const yourFaction = match?.yourFaction ?? ''
  const yourDetachment = match?.yourDetachment ?? ''
  const { data: yourStratagems } = useStratagems({ factionId: yourFaction, detachmentId: yourDetachment || undefined })

  // Load opponent stratagems if we know their faction
  const opponentFaction = match?.opponentFaction ?? ''
  const opponentDetachment = match?.opponentDetachment ?? ''
  const { data: theirStratagems } = useStratagems({ factionId: opponentFaction, detachmentId: opponentDetachment || undefined })

  // Load army list units from IndexedDB (if match has a listId)
  const listId = match?.listId ?? null
  const { data: armyList } = useList(listId)

  const yourArmyUnits = useMemo(() => {
    if (!armyList?.units) return []
    return armyList.units.map((u) => ({
      contentId: u.unitContentId,
      name: u.unitName,
    }))
  }, [armyList])

  // Load secondary missions from IndexedDB (type=secondary)
  const { data: indexedMissions = [] } = useMissions()
  const availableSecondaries = useMemo(() => {
    return indexedMissions
      .filter((m) => m.type === 'secondary')
      .map((m) => ({ id: m.id, name: m.name }))
  }, [indexedMissions])

  if (!match) return <div className="p-6 text-slate-400">Loading...</div>

  const turns = match.turns ?? []
  const secondaries: SecondaryMission[] = (match.secondaries ?? []).map((s: {
    id: string
    secondaryName: string
    vpPerRound: string
    player: string
  }) => ({
    id: s.id,
    secondaryName: s.secondaryName,
    vpPerRound: JSON.parse(s.vpPerRound) as number[],
    player: s.player,
  }))

  const yourSecondaries = secondaries.filter((s) => (s as SecondaryMission & { player: string }).player === 'YOUR')
  const theirSecondaries = secondaries.filter((s) => (s as SecondaryMission & { player: string }).player === 'THEIRS')

  // Compute VP totals from V3 per-player columns
  const yourTotalVp = turns.reduce(
    (sum: number, t: { yourPrimary?: number; yourSecondary?: number; primaryScored?: number; secondaryScored?: number }) =>
      sum + (t.yourPrimary ?? t.primaryScored ?? 0) + (t.yourSecondary ?? t.secondaryScored ?? 0),
    0,
  )
  const theirTotalVp = turns.reduce(
    (sum: number, t: { theirPrimary?: number; theirSecondary?: number }) =>
      sum + (t.theirPrimary ?? 0) + (t.theirSecondary ?? 0),
    0,
  )

  // Compute CP from previous rounds
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null
  const yourCp = lastTurn
    ? (lastTurn.yourCpStart ?? 0) + (lastTurn.yourCpGained ?? 1) - (lastTurn.yourCpSpent ?? 0)
    : 0
  const theirCp = lastTurn
    ? (lastTurn.theirCpStart ?? 0) + (lastTurn.theirCpGained ?? 1) - (lastTurn.theirCpSpent ?? 0)
    : 0

  const nextRound =
    (turns.length > 0 ? Math.max(...turns.map((t: { turnNumber: number }) => t.turnNumber)) : 0) + 1

  const opponentDisplay = match.opponentName
    ? `${match.opponentName} (${match.opponentFaction})`
    : match.opponentFaction

  const opponentShort = match.opponentName ?? match.opponentFaction

  function handleSaveRound(yourTurn: TurnData, theirTurn: TurnData) {
    const yourStratCp = yourTurn.stratagems.reduce((sum, s) => sum + s.cpCost, 0)
    const theirStratCp = theirTurn.stratagems.reduce((sum, s) => sum + s.cpCost, 0)

    const allStratagems = [
      ...yourTurn.stratagems.map((s) => ({ player: 'YOUR' as const, stratagemName: s.stratagemName, cpCost: s.cpCost })),
      ...theirTurn.stratagems.map((s) => ({ player: 'THEIRS' as const, stratagemName: s.stratagemName, cpCost: s.cpCost })),
    ]

    addTurn.mutate({
      matchId,
      turnNumber: nextRound,
      // Legacy fields (backward compat)
      yourUnitsLost: yourTurn.unitsDestroyed,
      theirUnitsLost: theirTurn.unitsDestroyed,
      primaryScored: yourTurn.primaryVp,
      secondaryScored: yourTurn.secondaryScores.reduce((sum, s) => sum + s.vp, 0),
      cpSpent: yourStratCp,
      notes: [yourTurn.notes, theirTurn.notes].filter(Boolean).join(' | ') || undefined,
      // V3 per-player fields
      yourCpStart: yourCp,
      yourCpGained: yourTurn.cpGained,
      yourCpSpent: yourStratCp,
      theirCpStart: theirCp,
      theirCpGained: theirTurn.cpGained,
      theirCpSpent: theirStratCp,
      yourPrimary: yourTurn.primaryVp,
      theirPrimary: theirTurn.primaryVp,
      yourSecondary: yourTurn.secondaryScores.reduce((sum, s) => sum + s.vp, 0),
      theirSecondary: theirTurn.secondaryScores.reduce((sum, s) => sum + s.vp, 0),
      yourUnitsDestroyed: JSON.stringify(yourTurn.unitsDestroyed),
      theirUnitsDestroyed: JSON.stringify(theirTurn.unitsDestroyed),
      yourPhotoDataUrl: yourTurn.photoDataUrl ?? undefined,
      theirPhotoDataUrl: theirTurn.photoDataUrl ?? undefined,
      stratagems: allStratagems.length > 0 ? allStratagems : undefined,
    })
  }

  function handleAddSecondary(player: 'YOUR' | 'THEIRS', name: string) {
    setSecondary.mutate({ matchId, player, secondaryName: name } as never, {
      onSuccess: () => void refetch(),
    } as never)
  }

  function handleRemoveSecondary(id: string) {
    removeSecondary.mutate({ secondaryId: id } as never, {
      onSuccess: () => void refetch(),
    } as never)
  }

  function handleScoreSecondary(id: string, roundNumber: number, vp: number) {
    scoreSecondary.mutate({ secondaryId: id, roundNumber, vp } as never, {
      onSuccess: () => void refetch(),
    } as never)
  }

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
          </p>
        </div>
      </header>

      <Scoreboard
        roundNumber={nextRound}
        yourVp={yourTotalVp}
        theirVp={theirTotalVp}
        yourCp={yourCp}
        theirCp={theirCp}
        opponentName={opponentShort}
      />

      {/* Round history */}
      {turns.length > 0 && (
        <div className="px-6 pt-4">
          <h3 className="text-sm font-medium text-slate-400 mb-2">Rounds recorded</h3>
          <div className="space-y-2">
            {turns.map((turn: {
              id: string
              turnNumber: number
              yourPrimary?: number
              theirPrimary?: number
              yourCpSpent?: number
              theirCpSpent?: number
              primaryScored?: number
              secondaryScored?: number
              cpSpent?: number
            }) => (
              <div
                key={turn.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800"
              >
                <span className="text-slate-300 font-medium">Round {turn.turnNumber}</span>
                <span className="text-amber-400 text-sm">
                  You: {(turn.yourPrimary ?? turn.primaryScored ?? 0)}VP
                  {' · '}
                  Them: {(turn.theirPrimary ?? 0)}VP
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Round wizard or end game */}
      {nextRound <= 5 && !showEndGame ? (
        <RoundWizard
          key={nextRound}
          roundNumber={nextRound}
          opponentName={opponentShort}
          requirePhotos={match.requirePhotos === 1}
          yourSecondaries={yourSecondaries}
          theirSecondaries={theirSecondaries}
          onAddSecondary={handleAddSecondary}
          onRemoveSecondary={handleRemoveSecondary}
          onScoreSecondary={handleScoreSecondary}
          onSave={handleSaveRound}
          isSaving={addTurn.isPending}
          whoGoesFirst={match.whoGoesFirst as 'YOU' | 'THEM' | null}
          yourStratagems={yourStratagems}
          theirStratagems={theirStratagems}
          yourArmyUnits={yourArmyUnits}
          availableSecondaries={availableSecondaries}
        />
      ) : null}

      {/* End game */}
      <div className="p-6 max-w-sm mx-auto">
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
