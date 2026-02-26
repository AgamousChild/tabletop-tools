import type { SecondaryMission } from './SecondaryPicker'
import type { StratagemEntry } from './StratagemPicker'
import type { TurnData } from './types'
import { VpStepper } from './VpStepper'
import { SecondaryPicker } from './SecondaryPicker'
import { StratagemPicker } from './StratagemPicker'

type Props = {
  player: 'You' | string
  turnData: TurnData
  onUpdate: (data: Partial<TurnData>) => void
  onNext: () => void
  secondaries: SecondaryMission[]
  onAddSecondary: (name: string) => void
  onRemoveSecondary: (id: string) => void
  onScoreSecondary: (id: string, roundNumber: number, vp: number) => void
  currentRound: number
}

export function CommandPhaseScreen({
  player,
  turnData,
  onUpdate,
  onNext,
  secondaries,
  onAddSecondary,
  onRemoveSecondary,
  onScoreSecondary,
  currentRound,
}: Props) {
  return (
    <div className="p-6 space-y-5 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-200">
          {player === 'You' ? 'Your' : `${player}'s`} Command Phase
        </h3>
        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">R{currentRound}</span>
      </div>

      <div className="flex items-center gap-4">
        <VpStepper
          label="CP Gained"
          value={turnData.cpGained}
          onChange={(v) => onUpdate({ cpGained: v })}
          min={0}
          max={5}
        />
        <VpStepper
          label="Primary VP"
          value={turnData.primaryVp}
          onChange={(v) => onUpdate({ primaryVp: v })}
        />
      </div>

      <SecondaryPicker
        secondaries={secondaries}
        onAdd={onAddSecondary}
        onRemove={onRemoveSecondary}
        onScore={onScoreSecondary}
        currentRound={currentRound}
        label={player === 'You' ? 'Your Secondaries' : `${player}'s Secondaries`}
      />

      <StratagemPicker
        stratagems={turnData.stratagems}
        onAdd={(s: StratagemEntry) => onUpdate({ stratagems: [...turnData.stratagems, s] })}
        onRemove={(i: number) =>
          onUpdate({ stratagems: turnData.stratagems.filter((_, idx) => idx !== i) })
        }
        label="Command Phase Stratagems"
      />

      <button
        onClick={onNext}
        className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 transition-colors"
      >
        Continue to Action Phase
      </button>
    </div>
  )
}
