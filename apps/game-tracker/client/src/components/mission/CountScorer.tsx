type Props = {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}

export function CountScorer({ label, value, min = 0, max = 99, onChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-300 flex-1">{label}</span>
      <button
        aria-label="decrement"
        onClick={() => {
          if (value > min) onChange(value - 1)
        }}
        disabled={value <= min}
        className="w-7 h-7 rounded bg-slate-700 text-slate-200 font-bold disabled:opacity-30"
      >
        -
      </button>
      <span className="w-6 text-center text-amber-400 font-bold">{value}</span>
      <button
        aria-label="increment"
        onClick={() => {
          if (value < max) onChange(value + 1)
        }}
        disabled={value >= max}
        className="w-7 h-7 rounded bg-slate-700 text-slate-200 font-bold disabled:opacity-30"
      >
        +
      </button>
    </div>
  )
}
