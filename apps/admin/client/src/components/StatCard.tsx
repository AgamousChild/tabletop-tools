export function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: number | string
  sub?: string
  color?: 'emerald' | 'red' | 'amber'
}) {
  const textColor = color === 'emerald' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : color === 'amber' ? 'text-amber-400' : 'text-slate-100'

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`text-2xl font-bold ${textColor} mt-1`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}
