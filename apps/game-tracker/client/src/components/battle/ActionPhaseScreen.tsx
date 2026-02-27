import type { Stratagem } from '@tabletop-tools/game-data-store'
import type { StratagemEntry } from './StratagemPicker'
import type { DestroyedUnit } from './UnitPicker'
import type { TurnData } from './types'
import { UnitPicker } from './UnitPicker'
import { StratagemPicker } from './StratagemPicker'

type AvailableUnit = {
  contentId: string
  name: string
}

type Props = {
  player: 'You' | string
  turnData: TurnData
  onUpdate: (data: Partial<TurnData>) => void
  onNext: () => void
  availableStratagems?: Stratagem[]
  availableUnits?: AvailableUnit[]
}

export function ActionPhaseScreen({ player, turnData, onUpdate, onNext, availableStratagems, availableUnits }: Props) {
  const isYou = player === 'You'

  return (
    <div className="p-6 space-y-5 max-w-md mx-auto">
      <h3 className="text-lg font-semibold text-slate-200">
        {isYou ? 'Your' : `${player}'s`} Action Phase
      </h3>

      <UnitPicker
        units={turnData.unitsDestroyed}
        onAdd={(u: DestroyedUnit) => onUpdate({ unitsDestroyed: [...turnData.unitsDestroyed, u] })}
        onRemove={(i: number) =>
          onUpdate({ unitsDestroyed: turnData.unitsDestroyed.filter((_, idx) => idx !== i) })
        }
        label={isYou ? 'Their Units You Destroyed' : 'Your Units They Destroyed'}
        availableUnits={availableUnits}
      />

      <StratagemPicker
        stratagems={turnData.stratagems}
        onAdd={(s: StratagemEntry) => onUpdate({ stratagems: [...turnData.stratagems, s] })}
        onRemove={(i: number) =>
          onUpdate({ stratagems: turnData.stratagems.filter((_, idx) => idx !== i) })
        }
        label="Action Phase Stratagems"
        availableStratagems={availableStratagems}
      />

      <div>
        <label className="block text-sm text-slate-400 mb-1">Notes</label>
        <input
          type="text"
          value={turnData.notes}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          placeholder="Optional notes..."
          aria-label="Turn notes"
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
        />
      </div>

      <button
        onClick={onNext}
        className="w-full py-3 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 transition-colors"
      >
        Continue
      </button>
    </div>
  )
}
