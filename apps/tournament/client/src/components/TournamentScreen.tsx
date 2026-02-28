import { useState } from 'react'
import { authClient } from '../lib/auth'
import { HelpTip, SimpleMarkdown } from '@tabletop-tools/ui'
import { trpc } from '../lib/trpc'
import { useHashRoute, navigate } from '../lib/router'
import type { Route } from '../lib/router'
import { ManageTournament } from './ManageTournament'

type Props = { onSignOut: () => void }

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
  toName?: string | null
  description?: string | null
  imageUrl?: string | null
  startTime?: string | null
  externalLink?: string | null
  maxPlayers?: number | null
  requirePhotos?: number
  includeTwists?: number
  includeChallenger?: number
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
  const route = useHashRoute()

  // Extract IDs from route
  const selectedTournamentId = route.view === 'tournament' || route.view === 'tournament-standings' || route.view === 'tournament-register' || route.view === 'tournament-manage'
    ? route.id
    : route.view === 'round'
      ? route.tournamentId
      : null
  const selectedRoundId = route.view === 'round' ? route.roundId : null

  // Create tournament form
  const [newName, setNewName] = useState('')
  const [newFormat, setNewFormat] = useState('2000pts Matched Play')
  const [newRounds, setNewRounds] = useState('5')
  const [newLocation, setNewLocation] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newStartTime, setNewStartTime] = useState('')
  const [newMaxPlayers, setNewMaxPlayers] = useState('')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newExternalLink, setNewExternalLink] = useState('')
  const [newRequirePhotos, setNewRequirePhotos] = useState(false)
  const [newIncludeTwists, setNewIncludeTwists] = useState(false)
  const [newIncludeChallenger, setNewIncludeChallenger] = useState(false)

  // Register form
  const [regName, setRegName] = useState('')
  const [regFaction, setRegFaction] = useState(() => {
    try {
      const stored = localStorage.getItem('tournament-list')
      if (stored) return JSON.parse(stored).faction ?? ''
    } catch { /* ignore */ }
    return ''
  })
  const [regList, setRegList] = useState('')

  // Round start time
  const [roundStartTime, setRoundStartTime] = useState('')

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
  const awardsQuery = trpc.award.list.useQuery(
    { tournamentId: selectedTournamentId! },
    { enabled: !!selectedTournamentId },
  )

  const createTournament = trpc.tournament.create.useMutation({
    onSuccess: (t) => {
      void myTournamentsQuery.refetch()
      if (t) navigate(`#/tournament/${t.id}`)
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
      if (selectedTournamentId) navigate(`#/tournament/${selectedTournamentId}`)
    },
  })

  const checkIn = trpc.player.checkIn.useMutation({
    onSuccess: () => void myTournamentsQuery.refetch(),
  })
  // Suppress unused var warning — checkIn is used in registration flow
  void checkIn

  const createRound = trpc.round.create.useMutation({
    onSuccess: (round) => {
      void tournamentDetailQuery.refetch()
      setRoundStartTime('')
      if (round && selectedTournamentId) {
        navigate(`#/tournament/${selectedTournamentId}/round/${round.id}`)
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
      description: newDescription || undefined,
      imageUrl: newImageUrl || undefined,
      startTime: newStartTime || undefined,
      maxPlayers: newMaxPlayers ? parseInt(newMaxPlayers, 10) : undefined,
      externalLink: newExternalLink || undefined,
      requirePhotos: newRequirePhotos,
      includeTwists: newIncludeTwists,
      includeChallenger: newIncludeChallenger,
    })
    setNewName('')
    setNewLocation('')
    setNewDescription('')
    setNewStartTime('')
    setNewMaxPlayers('')
    setNewImageUrl('')
    setNewExternalLink('')
    setNewRequirePhotos(false)
    setNewIncludeTwists(false)
    setNewIncludeChallenger(false)
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

  if (route.view === 'create') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 max-w-lg mx-auto">
        <a href="#/" className="text-slate-400 hover:text-slate-200 mb-4 inline-block">
          ← Back
        </a>
        <h2 className="text-xl font-bold mb-4">Create Tournament</h2>
        <p className="text-xs text-slate-500 mb-4">
          Fill in the details below to set up your event. You can change settings later while the tournament is still in DRAFT status.
        </p>
        <form onSubmit={(e) => void handleCreateTournament(e)} className="space-y-3">
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
            placeholder="Tournament name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <div>
            <label className="text-slate-400 text-xs flex items-center mb-1">Format<HelpTip text="Game format and points level, e.g. 2000pts Matched Play or 1000pts Incursion" /></label>
            <input
              className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
              placeholder="Format (e.g. 2000pts Matched Play)"
              value={newFormat}
              onChange={(e) => setNewFormat(e.target.value)}
              required
            />
          </div>
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
            placeholder="Location (optional)"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
          />
          <div className="flex gap-4 items-center">
            <div className="flex gap-2 items-center">
              <label className="text-slate-400 text-sm flex items-center">Rounds:<HelpTip text="Number of Swiss rounds to play (typically 3-6)" /></label>
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
            <div className="flex gap-2 items-center">
              <label className="text-slate-400 text-sm flex items-center">Max players:<HelpTip text="Player cap for registration. Leave blank for unlimited." /></label>
              <input
                type="number"
                min={2}
                className="w-20 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
                value={newMaxPlayers}
                onChange={(e) => setNewMaxPlayers(e.target.value)}
                placeholder="--"
              />
            </div>
          </div>
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
            placeholder="Start time (e.g. 10:00 AM)"
            value={newStartTime}
            onChange={(e) => setNewStartTime(e.target.value)}
          />
          <textarea
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100 h-24"
            placeholder="Description (optional, supports markdown)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
            placeholder="Image URL (optional, e.g. event poster or banner)"
            value={newImageUrl}
            onChange={(e) => setNewImageUrl(e.target.value)}
          />
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
            placeholder="External link (optional)"
            value={newExternalLink}
            onChange={(e) => setNewExternalLink(e.target.value)}
          />
          <div className="space-y-2">
            <p className="text-slate-400 text-sm font-medium">Mission settings</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={newRequirePhotos} onChange={(e) => setNewRequirePhotos(e.target.checked)} className="w-4 h-4 accent-amber-400" />
              <span className="text-sm text-slate-300">Require photos</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={newIncludeTwists} onChange={(e) => setNewIncludeTwists(e.target.checked)} className="w-4 h-4 accent-amber-400" />
              <span className="text-sm text-slate-300">Include twist cards</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={newIncludeChallenger} onChange={(e) => setNewIncludeChallenger(e.target.checked)} className="w-4 h-4 accent-amber-400" />
              <span className="text-sm text-slate-300">Include challenger cards</span>
            </label>
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

  if (route.view === 'tournament-register' && selectedTournamentId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 max-w-lg mx-auto">
        <a
          href={`#/tournament/${selectedTournamentId}`}
          className="text-slate-400 hover:text-slate-200 mb-4 inline-block"
        >
          ← Back
        </a>
        <h2 className="text-xl font-bold mb-4">Register for Tournament</h2>
        <p className="text-xs text-slate-500 mb-4">
          Enter your display name and faction. Army list is optional until the TO locks lists.
        </p>
        {(() => {
          try {
            const stored = localStorage.getItem('tournament-list')
            if (stored) {
              const { name, faction, totalPts } = JSON.parse(stored)
              return (
                <div className="bg-slate-900 border border-amber-400/30 rounded-lg p-3 text-sm">
                  <p className="text-slate-400">Linked list from List Builder:</p>
                  <p className="text-slate-100 font-medium">{name} — {faction} ({totalPts}pts)</p>
                </div>
              )
            }
          } catch { /* ignore */ }
          return null
        })()}
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

  if (route.view === 'round' && selectedRoundId && selectedTournamentId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 max-w-2xl mx-auto">
        <a
          href={`#/tournament/${selectedTournamentId}`}
          className="text-slate-400 hover:text-slate-200 mb-4 inline-block"
        >
          ← Back to Tournament
        </a>

        <p className="text-xs text-slate-500 mb-4">
          View pairings and report results below. Both players should confirm the result after reporting.
        </p>

        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold">
              Round {roundDetail?.roundNumber ?? '…'} — <span className="text-slate-400">{roundDetail?.status}</span>
            </h2>
            {roundDetail?.startTime && (
              <p className="text-slate-500 text-sm">Start: {roundDetail.startTime}</p>
            )}
          </div>
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
                      {p.player1Name ?? p.player1Id} vs {p.player2Name ?? p.player2Id ?? 'BYE'}
                    </p>
                    {(p.player1Faction || p.player2Faction) && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {p.player1Faction ?? '—'} vs {p.player2Faction ?? '—'}
                      </p>
                    )}
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
              BYE: {p.player1Name ?? p.player1Id}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (route.view === 'tournament-manage' && selectedTournamentId) {
    return (
      <ManageTournament
        tournamentId={selectedTournamentId}
        onBack={() => navigate(`#/tournament/${selectedTournamentId}`)}
      />
    )
  }

  if ((route.view === 'tournament' || route.view === 'tournament-standings') && selectedTournamentId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 max-w-2xl mx-auto">
        <a href="#/" className="text-slate-400 hover:text-slate-200 mb-4 inline-block">
          ← All Tournaments
        </a>

        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold">{tournament?.name ?? '…'}</h2>
            <p className="text-slate-400 text-sm mt-1">
              {tournament?.format} · {tournament?.totalRounds} rounds
            </p>
            {tournament?.location && (
              <p className="text-slate-500 text-sm">{tournament.location}</p>
            )}
            {tournament?.startTime && (
              <p className="text-slate-500 text-sm">Start: {tournament.startTime}</p>
            )}
            {tournament?.eventDate && (
              <p className="text-slate-500 text-sm">
                {new Date(tournament.eventDate).toLocaleDateString()}
              </p>
            )}
            {tournament?.externalLink && (
              <a
                href={tournament.externalLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 text-sm hover:underline inline-block mt-1"
              >
                Event Link ↗
              </a>
            )}
            {tournament?.toName && (
              <p className="text-slate-500 text-sm mt-1">TO: {tournament.toName}</p>
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

        <p className="text-xs text-slate-500 mb-4">
          {isTO
            ? 'Use "Advance" to move through tournament stages. Create rounds, generate pairings, and close rounds from here.'
            : 'Register, view standings, and check round pairings from this page.'}
        </p>

        {/* Image */}
        {tournament?.imageUrl && (
          <div className="mb-4">
            <img
              src={tournament.imageUrl}
              alt={tournament.name}
              className="w-full rounded-lg border border-slate-800 max-h-64 object-cover"
            />
          </div>
        )}

        {/* Description */}
        {tournament?.description && (
          <div className="mb-4 p-4 rounded-lg bg-slate-900 border border-slate-800">
            <SimpleMarkdown text={tournament.description} />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {tournament?.status === 'REGISTRATION' && !isTO && (
            <a
              href={`#/tournament/${selectedTournamentId}/register`}
              className="px-4 py-2 rounded bg-amber-400 text-slate-950 font-semibold text-sm hover:bg-amber-300"
            >
              Register
            </a>
          )}
          {tournament?.status === 'COMPLETE' && (
            <a
              href={`#/tournament/${selectedTournamentId}/standings`}
              className="px-4 py-2 rounded bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500"
            >
              View Results
            </a>
          )}
          {isTO && tournament?.status === 'IN_PROGRESS' && (
            <div className="flex gap-2 items-center">
              <input
                className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm w-36"
                placeholder="Start time"
                value={roundStartTime}
                onChange={(e) => setRoundStartTime(e.target.value)}
              />
              <button
                onClick={() => createRound.mutate({ tournamentId: selectedTournamentId, startTime: roundStartTime || undefined })}
                disabled={createRound.isPending}
                className="px-4 py-2 rounded bg-amber-400 text-slate-950 font-semibold text-sm hover:bg-amber-300 disabled:opacity-50"
              >
                + New Round
              </button>
            </div>
          )}
          {isTO && (
            <a
              href={`#/tournament/${selectedTournamentId}/manage`}
              className="px-4 py-2 rounded border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 text-sm"
            >
              Manage
            </a>
          )}
          <a
            href={`#/tournament/${selectedTournamentId}/standings`}
            className="px-4 py-2 rounded border border-slate-700 text-slate-400 hover:text-slate-200 text-sm"
          >
            Standings
          </a>
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

        {/* Awards */}
        {awardsQuery.data && awardsQuery.data.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-500 uppercase mb-2">Awards</h3>
            <div className="space-y-2">
              {awardsQuery.data.map((award: { id: string; name: string; description: string | null; recipientId: string | null }) => {
                const recipient = award.recipientId && standings
                  ? standings.players.find((p: PlayerStanding) => p.id === award.recipientId)
                  : null
                return (
                  <div key={award.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div>
                      <span className="text-slate-100 font-medium">{award.name}</span>
                      {award.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{award.description}</p>
                      )}
                    </div>
                    {recipient ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-400 font-medium">
                        {recipient.displayName}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600">Unassigned</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Player count */}
        <p className="text-slate-500 text-sm">
          {tournament?.playerCount ?? 0}{tournament?.maxPlayers ? ` / ${tournament.maxPlayers}` : ''} player{tournament?.playerCount === 1 ? '' : 's'} registered
        </p>
      </div>
    )
  }

  // Play: search open tournaments
  if (route.view === 'play') {
    return <PlayScreen />
  }

  // My Info: user profile
  if (route.view === 'my-info') {
    return <MyInfoScreen userId={userId} />
  }

  // List Search
  if (route.view === 'search-lists') {
    return <ListSearchScreen />
  }

  // Player Search
  if (route.view === 'search-players') {
    return <PlayerSearchScreen />
  }

  // Default: tournament list view with nav tabs
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-2xl mx-auto p-4">
        <div className="flex justify-between items-center mb-4">
          <h1><a href="/" className="text-2xl font-bold hover:text-amber-400 transition-colors">Tournament</a></h1>
          <div className="flex gap-2">
            <a
              href="#/create"
              className="px-4 py-2 rounded bg-amber-400 text-slate-950 font-semibold text-sm hover:bg-amber-300"
            >
              + New Tournament
            </a>
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

        {/* Navigation tabs */}
        <div className="flex gap-1 mb-6 border-b border-slate-800 pb-2">
          <a href="#/" className="px-3 py-1.5 rounded text-sm font-medium bg-amber-400 text-slate-950">My Tournaments</a>
          <a href="#/play" className="px-3 py-1.5 rounded text-sm font-medium text-slate-400 hover:text-slate-200">Play</a>
          <a href="#/my-info" className="px-3 py-1.5 rounded text-sm font-medium text-slate-400 hover:text-slate-200">My Info</a>
          <a href="#/search/lists" className="px-3 py-1.5 rounded text-sm font-medium text-slate-400 hover:text-slate-200">Lists</a>
          <a href="#/search/players" className="px-3 py-1.5 rounded text-sm font-medium text-slate-400 hover:text-slate-200">Players</a>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          View your tournaments below, or tap "+ New Tournament" to create one. Use the tabs to find open events, search lists, or check your ELO.
        </p>

        {myTournamentsQuery.isPending && (
          <p className="text-slate-400">Loading…</p>
        )}

        {tournaments.length === 0 && !myTournamentsQuery.isPending && (
          <div className="text-center py-12 text-slate-500">
            <p>No tournaments yet.</p>
            <p className="text-sm mt-1">Create one or <a href="#/play" className="text-amber-400 hover:underline">find an open event</a> to register for.</p>
          </div>
        )}

        <div className="space-y-3">
          {tournaments.map((t: Tournament) => (
            <a
              key={t.id}
              href={`#/tournament/${t.id}`}
              className="block w-full text-left bg-slate-900 rounded p-4 hover:bg-slate-800 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-slate-100">{t.name}</p>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {t.format} · {new Date(t.eventDate).toLocaleDateString()}
                  </p>
                  {t.location && (
                    <p className="text-xs text-slate-500">{t.location}</p>
                  )}
                </div>
                <StatusBadge status={t.status} />
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

function NavTabs({ active }: { active: string }) {
  const tabs = [
    { label: 'My Tournaments', href: '#/' },
    { label: 'Play', href: '#/play' },
    { label: 'My Info', href: '#/my-info' },
    { label: 'Lists', href: '#/search/lists' },
    { label: 'Players', href: '#/search/players' },
  ]
  return (
    <div className="flex gap-1 mb-6 border-b border-slate-800 pb-2">
      {tabs.map((t) => (
        <a
          key={t.href}
          href={t.href}
          className={`px-3 py-1.5 rounded text-sm font-medium ${
            t.label === active
              ? 'bg-amber-400 text-slate-950'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {t.label}
        </a>
      ))}
    </div>
  )
}

function PlayScreen() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('tournament-favorites') ?? '[]')
    } catch { return [] }
  })

  const searchResults = trpc.tournament.search.useQuery({
    query: searchQuery || undefined,
    status: (statusFilter || undefined) as 'REGISTRATION' | 'IN_PROGRESS' | 'COMPLETE' | undefined,
  })

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
      localStorage.setItem('tournament-favorites', JSON.stringify(next))
      return next
    })
  }

  const results = searchResults.data ?? []
  const favorited = results.filter((t) => favorites.includes(t.id))
  const others = results.filter((t) => !favorites.includes(t.id))

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Tournament</h1>
        <NavTabs active="Play" />

        <div className="space-y-3 mb-6">
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500"
            placeholder="Search tournaments by name, location, or format..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="flex gap-2">
            {(['', 'REGISTRATION', 'IN_PROGRESS', 'COMPLETE'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1 rounded ${
                  statusFilter === s
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {s === '' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {searchResults.isPending && <p className="text-slate-400">Searching…</p>}

        {favorited.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-amber-400 uppercase mb-2">Favorites</h3>
            <div className="space-y-2">
              {favorited.map((t) => (
                <TournamentSearchCard key={t.id} tournament={t} isFavorite onToggleFavorite={() => toggleFavorite(t.id)} />
              ))}
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div className="space-y-2">
            {favorited.length > 0 && <h3 className="text-xs font-semibold text-slate-500 uppercase mb-2">All Results</h3>}
            {others.map((t) => (
              <TournamentSearchCard key={t.id} tournament={t} isFavorite={false} onToggleFavorite={() => toggleFavorite(t.id)} />
            ))}
          </div>
        )}

        {!searchResults.isPending && results.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <p>No tournaments found.</p>
            <p className="text-sm mt-1">Try adjusting your search or status filter.</p>
          </div>
        )}
      </div>
    </div>
  )
}

type SearchTournament = {
  id: string
  name: string
  status: string
  format: string
  location: string | null
  imageUrl: string | null
  eventDate: number
  playerCount: number
  maxPlayers: number | null
  startTime: string | null
}

function TournamentSearchCard({
  tournament: t,
  isFavorite,
  onToggleFavorite,
}: {
  tournament: SearchTournament
  isFavorite: boolean
  onToggleFavorite: () => void
}) {
  return (
    <div className="bg-slate-900 rounded p-4 flex justify-between items-start">
      <a href={`#/tournament/${t.id}`} className="flex-1 hover:text-amber-400">
        <p className="font-semibold text-slate-100">{t.name}</p>
        <p className="text-sm text-slate-400 mt-0.5">
          {t.format} · {new Date(t.eventDate).toLocaleDateString()}
        </p>
        {t.location && <p className="text-xs text-slate-500">{t.location}</p>}
        {t.startTime && <p className="text-xs text-slate-500">Start: {t.startTime}</p>}
        <p className="text-xs text-slate-500 mt-1">
          {t.playerCount}{t.maxPlayers ? ` / ${t.maxPlayers}` : ''} players
        </p>
      </a>
      <div className="flex flex-col items-end gap-2">
        <StatusBadge status={t.status} />
        <button
          onClick={onToggleFavorite}
          className={`text-sm ${isFavorite ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorite ? '★' : '☆'}
        </button>
        {t.status === 'REGISTRATION' && (
          <a
            href={`#/tournament/${t.id}/register`}
            className="text-xs px-3 py-1 rounded bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300"
          >
            Register
          </a>
        )}
      </div>
    </div>
  )
}

function MyInfoScreen({ userId }: { userId: string }) {
  const profileQuery = trpc.player.myProfile.useQuery()
  const eloQuery = trpc.elo.get.useQuery(userId, { enabled: !!userId })
  const leaderboardQuery = trpc.elo.leaderboard.useQuery()

  const profile = profileQuery.data
  const elo = eloQuery.data
  const leaderboard = leaderboardQuery.data ?? []

  const rank = leaderboard.findIndex((p) => p.userId === userId) + 1

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Tournament</h1>
        <NavTabs active="My Info" />

        {profileQuery.isPending && <p className="text-slate-400">Loading profile…</p>}

        {profile && (
          <div className="space-y-6">
            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="ELO Rating" value={elo?.rating ?? 1200} />
              <StatCard label="Rank" value={rank > 0 ? `#${rank}` : '—'} />
              <StatCard label="Tournaments" value={profile.tournamentsPlayed} />
              <StatCard label="Games" value={profile.gamesPlayed} />
            </div>

            {/* W-L-D */}
            <div className="bg-slate-900 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-500 uppercase mb-3">Record</h3>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">{profile.wins}</p>
                  <p className="text-xs text-slate-500">Wins</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-400">{profile.losses}</p>
                  <p className="text-xs text-slate-500">Losses</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-400">{profile.draws}</p>
                  <p className="text-xs text-slate-500">Draws</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-400">{profile.totalVP}</p>
                  <p className="text-xs text-slate-500">Total VP</p>
                </div>
              </div>
            </div>

            {/* Tournament history */}
            {profile.tournaments.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-500 uppercase mb-2">Tournament History</h3>
                <div className="space-y-2">
                  {profile.tournaments.map((t) => (
                    <a
                      key={t.id}
                      href={`#/tournament/${t.id}`}
                      className="block bg-slate-900 rounded p-3 hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-slate-100">{t.name}</p>
                          <p className="text-xs text-slate-400">{t.faction} · {t.format}</p>
                        </div>
                        <div className="text-right">
                          <StatusBadge status={t.status} />
                          <p className="text-xs text-slate-500 mt-1">{new Date(t.eventDate).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Cards */}
            {profile.cards.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-500 uppercase mb-2">Card History</h3>
                <div className="space-y-2">
                  {profile.cards.map((c) => (
                    <div key={c.id} className="bg-slate-900 rounded p-3 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            c.cardType === 'YELLOW'
                              ? 'bg-yellow-400/20 text-yellow-400'
                              : 'bg-red-400/20 text-red-400'
                          }`}
                        >
                          {c.cardType}
                        </span>
                        <span className="text-sm text-slate-300">{c.reason}</span>
                      </div>
                      <span className="text-xs text-slate-500">{new Date(c.issuedAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bans */}
            {profile.bans.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-red-400 uppercase mb-2">Ban History</h3>
                <div className="space-y-2">
                  {profile.bans.map((b) => (
                    <div key={b.id} className="bg-red-950/30 border border-red-900/50 rounded p-3">
                      <p className="text-sm text-red-300">{b.reason}</p>
                      <p className="text-xs text-red-500/60 mt-1">
                        {new Date(b.bannedAt).toLocaleDateString()}
                        {b.liftedAt ? ` — Lifted ${new Date(b.liftedAt).toLocaleDateString()}` : ' — Active'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profile.tournamentsPlayed === 0 && (
              <div className="text-center py-8 text-slate-500">
                <p>No tournament history yet.</p>
                <p className="text-sm mt-1"><a href="#/play" className="text-amber-400 hover:underline">Find a tournament</a> to get started.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-900 rounded-lg p-3 text-center">
      <p className="text-xl font-bold text-slate-100">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}

function ListSearchScreen() {
  const [factionFilter, setFactionFilter] = useState('')
  const [textQuery, setTextQuery] = useState('')

  const searchResults = trpc.player.searchLists.useQuery({
    faction: factionFilter || undefined,
    query: textQuery || undefined,
  })

  const results = searchResults.data ?? []

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Tournament</h1>
        <NavTabs active="Lists" />

        <div className="space-y-3 mb-6">
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500"
            placeholder="Filter by faction (e.g. Space Marines)"
            value={factionFilter}
            onChange={(e) => setFactionFilter(e.target.value)}
          />
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500"
            placeholder="Search list contents..."
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
          />
        </div>

        {searchResults.isPending && <p className="text-slate-400">Searching…</p>}

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((r, i) => (
              <div key={i} className="bg-slate-900 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-slate-100">{r.playerName}</p>
                    <p className="text-sm text-amber-400">{r.faction}{r.detachment ? ` · ${r.detachment}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <a href={`#/tournament/${r.tournamentId}`} className="text-xs text-slate-400 hover:text-amber-400">
                      {r.tournamentName}
                    </a>
                    <p className="text-xs text-slate-600">{new Date(r.eventDate).toLocaleDateString()}</p>
                  </div>
                </div>
                {r.listText && (
                  <pre className="text-xs text-slate-400 bg-slate-800 rounded p-2 mt-2 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                    {r.listText}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}

        {!searchResults.isPending && results.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <p>No lists found.</p>
            <p className="text-sm mt-1">Try a different faction or search term.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function PlayerSearchScreen() {
  const [searchQuery, setSearchQuery] = useState('')

  const searchResults = trpc.player.searchPlayers.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 1 },
  )

  const results = searchResults.data ?? []

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Tournament</h1>
        <NavTabs active="Players" />

        <input
          className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 mb-6"
          placeholder="Search players by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {searchResults.isPending && searchQuery && <p className="text-slate-400">Searching…</p>}

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((p) => (
              <div key={p.userId} className="bg-slate-900 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-slate-100">{p.displayName}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {p.tournamentsPlayed} tournament{p.tournamentsPlayed === 1 ? '' : 's'} · {p.factions.join(', ')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {p.yellowCards > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-400/20 text-yellow-400">
                        {p.yellowCards} Yellow
                      </span>
                    )}
                    {p.redCards > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-400/20 text-red-400">
                        {p.redCards} Red
                      </span>
                    )}
                  </div>
                </div>
                {p.recentTournaments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {p.recentTournaments.map((t, i) => (
                      <p key={i} className="text-xs text-slate-500">
                        {t.name} — {t.faction} ({new Date(t.eventDate).toLocaleDateString()})
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!searchResults.isPending && searchQuery && results.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <p>No players found.</p>
          </div>
        )}

        {!searchQuery && (
          <div className="text-center py-12 text-slate-500">
            <p>Enter a player name to search.</p>
          </div>
        )}
      </div>
    </div>
  )
}
