import { useState, useMemo } from 'react'

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
  const [name, setName] = useState('')
  const [showInput, setShowInput] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const suggestions = useMemo(() => {
    if (!availableSecondaries || !name.trim()) return []
    const lowerQ = name.toLowerCase()
    const alreadyPicked = new Set(secondaries.map((s) => s.secondaryName.toLowerCase()))
    return availableSecondaries
      .filter((s) => s.name.toLowerCase().includes(lowerQ) && !alreadyPicked.has(s.name.toLowerCase()))
      .slice(0, 8)
  }, [availableSecondaries, name, secondaries])

  function handleAdd() {
    if (!name.trim()) return
    onAdd(name.trim())
    setName('')
    setShowInput(false)
    setShowSuggestions(false)
  }

  function handleSelectSuggestion(s: AvailableSecondary) {
    onAdd(s.name)
    setName('')
    setShowInput(false)
    setShowSuggestions(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-400">{label}</span>
        {!showInput && (
          <button
            onClick={() => setShowInput(true)}
            className="text-xs text-amber-400 hover:text-amber-300"
          >
            + Add Secondary
          </button>
        )}
      </div>

      {showInput && (
        <div className="relative mb-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Secondary name..."
              aria-label="Secondary name"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="flex-1 px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={handleAdd}
              disabled={!name.trim()}
              className="px-3 py-1.5 rounded bg-amber-400 text-slate-950 text-sm font-bold disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => { setShowInput(false); setShowSuggestions(false) }}
              className="px-2 py-1.5 rounded bg-slate-700 text-slate-300 text-sm"
            >
              Cancel
            </button>
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded shadow-lg z-10 max-h-48 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectSuggestion(s)}
                  className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 hover:text-amber-400"
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
