import { useState } from 'react'
import { authClient } from '../lib/auth'
import { trpc } from '../lib/trpc'

type Props = { onSignOut: () => void }

type View =
  | 'list'
  | 'create-tournament'
  | 'tournament-detail'
  | 'register-player'
  | 'round-view'

type Tournament = {
  id: string
  name: string
  status: string
  totalRounds: number
  toUserId: string
  eventDate: number
  format: string
  location: string | null
  createdAt: number
  playerCount?: number
}

type PlayerStanding = {
  rank: number
  id: string
  displayName: string
  faction: string
  wins: number
  losses: number
  draws: number
  margin: number
  totalVP: number
  strengthOfSchedule: number
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: 'text-slate-400 bg-slate-800',
    REGISTRATION: 'text-amber-400 bg-amber-400/10',
    CHECK_IN: 'text-blue-400 bg-blue-400/10',
    IN_PROGRESS: 'text-emerald-400 bg-emerald-400/10',
    COMPLETE: 'text-slate-400 bg-slate-800',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${colors[status] ?? 'text-slate-400'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function StandingsTable({ players }: { players: PlayerStanding[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-slate-300">
        <thead className="text-xs text-slate-500 uppercase">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2">Faction</th>
            <th className="px-3 py-2 text-center">W</th>
            <th className="px-3 py-2 text-center">L</th>
            <th className="px-3 py-2 text-center">D</th>
            <th className="px-3 py-2 text-center">+/-</th>
            <th className="px-3 py-2 text-center">VP</th>
            <th className="px-3 py-2 text-center">SOS</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className="border-t border-slate-800">
              <td className="px-3 py-2 text-slate-500">{p.rank}</td>
              <td className="px-3 py-2 font-medium text-slate-100">{p.displayName}</td>
              <td className="px-3 py-2 text-slate-400">{p.faction}</td>
              <td className="px-3 py-2 text-center text-emerald-400">{p.wins}</td>
              <td className="px-3 py-2 text-center text-red-400">{p.losses}</td>
              <td className="px-3 py-2 text-center">{p.draws}</td>
              <td className={`px-3 py-2 text-center ${p.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {p.margin >= 0 ? '+' : ''}{p.margin}
              </td>
              <td className="px-3 py-2 text-center">{p.totalVP}</td>
              <td className="px-3 py-2 text-center">{(p.strengthOfSchedule * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TournamentScreen({ onSignOut }: Props) {
  const { data: session } = authClient.useSession()
  const userId = session?.user?.id ?? ''

  const [view, setView] = useState<View>('list')
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)

  // Create tournament form
  const [newName, setNewName] = useState('')
  const [newFormat, setNewFormat] = useState('2000pts Matched Play')
  const [newRounds, setNewRounds] = useState('5')
  const [newLocation, setNewLocation] = useState('')

  // Register form
  const [regName, setRegName] = useState('')
  const [regFaction, setRegFaction] = useState('')
  const [regList, setRegList] = useState('')

  // Result reporting
  const [reportP1VP, setReportP1VP] = useState('')
  const [reportP2VP, setReportP2VP] = useState('')
  const [reportingPairingId, setReportingPairingId] = useState<string | null>(null)

  const myTournamentsQuery = trpc.tournament.listMine.useQuery()
  const tournamentDetailQuery = trpc.tournament.get.useQuery(selectedTournamentId!, {
    enabled: !!selectedTournamentId,
  })
  const standingsQuery = trpc.tournament.standings.useQuery(selectedTournamentId!, {
    enabled: !!selectedTournamentId,
  })
  const roundDetailQuery = trpc.round.get.useQuery(selectedRoundId!, {
    enabled: !!selectedRoundId,
  })

  const createTournament = trpc.tournament.create.useMutation({
    onSuccess: (t) => {
      void myTournamentsQuery.refetch()
      if (t) {
        setSelectedTournamentId(t.id)
        setView('tournament-detail')
      }
    },
  })

  const advanceStatus = trpc.tournament.advanceStatus.useMutation({
    onSuccess: () => {
      void tournamentDetailQuery.refetch()
      void myTournamentsQuery.refetch()
    },
  })

  const registerPlayer = trpc.player.register.useMutation({
    onSuccess: () => {
      void myTournamentsQuery.refetch()
      setView('tournament-detail')
    },
  })

  const checkIn = trpc.player.checkIn.useMutation({
    onSuccess: () => void myTournamentsQuery.refetch(),
  })

  const createRound = trpc.round.create.useMutation({
    onSuccess: (round) => {
      void tournamentDetailQuery.refetch()
      if (round) {
        setSelectedRoundId(round.id)
        setView('round-view')
      }
    },
  })

  const generatePairings = trpc.round.generatePairings.useMutation({
    onSuccess: () => void roundDetailQuery.refetch(),
  })

  const closeRound = trpc.round.close.useMutation({
    onSuccess: () => {
      void roundDetailQuery.refetch()
      void standingsQuery.refetch()
    },
  })

  const reportResult = trpc.result.report.useMutation({
    onSuccess: () => {
      void roundDetailQuery.refetch()
      setReportingPairingId(null)
      setReportP1VP('')
      setReportP2VP('')
    },
  })

  const confirmResult = trpc.result.confirm.useMutation({
    onSuccess: () => void roundDetailQuery.refetch(),
  })

  function handleCreateTournament(e: React.FormEvent) {
    e.preventDefault()
    createTournament.mutate({
      name: newName,
      eventDate: Date.now(),
      location: newLocation || undefined,
      format: newFormat,
      totalRounds: parseInt(newRounds, 10),
    })
    setNewName('')
    setNewLocation('')
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTournamentId) return
    registerPlayer.mutate({
      tournamentId: selectedTournamentId,
      displayName: regName,
      faction: regFaction,
      listText: regList || undefined,
    })
    setRegName('')
    setRegFaction('')
    setRegList('')
  }

  function handleReport(e: React.FormEvent) {
    e.preventDefault()
    if (!reportingPairingId) return
    reportResult.mutate({
      pairingId: reportingPairingId,
      player1VP: parseInt(reportP1VP, 10),
      player2VP: parseInt(reportP2VP, 10),
    })
  }

  const tournaments = myTournamentsQuery.data ?? []
  const tournament = tournamentDetailQuery.data
  const standings = standingsQuery.data
  const roundDetail = roundDetailQuery.data
  const pairings = roundDetail?.pairings ?? []

  const isTO = tournament?.toUserId === userId

  if (view === 'create-tournament') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 max-w-lg mx-auto">
        <button onClick={() => setView('list')} className="text-slate-400 hover:text-slate-200 mb-4">
          ← Back
        </button>
        <h2 className="text-xl font-bold mb-4">Create Tournament</h2>
        <form onSubmit={(e) => void handleCreateTournament(e)} className="space-y-3">
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
            placeholder="Tournament name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
            placeholder="Format (e.g. 2000pts Matched Play)"
            value={newFormat}
            onChange={(e) => setNewFormat(e.target.value)}
            required
          />
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
            placeholder="Location (optional)"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
          />
          <div className="flex gap-2 items-center">
            <label className="text-slate-400 text-sm">Rounds:</label>
            <input
              type="number"
              min={1}
              max={10}
              className="w-20 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
              value={newRounds}
              onChange={(e) => setNewRounds(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={createTournament.isPending}
            className="w-full py-2 rounded bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 disabled:opacity-50"
          >
            Create Tournament
          </button>
        </form>
      </div>
    )
  }

  if (view === 'register-player' && selectedTournamentId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 max-w-lg mx-auto">
        <button
          onClick={() => setView('tournament-detail')}
          className="text-slate-400 hover:text-slate-200 mb-4"
        >
          ← Back
        </button>
        <h2 className="text-xl font-bold mb-4">Register for Tournament</h2>
        <form onSubmit={(e) => void handleRegister(e)} className="space-y-3">
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
            placeholder="Display name (shown on pairings board)"
            value={regName}
            onChange={(e) => setRegName(e.target.value)}
            required
          />
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
            placeholder="Faction (e.g. Space Marines)"
            value={regFaction}
            onChange={(e) => setRegFaction(e.target.value)}
            required
          />
          <textarea
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100 h-40 font-mono text-sm"
            placeholder="Paste your army list here (optional until lists are locked)…"
            value={regList}
            onChange={(e) => setRegList(e.target.value)}
          />
          <button
            type="submit"
            disabled={registerPlayer.isPending}
            className="w-full py-2 rounded bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 disabled:opacity-50"
          >
            Register
          </button>
        </form>
      </div>
    )
  }

  if (view === 'round-view' && selectedRoundId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 max-w-2xl mx-auto">
        <button
          onClick={() => setView('tournament-detail')}
          className="text-slate-400 hover:text-slate-200 mb-4"
        >
          ← Back to Tournament
        </button>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            Round {roundDetail?.roundNumber ?? '…'} — <span className="text-slate-400">{roundDetail?.status}</span>
          </h2>
          {isTO && roundDetail?.status === 'PENDING' && (
            <button
              onClick={() => generatePairings.mutate({ roundId: selectedRoundId })}
              disabled={generatePairings.isPending}
              className="px-4 py-1.5 rounded bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 disabled:opacity-50 text-sm"
            >
              Generate Pairings
            </button>
          )}
          {isTO && roundDetail?.status === 'ACTIVE' && (
            <button
              onClick={() => closeRound.mutate(selectedRoundId)}
              disabled={closeRound.isPending}
              className="px-4 py-1.5 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-50 text-sm"
            >
              Close Round
            </button>
          )}
        </div>

        {pairings.length === 0 && (
          <p className="text-slate-400">No pairings yet. Generate pairings to start the round.</p>
        )}

        <div className="space-y-3">
          {pairings
            .filter((p) => p.result !== 'BYE')
            .map((p) => (
              <div key={p.id} className="bg-slate-900 rounded p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">
                      Table {p.tableNumber} · {p.mission}
                    </p>
                    <p className="text-slate-100 font-medium">
                      {p.player1Id} vs {p.player2Id ?? 'BYE'}
                    </p>
                  </div>
                  <div className="text-right">
                    {p.result ? (
                      <div>
                        <span
                          className={`font-bold ${
                            p.result === 'P1_WIN'
                              ? 'text-emerald-400'
                              : p.result === 'P2_WIN'
                                ? 'text-red-400'
                                : 'text-amber-400'
                          }`}
                        >
                          {p.player1Vp} – {p.player2Vp}
                        </span>
                        {p.confirmed ? (
                          <p className="text-xs text-emerald-400">Confirmed</p>
                        ) : (
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={() => confirmResult.mutate(p.id)}
                              className="text-xs px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                            >
                              Confirm
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => setReportingPairingId(p.id)}
                        className="text-xs px-3 py-1 rounded bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300"
                      >
                        Report Result
                      </button>
                    )}
                  </div>
                </div>

                {reportingPairingId === p.id && (
                  <form
                    onSubmit={(e) => void handleReport(e)}
                    className="mt-3 flex gap-2 items-end"
                  >
                    <div>
                      <label className="text-xs text-slate-500 block">P1 VP</label>
                      <input
                        type="number"
                        min={0}
                        value={reportP1VP}
                        onChange={(e) => setReportP1VP(e.target.value)}
                        required
                        className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block">P2 VP</label>
                      <input
                        type="number"
                        min={0}
                        value={reportP2VP}
                        onChange={(e) => setReportP2VP(e.target.value)}
                        required
                        className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-100"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={reportResult.isPending}
                      className="px-3 py-1 rounded bg-amber-400 text-slate-950 font-semibold text-sm disabled:opacity-50"
                    >
                      Submit
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportingPairingId(null)}
                      className="px-3 py-1 rounded text-slate-400 text-sm"
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>
            ))}
          {pairings.filter((p) => p.result === 'BYE').map((p) => (
            <div key={p.id} className="bg-slate-900 rounded p-3 text-slate-400 text-sm">
              BYE: {p.player1Id}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (view === 'tournament-detail' && selectedTournamentId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 max-w-2xl mx-auto">
        <button onClick={() => setView('list')} className="text-slate-400 hover:text-slate-200 mb-4">
          ← All Tournaments
        </button>

        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold">{tournament?.name ?? '…'}</h2>
            <p className="text-slate-400 text-sm mt-1">
              {tournament?.format} · {tournament?.totalRounds} rounds
            </p>
            {tournament?.location && (
              <p className="text-slate-500 text-sm">{tournament.location}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {tournament && <StatusBadge status={tournament.status} />}
            {isTO && tournament && tournament.status !== 'COMPLETE' && (
              <button
                onClick={() => advanceStatus.mutate(selectedTournamentId)}
                disabled={advanceStatus.isPending}
                className="text-xs px-3 py-1 rounded border border-amber-400 text-amber-400 hover:bg-amber-400 hover:text-slate-950 disabled:opacity-50"
              >
                Advance →
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {tournament?.status === 'REGISTRATION' && !isTO && (
            <button
              onClick={() => setView('register-player')}
              className="px-4 py-2 rounded bg-amber-400 text-slate-950 font-semibold text-sm hover:bg-amber-300"
            >
              Register
            </button>
          )}
          {isTO && tournament?.status === 'IN_PROGRESS' && (
            <button
              onClick={() => createRound.mutate({ tournamentId: selectedTournamentId })}
              disabled={createRound.isPending}
              className="px-4 py-2 rounded bg-amber-400 text-slate-950 font-semibold text-sm hover:bg-amber-300 disabled:opacity-50"
            >
              + New Round
            </button>
          )}
        </div>

        {/* Standings */}
        {standings && standings.players.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-500 uppercase mb-2">
              Standings · Round {standings.round}
            </h3>
            <StandingsTable players={standings.players} />
          </div>
        )}

        {/* Player count */}
        <p className="text-slate-500 text-sm">
          {tournament?.playerCount ?? 0} player{tournament?.playerCount === 1 ? '' : 's'} registered
        </p>
      </div>
    )
  }

  // Default: tournament list view
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-2xl mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Tournament</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setView('create-tournament')}
              className="px-4 py-2 rounded bg-amber-400 text-slate-950 font-semibold text-sm hover:bg-amber-300"
            >
              + New Tournament
            </button>
            <button
              onClick={() => {
                void authClient.signOut().then(() => onSignOut())
              }}
              className="px-4 py-2 rounded border border-slate-700 text-slate-400 hover:text-slate-200 text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>

        {myTournamentsQuery.isPending && (
          <p className="text-slate-400">Loading…</p>
        )}

        {tournaments.length === 0 && !myTournamentsQuery.isPending && (
          <div className="text-center py-12 text-slate-500">
            <p>No tournaments yet.</p>
            <p className="text-sm mt-1">Create one or register for an open event.</p>
          </div>
        )}

        <div className="space-y-3">
          {tournaments.map((t: Tournament) => (
            <button
              key={t.id}
              onClick={() => {
                setSelectedTournamentId(t.id)
                setView('tournament-detail')
              }}
              className="w-full text-left bg-slate-900 rounded p-4 hover:bg-slate-800 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-slate-100">{t.name}</p>
                  <p className="text-sm text-slate-400 mt-0.5">{t.format}</p>
                  {t.location && (
                    <p className="text-xs text-slate-500">{t.location}</p>
                  )}
                </div>
                <StatusBadge status={t.status} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
