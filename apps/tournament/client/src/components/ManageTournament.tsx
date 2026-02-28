import { useState } from 'react'
import { trpc } from '../lib/trpc'

type Props = {
  tournamentId: string
  onBack: () => void
}

export function ManageTournament({ tournamentId, onBack }: Props) {
  const [tab, setTab] = useState<'players' | 'cards' | 'awards'>('players')
  const [cardPlayerId, setCardPlayerId] = useState<string | null>(null)
  const [cardType, setCardType] = useState<'YELLOW' | 'RED'>('YELLOW')
  const [cardReason, setCardReason] = useState('')
  const [awardName, setAwardName] = useState('')
  const [awardDesc, setAwardDesc] = useState('')
  const [assignAwardId, setAssignAwardId] = useState<string | null>(null)
  const [assignRecipient, setAssignRecipient] = useState('')

  const playersQuery = trpc.player.list.useQuery({ tournamentId })
  const cardsQuery = trpc.card.listForTournament.useQuery({ tournamentId })
  const awardsQuery = trpc.award.list.useQuery({ tournamentId })

  const issueCard = trpc.card.issue.useMutation({
    onSuccess: () => {
      void cardsQuery.refetch()
      setCardPlayerId(null)
      setCardReason('')
    },
  })

  const createAward = trpc.award.create.useMutation({
    onSuccess: () => {
      void awardsQuery.refetch()
      setAwardName('')
      setAwardDesc('')
    },
  })

  const assignAward = trpc.award.assign.useMutation({
    onSuccess: () => {
      void awardsQuery.refetch()
      setAssignAwardId(null)
      setAssignRecipient('')
    },
  })

  const removePlayer = trpc.player.removePlayer.useMutation({
    onSuccess: () => void playersQuery.refetch(),
  })

  const reinstate = trpc.player.reinstate.useMutation({
    onSuccess: () => void playersQuery.refetch(),
  })

  const seedPlayers = trpc.player.seedTestPlayers.useMutation({
    onSuccess: () => void playersQuery.refetch(),
  })

  // Track which player's history we're viewing
  const [historyPlayerId, setHistoryPlayerId] = useState<string | null>(null)
  const historyQuery = trpc.card.playerHistory.useQuery(
    { playerId: historyPlayerId! },
    { enabled: !!historyPlayerId },
  )

  const players = playersQuery.data ?? []
  const cards = cardsQuery.data ?? []
  const awards = awardsQuery.data ?? []
  const playerHistory = historyQuery.data ?? []

  const activePlayers = players.filter((p) => !p.dropped)
  const droppedPlayers = players.filter((p) => p.dropped)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 max-w-2xl mx-auto">
      <button onClick={onBack} className="text-slate-400 hover:text-slate-200 mb-4 inline-block">
        Back to Tournament
      </button>
      <h2 className="text-xl font-bold mb-4">Manage Tournament</h2>
      <p className="text-xs text-slate-500 mb-4">
        Use the tabs to manage players (drop or reinstate), issue yellow/red cards, and create awards.
      </p>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6">
        {(['players', 'cards', 'awards'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded text-sm font-medium capitalize ${
              tab === t
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Players tab */}
      {tab === 'players' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-400 uppercase">
              Active Players ({activePlayers.length})
            </h3>
            <button
              onClick={() => seedPlayers.mutate({ tournamentId, count: 8 })}
              disabled={seedPlayers.isPending}
              className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700 rounded px-2 py-1"
            >
              {seedPlayers.isPending ? 'Loading...' : 'Load Test Players'}
            </button>
          </div>
          {activePlayers.map((p) => {
            const playerCards = cards.filter((c) => c.playerId === p.id)
            return (
              <div key={p.id} className="bg-slate-900 rounded p-3 flex justify-between items-start">
                <div>
                  <p className="font-medium text-slate-100">{p.displayName}</p>
                  <p className="text-sm text-slate-400">{p.faction}</p>
                  {playerCards.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {playerCards.map((c) => (
                        <span
                          key={c.id}
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            c.cardType === 'YELLOW'
                              ? 'bg-yellow-400/20 text-yellow-400'
                              : 'bg-red-400/20 text-red-400'
                          }`}
                        >
                          {c.cardType}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setHistoryPlayerId(historyPlayerId === p.id ? null : p.id)}
                    className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-400 hover:text-slate-200"
                  >
                    History
                  </button>
                  <button
                    onClick={() => {
                      setCardPlayerId(p.id)
                      setCardType('YELLOW')
                    }}
                    className="text-xs px-2 py-1 rounded bg-yellow-400/20 text-yellow-400 hover:bg-yellow-400/30"
                  >
                    Yellow
                  </button>
                  <button
                    onClick={() => {
                      setCardPlayerId(p.id)
                      setCardType('RED')
                    }}
                    className="text-xs px-2 py-1 rounded bg-red-400/20 text-red-400 hover:bg-red-400/30"
                  >
                    Red
                  </button>
                  <button
                    onClick={() => removePlayer.mutate({ playerId: p.id })}
                    className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-400 hover:text-slate-200"
                  >
                    Drop
                  </button>
                </div>
                {/* Player card history panel */}
                {historyPlayerId === p.id && (
                  <div className="col-span-full mt-2 p-3 rounded bg-slate-800 border border-slate-700">
                    <h5 className="text-xs font-medium text-slate-400 mb-2">Card History (all tournaments)</h5>
                    {playerHistory.length === 0 ? (
                      <p className="text-xs text-slate-500">No card history</p>
                    ) : (
                      <div className="space-y-1">
                        {playerHistory.map((h) => (
                          <div key={h.id} className="flex items-center gap-2 text-xs">
                            <span
                              className={`px-1.5 py-0.5 rounded font-medium ${
                                h.cardType === 'YELLOW'
                                  ? 'bg-yellow-400/20 text-yellow-400'
                                  : 'bg-red-400/20 text-red-400'
                              }`}
                            >
                              {h.cardType}
                            </span>
                            <span className="text-slate-400">{h.reason}</span>
                            <span className="text-slate-600 ml-auto">{new Date(h.issuedAt).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {droppedPlayers.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-slate-400 uppercase mt-4">
                Dropped ({droppedPlayers.length})
              </h3>
              {droppedPlayers.map((p) => (
                <div key={p.id} className="bg-slate-900 rounded p-3 flex justify-between items-center opacity-60">
                  <div>
                    <p className="font-medium text-slate-100">{p.displayName}</p>
                    <p className="text-sm text-slate-400">{p.faction}</p>
                  </div>
                  <button
                    onClick={() => reinstate.mutate({ playerId: p.id })}
                    className="text-xs px-2 py-1 rounded bg-emerald-400/20 text-emerald-400 hover:bg-emerald-400/30"
                  >
                    Reinstate
                  </button>
                </div>
              ))}
            </>
          )}

          {/* Card issue dialog */}
          {cardPlayerId && (
            <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 space-y-3">
              <h4 className="font-medium text-slate-300">
                Issue {cardType} Card to{' '}
                {players.find((p) => p.id === cardPlayerId)?.displayName}
              </h4>
              <input
                type="text"
                value={cardReason}
                onChange={(e) => setCardReason(e.target.value)}
                placeholder="Reason for card..."
                className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!cardReason.trim()) return
                    issueCard.mutate({
                      tournamentId,
                      playerId: cardPlayerId,
                      cardType,
                      reason: cardReason.trim(),
                    })
                  }}
                  disabled={!cardReason.trim() || issueCard.isPending}
                  className="px-4 py-2 rounded bg-amber-400 text-slate-950 font-semibold text-sm disabled:opacity-50"
                >
                  Issue Card
                </button>
                <button
                  onClick={() => setCardPlayerId(null)}
                  className="px-4 py-2 rounded text-slate-400 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cards tab */}
      {tab === 'cards' && (
        <div className="space-y-3">
          {cards.length === 0 && (
            <p className="text-slate-500 text-sm">No cards issued.</p>
          )}
          {cards.map((c) => {
            const player = players.find((p) => p.id === c.playerId)
            return (
              <div key={c.id} className="bg-slate-900 rounded p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        c.cardType === 'YELLOW'
                          ? 'bg-yellow-400/20 text-yellow-400'
                          : 'bg-red-400/20 text-red-400'
                      }`}
                    >
                      {c.cardType}
                    </span>
                    <span className="text-slate-100 ml-2 font-medium">
                      {player?.displayName ?? c.playerId}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(c.issuedAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1">{c.reason}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Awards tab */}
      {tab === 'awards' && (
        <div className="space-y-3">
          {awards.map((a) => {
            const recipient = players.find((p) => p.id === a.recipientId)
            return (
              <div key={a.id} className="bg-slate-900 rounded p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-amber-400">{a.name}</p>
                    {a.description && (
                      <p className="text-sm text-slate-400">{a.description}</p>
                    )}
                  </div>
                  {recipient ? (
                    <span className="text-sm text-emerald-400">{recipient.displayName}</span>
                  ) : (
                    <button
                      onClick={() => setAssignAwardId(a.id)}
                      className="text-xs px-2 py-1 rounded bg-amber-400/20 text-amber-400 hover:bg-amber-400/30"
                    >
                      Assign
                    </button>
                  )}
                </div>

                {assignAwardId === a.id && (
                  <div className="mt-2 flex gap-2 items-center">
                    <select
                      value={assignRecipient}
                      onChange={(e) => setAssignRecipient(e.target.value)}
                      className="flex-1 px-3 py-1 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm"
                    >
                      <option value="">Select player...</option>
                      {activePlayers.map((p) => (
                        <option key={p.id} value={p.id}>{p.displayName}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (!assignRecipient) return
                        assignAward.mutate({ awardId: a.id, recipientId: assignRecipient })
                      }}
                      disabled={!assignRecipient}
                      className="text-xs px-3 py-1 rounded bg-amber-400 text-slate-950 font-semibold disabled:opacity-50"
                    >
                      Assign
                    </button>
                    <button
                      onClick={() => setAssignAwardId(null)}
                      className="text-xs px-2 py-1 text-slate-400"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {/* Create award form */}
          <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 space-y-3">
            <h4 className="font-medium text-slate-300">Add Award</h4>
            <input
              type="text"
              value={awardName}
              onChange={(e) => setAwardName(e.target.value)}
              placeholder="Award name (e.g. Best Painted)"
              className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500"
            />
            <input
              type="text"
              value={awardDesc}
              onChange={(e) => setAwardDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500"
            />
            <button
              onClick={() => {
                if (!awardName.trim()) return
                createAward.mutate({
                  tournamentId,
                  name: awardName.trim(),
                  description: awardDesc.trim() || undefined,
                })
              }}
              disabled={!awardName.trim() || createAward.isPending}
              className="px-4 py-2 rounded bg-amber-400 text-slate-950 font-semibold text-sm disabled:opacity-50"
            >
              Add Award
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
