import { useState } from 'react'

export type StratagemEntry = {
  stratagemName: string
  cpCost: number
}

type Props = {
  stratagems: StratagemEntry[]
  onAdd: (entry: StratagemEntry) => void
  onRemove: (index: number) => void
  label?: string
}

export function StratagemPicker({ stratagems, onAdd, onRemove, label = 'Stratagems' }: Props) {
  const [name, setName] = useState('')
  const [cost, setCost] = useState(1)
  const [showInput, setShowInput] = useState(false)

  function handleAdd() {
    if (!name.trim()) return
    onAdd({ stratagemName: name.trim(), cpCost: cost })
    setName('')
    setCost(1)
    setShowInput(false)
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
            + Add Stratagem
          </button>
        )}
      </div>

      {showInput && (
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stratagem name..."
            aria-label="Stratagem name"
            className="flex-1 px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(Number(e.target.value) || 1)}
            min={0}
            aria-label="CP cost"
            className="w-14 px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm text-center focus:outline-none focus:border-amber-400"
          />
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="px-3 py-1.5 rounded bg-amber-400 text-slate-950 text-sm font-bold disabled:opacity-40"
          >
            Add
          </button>
          <button
            onClick={() => setShowInput(false)}
            className="px-2 py-1.5 rounded bg-slate-700 text-slate-300 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {stratagems.length > 0 && (
        <div className="space-y-1">
          {stratagems.map((s, i) => (
            <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded bg-slate-800/50 border border-slate-800">
              <span className="text-sm text-slate-200">{s.stratagemName}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{s.cpCost} CP</span>
                <button
                  onClick={() => onRemove(i)}
                  aria-label={`Remove ${s.stratagemName}`}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  X
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
