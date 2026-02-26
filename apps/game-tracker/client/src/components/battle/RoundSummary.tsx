import type { TurnData } from './types'

type Props = {
  roundNumber: number
  yourTurn: TurnData
  theirTurn: TurnData
  opponentName: string
  onConfirm: () => void
  onBack: () => void
  isSaving: boolean
}

export function RoundSummary({
  roundNumber,
  yourTurn,
  theirTurn,
  opponentName,
  onConfirm,
  onBack,
  isSaving,
}: Props) {
  return (
    <div className="p-6 space-y-5 max-w-md mx-auto">
      <h3 className="text-lg font-semibold text-slate-200">Round {roundNumber} Summary</h3>

      <div className="grid grid-cols-2 gap-4">
        <TurnSummaryCard label="You" turn={yourTurn} />
        <TurnSummaryCard label={opponentName} turn={theirTurn} />
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="px-4 py-3 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={isSaving}
          className="flex-1 py-3 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Confirm & Save Round'}
        </button>
      </div>
    </div>
  )
}

function TurnSummaryCard({ label, turn }: { label: string; turn: TurnData }) {
  const totalStratCp = turn.stratagems.reduce((sum, s) => sum + s.cpCost, 0)

  return (
    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
      <h4 className="font-medium text-amber-400 text-sm mb-2">{label}</h4>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-slate-300">
          <span>Primary VP</span>
          <span className="font-medium">{turn.primaryVp}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>CP Gained</span>
          <span className="font-medium">+{turn.cpGained}</span>
        </div>
        {totalStratCp > 0 && (
          <div className="flex justify-between text-slate-300">
            <span>CP Spent</span>
            <span className="font-medium">{totalStratCp}</span>
          </div>
        )}
        {turn.stratagems.length > 0 && (
          <div className="text-slate-400 text-xs mt-1">
            {turn.stratagems.map((s) => s.stratagemName).join(', ')}
          </div>
        )}
        {turn.unitsDestroyed.length > 0 && (
          <div className="text-slate-400 text-xs mt-1">
            Destroyed: {turn.unitsDestroyed.map((u) => u.name).join(', ')}
          </div>
        )}
        {turn.notes && (
          <div className="text-slate-500 text-xs mt-1 italic">{turn.notes}</div>
        )}
      </div>
    </div>
  )
}
