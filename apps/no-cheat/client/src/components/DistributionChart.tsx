type Props = {
  distribution: Map<number, number>
}

export function DistributionChart({ distribution }: Props) {
  const total = Array.from(distribution.values()).reduce((a, b) => a + b, 0)
  const expectedPct = 100 / 6

  return (
    <div className="space-y-1">
      {[1, 2, 3, 4, 5, 6].map((pip) => {
        const count = distribution.get(pip) ?? 0
        const pct = total > 0 ? (count / total) * 100 : 0
        const isOver = pct > expectedPct + 5
        const isUnder = pct < expectedPct - 5
        const barColor = total < 6 ? 'bg-amber-400' : isOver ? 'bg-red-400' : isUnder ? 'bg-blue-400' : 'bg-emerald-400'

        return (
          <div key={pip} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-slate-400 font-mono">{pip}</span>
            <div className="flex-1 bg-slate-800 rounded-full h-2">
              <div
                className={`${barColor} h-2 rounded-full transition-all`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <span className="w-6 text-right text-slate-400 font-mono">{count}</span>
            <span className="w-14 text-right text-slate-400">
              {total > 0 ? `${pct.toFixed(1)}%` : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
