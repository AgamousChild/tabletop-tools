import { DistributionChart } from './DistributionChart'

type Props = {
  rollCount: number
  zScore: number | null
  chiSquared: number | null
  distribution: Map<number, number>
}

function getVerdict(zScore: number | null): { text: string; color: string } {
  if (zScore === null) return { text: 'Waiting...', color: 'text-slate-400' }
  const abs = Math.abs(zScore)
  if (abs < 1.65) return { text: 'FAIR', color: 'text-emerald-400' }
  if (abs < 2.58) return { text: 'SUSPECT', color: 'text-amber-400' }
  return { text: 'LOADED', color: 'text-red-400' }
}

export function StatsOverlay({ rollCount, zScore, chiSquared, distribution }: Props) {
  const verdict = getVerdict(zScore)

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 text-sm">
        <div className="flex items-center gap-4">
          <span className="text-slate-400">
            Z: <span className="text-slate-100 font-mono">{zScore?.toFixed(2) ?? '—'}</span>
          </span>
          <span className="text-slate-400">
            χ²: <span className="text-slate-100 font-mono">{chiSquared?.toFixed(2) ?? '—'}</span>
          </span>
        </div>
        <span className={`font-bold ${verdict.color}`}>{verdict.text}</span>
      </div>

      {/* Roll count */}
      <p className="text-center text-slate-400 text-sm">
        {rollCount} {rollCount === 1 ? 'roll' : 'rolls'} recorded
      </p>

      {/* Distribution */}
      <DistributionChart distribution={distribution} />
    </div>
  )
}
