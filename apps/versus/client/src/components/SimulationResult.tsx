import { useState } from 'react'
import type { DistributionData } from '../lib/rules/pipeline'

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
  abilities?: string[]
}

type Props = {
  attackerName: string
  defenderName: string
  result: Result
  weaponBreakdowns?: WeaponBreakdown[]
  distribution?: DistributionData | null
  onSave: () => void
}

function DistributionChart({ data }: { data: DistributionData }) {
  const entries = Array.from(data.histogram.entries()).sort((a, b) => a[0] - b[0])
  if (entries.length === 0) return null

  const maxCount = Math.max(...entries.map(([, c]) => c))
  const total = data.iterations

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Damage Distribution</p>

      {/* Percentiles row */}
      <div className="flex justify-between text-[10px] text-slate-500 tabular-nums">
        <span>10th: {data.percentiles.p10}</span>
        <span>25th: {data.percentiles.p25}</span>
        <span className="text-slate-300 font-semibold">Median: {data.percentiles.median}</span>
        <span>75th: {data.percentiles.p75}</span>
        <span>90th: {data.percentiles.p90}</span>
      </div>

      {/* Histogram bars */}
      <div className="space-y-px">
        {entries.map(([dmg, count]) => {
          const pct = (count / total) * 100
          const barWidth = (count / maxCount) * 100
          const isMedian = dmg === data.percentiles.median
          return (
            <div key={dmg} className="flex items-center gap-1.5 h-4">
              <span className="w-5 text-right text-[10px] text-slate-500 tabular-nums shrink-0">{dmg}</span>
              <div className="flex-1 h-3 bg-slate-800 rounded-sm overflow-hidden">
                <div
                  className={`h-full rounded-sm ${isMedian ? 'bg-amber-400' : 'bg-amber-400/40'}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="w-10 text-right text-[10px] text-slate-500 tabular-nums shrink-0">
                {pct.toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-slate-600 text-right">{total.toLocaleString()} simulations</p>
    </div>
  )
}

export function SimulationResult({ attackerName, defenderName, result, weaponBreakdowns, distribution, onSave }: Props) {
  const [showDist, setShowDist] = useState(false)

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-4">
      {/* Matchup header */}
      <div className="text-center space-y-0.5">
        <p className="text-slate-100 font-semibold text-sm">{attackerName}</p>
        <p className="text-slate-500 text-xs">vs</p>
        <p className="text-slate-100 font-semibold text-sm">{defenderName}</p>
      </div>

      {/* Key stats */}
      <div className="space-y-1.5 text-xs">
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
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-800 px-2 py-1.5 text-center">
          <p className="text-[10px] text-slate-500 mb-0.5">Worst case</p>
          <p className="text-slate-300 text-xs font-medium">
            {result.worstCase.wounds} W / {result.worstCase.modelsRemoved} dead
          </p>
        </div>
        <div className="rounded-lg bg-slate-800 px-2 py-1.5 text-center">
          <p className="text-[10px] text-slate-500 mb-0.5">Best case</p>
          <p className="text-slate-300 text-xs font-medium">
            {result.bestCase.wounds} W / {result.bestCase.modelsRemoved} dead
          </p>
        </div>
      </div>

      {/* Distribution toggle */}
      {distribution && (
        <div>
          <button
            onClick={() => setShowDist(!showDist)}
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            {showDist ? '▾ Hide distribution' : '▸ Show damage distribution'}
          </button>
          {showDist && <div className="mt-2"><DistributionChart data={distribution} /></div>}
        </div>
      )}

      {/* Per-weapon breakdown */}
      {weaponBreakdowns && weaponBreakdowns.length >= 1 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Per-weapon breakdown</p>
          {weaponBreakdowns.map((wb, i) => (
            <div key={i} className="text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 truncate mr-2">{wb.weaponName}</span>
                <span className="text-slate-300 tabular-nums whitespace-nowrap">
                  {wb.expectedWounds.toFixed(1)} W ({wb.expectedModelsRemoved.toFixed(1)} models)
                </span>
              </div>
              {wb.abilities && wb.abilities.length > 0 && (
                <p className="text-[10px] text-amber-400/60 mt-0.5">[{wb.abilities.join(', ')}]</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Save */}
      <button
        onClick={onSave}
        className="w-full py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-amber-400 hover:text-amber-400 transition-colors text-xs"
      >
        Save result
      </button>
    </div>
  )
}
