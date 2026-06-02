type Props = {
  label: string
  completed: boolean
  onChange: (completed: boolean) => void
}

export function ActionScorer({ label, completed, onChange }: Props) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-300">{label}</span>
      <button
        aria-label={completed ? 'Mark incomplete' : 'Mark complete'}
        onClick={() => onChange(!completed)}
        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
          completed
            ? 'bg-amber-400 text-slate-950'
            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
        }`}
      >
        {completed ? 'Done' : 'Complete'}
      </button>
    </div>
  )
}
