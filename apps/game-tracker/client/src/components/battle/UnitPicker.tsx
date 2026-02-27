import { useState, useMemo } from 'react'

export type DestroyedUnit = {
  contentId: string
  name: string
}

type AvailableUnit = {
  contentId: string
  name: string
}

type Props = {
  units: DestroyedUnit[]
  onAdd: (unit: DestroyedUnit) => void
  onRemove: (index: number) => void
  label?: string
  availableUnits?: AvailableUnit[]
}

export function UnitPicker({ units, onAdd, onRemove, label = 'Units Destroyed', availableUnits = [] }: Props) {
  const [name, setName] = useState('')
  const [showInput, setShowInput] = useState(false)

  const filtered = useMemo(() => {
    if (!name.trim() || availableUnits.length === 0) return []
    const q = name.toLowerCase()
    return availableUnits.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 8)
  }, [name, availableUnits])

  // If we have available units and no search text, show all for quick selection
  const quickPick = useMemo(() => {
    if (availableUnits.length === 0 || name.trim()) return []
    return availableUnits
  }, [availableUnits, name])

  function handleAdd() {
    if (!name.trim()) return
    const trimmed = name.trim()
    // Try to match against available units for proper contentId
    const match = availableUnits.find((u) => u.name.toLowerCase() === trimmed.toLowerCase())
    onAdd({
      contentId: match?.contentId ?? trimmed.toLowerCase().replace(/\s+/g, '-'),
      name: match?.name ?? trimmed,
    })
    setName('')
    setShowInput(false)
  }

  function handleSelectUnit(u: AvailableUnit) {
    onAdd({ contentId: u.contentId, name: u.name })
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
        <div className="mb-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={availableUnits.length > 0 ? 'Search units...' : 'Unit name...'}
                aria-label="Unit name"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
              {(filtered.length > 0 || quickPick.length > 0) && (
                <div className="absolute z-10 mt-1 w-full rounded bg-slate-800 border border-slate-700 shadow-lg max-h-48 overflow-y-auto">
                  {(filtered.length > 0 ? filtered : quickPick).map((u) => (
                    <button
                      key={u.contentId}
                      onClick={() => handleSelectUnit(u)}
                      className="w-full text-left px-2 py-1.5 hover:bg-slate-700 text-sm text-slate-200"
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
