import { useState } from 'react'
import { useFactions, useDetachments, useLists } from '@tabletop-tools/game-data-store'

type MatchSetupData = {
  date: number
  location: string
  opponentName: string
  opponentFaction: string
  opponentDetachment: string
  yourFaction: string
  yourDetachment: string
  listId: string | null
  isTournament: boolean
  tournamentName: string
  tournamentId: string | null
}

type Props = {
  onNext: (data: MatchSetupData) => void
  onBack: () => void
}

export type { MatchSetupData }

export function MatchSetupScreen({ onNext, onBack }: Props) {
  const [date, setDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]!
  })
  const [location, setLocation] = useState('')
  const [opponentName, setOpponentName] = useState('')
  const [opponentFaction, setOpponentFaction] = useState('')
  const [opponentDetachment, setOpponentDetachment] = useState('')
  const [yourFaction, setYourFaction] = useState('')
  const [yourDetachment, setYourDetachment] = useState('')
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [isTournament, setIsTournament] = useState(false)
  const [tournamentName, setTournamentName] = useState('')

  const { data: factions = [] } = useFactions()
  const { data: yourDetachments = [] } = useDetachments(yourFaction)
  const { data: opponentDetachments = [] } = useDetachments(opponentFaction)
  const { data: lists = [] } = useLists()

  const canProceed = opponentFaction.trim() !== ''

  function handleSubmit() {
    if (!canProceed) return
    onNext({
      date: new Date(date).getTime(),
      location: location.trim(),
      opponentName: opponentName.trim(),
      opponentFaction: opponentFaction.trim(),
      opponentDetachment: opponentDetachment.trim(),
      yourFaction: yourFaction.trim(),
      yourDetachment: yourDetachment.trim(),
      listId: selectedListId,
      isTournament,
      tournamentName: tournamentName.trim(),
      tournamentId: null,
    })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-100">
          Back
        </button>
        <h1 className="text-xl font-bold text-amber-400">Match Setup</h1>
      </header>

      <div className="p-6 space-y-5 max-w-md mx-auto">
        {/* Date & Location */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Game store, city..."
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        {/* Your Info */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Your Info</h2>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Your Faction</label>
            <select
              value={yourFaction}
              onChange={(e) => {
                setYourFaction(e.target.value)
                setYourDetachment('')
              }}
              aria-label="Your faction"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
            >
              <option value="">Select faction...</option>
              {factions.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          {yourFaction && yourDetachments.length > 0 && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Your Detachment</label>
              <select
                value={yourDetachment}
                onChange={(e) => setYourDetachment(e.target.value)}
                aria-label="Your detachment"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
              >
                <option value="">Select detachment...</option>
                {yourDetachments.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          {lists.length > 0 && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Your List</label>
              <select
                value={selectedListId ?? ''}
                onChange={(e) => setSelectedListId(e.target.value || null)}
                aria-label="Your list"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
              >
                <option value="">No list selected</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.totalPts}pts)</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Opponent Info */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Opponent</h2>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Opponent Name</label>
            <input
              type="text"
              value={opponentName}
              onChange={(e) => setOpponentName(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Opponent Faction</label>
            {factions.length > 0 ? (
              <select
                value={opponentFaction}
                onChange={(e) => {
                  setOpponentFaction(e.target.value)
                  setOpponentDetachment('')
                }}
                aria-label="Opponent faction"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
              >
                <option value="">Select faction...</option>
                {factions.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={opponentFaction}
                onChange={(e) => setOpponentFaction(e.target.value)}
                placeholder="e.g. Orks, Necrons, Tau..."
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            )}
          </div>
          {opponentFaction && opponentDetachments.length > 0 && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Opponent Detachment</label>
              <select
                value={opponentDetachment}
                onChange={(e) => setOpponentDetachment(e.target.value)}
                aria-label="Opponent detachment"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
              >
                <option value="">Select detachment...</option>
                {opponentDetachments.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          {opponentFaction && opponentDetachments.length === 0 && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Opponent Detachment</label>
              <input
                type="text"
                value={opponentDetachment}
                onChange={(e) => setOpponentDetachment(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          )}
        </div>

        {/* Tournament toggle */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isTournament}
              onChange={(e) => setIsTournament(e.target.checked)}
              className="w-4 h-4 rounded accent-amber-400"
            />
            <span className="text-sm text-slate-300">Tournament match</span>
          </label>
          {isTournament && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Tournament Name</label>
              <input
                type="text"
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                placeholder="e.g. Regional GT"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canProceed}
          className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}
