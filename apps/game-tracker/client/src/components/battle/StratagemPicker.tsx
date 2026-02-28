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
  function handleDropdownSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    if (!id) return
    const strat = availableStratagems.find((s) => s.id === id)
    if (strat) {
      onAdd({ stratagemName: strat.name, cpCost: parseInt(strat.cpCost) || 1 })
    }
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
          aria-label="Select stratagem"
          className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
        >
          <option value="">Select stratagem...</option>
          {availableStratagems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.cpCost} CP · {s.phase})
            </option>
          ))}
        </select>
      </div>

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
