export type Result = {
  expectedWounds: number
  expectedModelsRemoved: number
  survivors: number
  worstCase: { wounds: number; modelsRemoved: number }
  bestCase: { wounds: number; modelsRemoved: number }
}

export type WeaponBreakdown = {
  weaponName: string
  expectedWounds: number
  expectedModelsRemoved: number
}

type Props = {
  attackerName: string
  defenderName: string
  result: Result
  weaponBreakdowns?: WeaponBreakdown[]
  onSave: () => void
}

export function SimulationResult({ attackerName, defenderName, result, weaponBreakdowns, onSave }: Props) {
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 space-y-5">
      {/* Matchup header */}
      <div className="text-center space-y-1">
        <p className="text-slate-100 font-semibold">{attackerName}</p>
        <p className="text-slate-500 text-sm">vs</p>
        <p className="text-slate-100 font-semibold">{defenderName}</p>
      </div>

      {/* Key stats */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Expected wounds</span>
          <span className="text-slate-100 font-semibold tabular-nums">
            {result.expectedWounds.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Expected models removed</span>
          <span className="text-slate-100 font-semibold tabular-nums">
            {result.expectedModelsRemoved.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Survivors</span>
          <span className="text-slate-100 tabular-nums">
            {result.survivors.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Best / worst case */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-800 px-3 py-2 text-center">
          <p className="text-xs text-slate-500 mb-1">Worst case</p>
          <p className="text-slate-300 text-sm font-medium">
            {result.worstCase.wounds} wounds / {result.worstCase.modelsRemoved} dead
          </p>
        </div>
        <div className="rounded-lg bg-slate-800 px-3 py-2 text-center">
          <p className="text-xs text-slate-500 mb-1">Best case</p>
          <p className="text-slate-300 text-sm font-medium">
            {result.bestCase.wounds} wounds / {result.bestCase.modelsRemoved} dead
          </p>
        </div>
      </div>

      {/* Per-weapon breakdown */}
      {weaponBreakdowns && weaponBreakdowns.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Per-weapon breakdown</p>
          {weaponBreakdowns.map((wb, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <span className="text-slate-400 truncate mr-2">{wb.weaponName}</span>
              <span className="text-slate-300 tabular-nums whitespace-nowrap">
                {wb.expectedWounds.toFixed(1)} wounds ({wb.expectedModelsRemoved.toFixed(1)} models)
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Save */}
      <button
        onClick={onSave}
        className="w-full py-2 rounded-lg border border-slate-700 text-slate-300 hover:border-amber-400 hover:text-amber-400 transition-colors text-sm"
      >
        Save result
      </button>
    </div>
  )
}
