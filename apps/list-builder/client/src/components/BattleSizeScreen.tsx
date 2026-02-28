import { BATTLE_SIZES } from '../lib/armyRules'
import type { BattleSize } from '../lib/armyRules'

type Props = {
  onSelect: (size: BattleSize) => void
  onBack: () => void
}

export function BattleSizeScreen({ onSelect, onBack }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-slate-200 text-sm"
        >
          Back
        </button>
        <h2 className="text-lg font-semibold text-slate-100">Select Battle Size</h2>
      </div>

      <p className="text-xs text-slate-500 mb-4">Choose a battle size to set your points limit and unit duplicate restrictions. Press "Back" to return to your lists.</p>

      <div className="space-y-3">
        {BATTLE_SIZES.map((size, i) => (
          <button
            key={i}
            onClick={() => onSelect(size)}
            className="w-full text-left p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-400/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-100">{size.name}</p>
                <p className="text-sm text-slate-400 mt-0.5">{size.description}</p>
                <p className="text-xs text-slate-500 mt-1">Max {size.maxDuplicates} of each non-Battleline unit</p>
              </div>
              <p className="text-lg font-bold text-amber-400 tabular-nums">{size.points}pts</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
