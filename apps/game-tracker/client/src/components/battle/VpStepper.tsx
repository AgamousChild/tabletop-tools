type Props = {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}

export function VpStepper({ label, value, onChange, min = 0, max = 20 }: Props) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold disabled:opacity-30 hover:bg-slate-700"
        >
          -
        </button>
        <span className="text-xl font-bold text-amber-400 w-8 text-center">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold disabled:opacity-30 hover:bg-slate-700"
        >
          +
        </button>
      </div>
    </div>
  )
}
