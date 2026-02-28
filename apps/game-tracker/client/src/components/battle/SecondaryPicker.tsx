export type SecondaryMission = {
  id: string
  secondaryName: string
  vpPerRound: number[]
}

type AvailableSecondary = {
  id: string
  name: string
}

type Props = {
  secondaries: SecondaryMission[]
  onAdd: (name: string) => void
  onRemove: (id: string) => void
  onScore: (id: string, roundNumber: number, vp: number) => void
  currentRound: number
  label?: string
  availableSecondaries?: AvailableSecondary[]
}

export function SecondaryPicker({
  secondaries,
  onAdd,
  onRemove,
  onScore,
  currentRound,
  label = 'Secondaries',
  availableSecondaries,
}: Props) {
  const alreadyPicked = new Set(secondaries.map((s) => s.secondaryName.toLowerCase()))

  // Filter out already-selected secondaries from the dropdown
  const dropdownOptions = (availableSecondaries ?? []).filter(
    (s) => !alreadyPicked.has(s.name.toLowerCase()),
  )

  function handleDropdownSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const selectedName = e.target.value
    if (!selectedName) return
    onAdd(selectedName)
    e.target.value = '' // reset dropdown
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-400">{label}</span>
      </div>

      <div className="mb-2">
        <select
          onChange={handleDropdownSelect}
          defaultValue=""
          aria-label="Select secondary"
          className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
        >
          <option value="">Select secondary...</option>
          {dropdownOptions.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {secondaries.length > 0 && (
        <div className="space-y-2">
          {secondaries.map((s) => {
            const totalVp = s.vpPerRound.reduce((sum, v) => sum + v, 0)
            const roundVp = s.vpPerRound[currentRound - 1] ?? 0
            return (
              <div key={s.id} className="p-2 rounded bg-slate-800/50 border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-200">{s.secondaryName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-amber-400">{totalVp} VP</span>
                    <button
                      onClick={() => onRemove(s.id)}
                      aria-label={`Remove ${s.secondaryName}`}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      X
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">R{currentRound}:</span>
                  <button
                    onClick={() => onScore(s.id, currentRound, Math.max(0, roundVp - 1))}
                    disabled={roundVp <= 0}
                    aria-label={`Decrease ${s.secondaryName} VP`}
                    className="w-6 h-6 rounded bg-slate-700 text-slate-300 text-xs font-bold disabled:opacity-30"
                  >
                    -
                  </button>
                  <span className="text-sm font-bold text-amber-400 w-6 text-center">{roundVp}</span>
                  <button
                    onClick={() => onScore(s.id, currentRound, roundVp + 1)}
                    aria-label={`Increase ${s.secondaryName} VP`}
                    className="w-6 h-6 rounded bg-slate-700 text-slate-300 text-xs font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
