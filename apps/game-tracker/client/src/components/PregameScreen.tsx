import { useState } from 'react'

type PregameData = {
  attackerDefender: string
  whoGoesFirst: string
}

type Props = {
  opponentFaction: string
  mission: string
  onStart: (data: PregameData) => void
  onBack: () => void
}

export type { PregameData }

export function PregameScreen({ opponentFaction, mission, onStart, onBack }: Props) {
  const [attackerDefender, setAttackerDefender] = useState('')
  const [whoGoesFirst, setWhoGoesFirst] = useState('')

  const canStart = attackerDefender !== '' && whoGoesFirst !== ''

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-100">
          Back
        </button>
        <h1 className="text-xl font-bold text-amber-400">Pre-Game</h1>
      </header>

      <div className="p-6 space-y-6 max-w-md mx-auto">
        <div className="text-center p-4 rounded-lg bg-slate-900 border border-slate-800">
          <p className="text-slate-400 text-sm">vs {opponentFaction}</p>
          <p className="text-slate-100 font-medium">{mission}</p>
        </div>

        {/* Attacker / Defender */}
        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Attacker / Defender</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setAttackerDefender('YOU_ATTACK')}
              className={`p-3 rounded-lg border text-center font-medium transition-colors ${
                attackerDefender === 'YOU_ATTACK'
                  ? 'bg-amber-400/10 border-amber-400 text-amber-400'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              You Attack
            </button>
            <button
              onClick={() => setAttackerDefender('YOU_DEFEND')}
              className={`p-3 rounded-lg border text-center font-medium transition-colors ${
                attackerDefender === 'YOU_DEFEND'
                  ? 'bg-amber-400/10 border-amber-400 text-amber-400'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              You Defend
            </button>
          </div>
        </div>

        {/* Who Goes First */}
        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Who Goes First?</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setWhoGoesFirst('YOU')}
              className={`p-3 rounded-lg border text-center font-medium transition-colors ${
                whoGoesFirst === 'YOU'
                  ? 'bg-amber-400/10 border-amber-400 text-amber-400'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              You
            </button>
            <button
              onClick={() => setWhoGoesFirst('THEM')}
              className={`p-3 rounded-lg border text-center font-medium transition-colors ${
                whoGoesFirst === 'THEM'
                  ? 'bg-amber-400/10 border-amber-400 text-amber-400'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              Opponent
            </button>
          </div>
        </div>

        <button
          onClick={() => {
            if (!canStart) return
            onStart({ attackerDefender, whoGoesFirst })
          }}
          disabled={!canStart}
          className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Start Battle
        </button>
      </div>
    </div>
  )
}
