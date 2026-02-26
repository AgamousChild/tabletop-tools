import { useState } from 'react'

export type DestroyedUnit = {
  contentId: string
  name: string
}

type Props = {
  units: DestroyedUnit[]
  onAdd: (unit: DestroyedUnit) => void
  onRemove: (index: number) => void
  label?: string
}

export function UnitPicker({ units, onAdd, onRemove, label = 'Units Destroyed' }: Props) {
  const [name, setName] = useState('')
  const [showInput, setShowInput] = useState(false)

  function handleAdd() {
    if (!name.trim()) return
    const trimmed = name.trim()
    onAdd({
      contentId: trimmed.toLowerCase().replace(/\s+/g, '-'),
      name: trimmed,
    })
    setName('')
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
            + Add Unit
          </button>
        )}
      </div>

      {showInput && (
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Unit name..."
            aria-label="Unit name"
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
            onClick={() => setShowInput(false)}
            className="px-2 py-1.5 rounded bg-slate-700 text-slate-300 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {units.length > 0 && (
        <div className="space-y-1">
          {units.map((u, i) => (
            <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded bg-slate-800/50 border border-slate-800">
              <span className="text-sm text-slate-200">{u.name}</span>
              <button
                onClick={() => onRemove(i)}
                aria-label={`Remove ${u.name}`}
                className="text-xs text-red-400 hover:text-red-300"
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
