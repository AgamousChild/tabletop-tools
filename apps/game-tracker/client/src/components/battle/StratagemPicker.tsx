import { useState } from 'react'
import type { Stratagem } from '@tabletop-tools/game-data-store'

export type StratagemEntry = {
  stratagemName: string
  cpCost: number
}

type Props = {
  stratagems: StratagemEntry[]
  onAdd: (entry: StratagemEntry) => void
  onRemove: (index: number) => void
  label?: string
  availableStratagems?: Stratagem[]
}

export function StratagemPicker({ stratagems, onAdd, onRemove, label = 'Stratagems', availableStratagems = [] }: Props) {
  const [showCustom, setShowCustom] = useState(false)
  const [name, setName] = useState('')
  const [cost, setCost] = useState(1)

  function handleDropdownSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    if (!id) return
    const strat = availableStratagems.find((s) => s.id === id)
    if (strat) {
      onAdd({ stratagemName: strat.name, cpCost: parseInt(strat.cpCost) || 1 })
    }
    e.target.value = '' // reset dropdown
  }

  function handleAddCustom() {
    if (!name.trim()) return
    onAdd({ stratagemName: name.trim(), cpCost: cost })
    setName('')
    setCost(1)
    setShowCustom(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-400">{label}</span>
        {availableStratagems.length === 0 && !showCustom && (
          <button
            onClick={() => setShowCustom(true)}
            className="text-xs text-amber-400 hover:text-amber-300"
          >
            + Add Stratagem
          </button>
        )}
      </div>

      {/* Dropdown when data available */}
      {availableStratagems.length > 0 && (
        <div className="mb-2 flex gap-2 items-center">
          <select
            onChange={handleDropdownSelect}
            defaultValue=""
            aria-label="Select stratagem"
            className="flex-1 px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
          >
            <option value="">Select stratagem...</option>
            {availableStratagems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.cpCost} CP · {s.phase})
              </option>
            ))}
          </select>
          {!showCustom && (
            <button
              onClick={() => setShowCustom(true)}
              className="text-xs text-slate-500 hover:text-slate-300 whitespace-nowrap"
            >
              Custom
            </button>
          )}
        </div>
      )}

      {/* Custom text input fallback */}
      {showCustom && (
        <div className="mb-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Stratagem name..."
              aria-label="Stratagem name"
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
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
              onClick={handleAddCustom}
              disabled={!name.trim()}
              className="px-3 py-1.5 rounded bg-amber-400 text-slate-950 text-sm font-bold disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => setShowCustom(false)}
              className="px-2 py-1.5 rounded bg-slate-700 text-slate-300 text-sm"
            >
              Cancel
            </button>
          </div>
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
