type UnitOption = {
  id: string
  name: string
  faction: string
  points: number
}

type Props = {
  label: string
  factions: string[]
  units: UnitOption[]
  selectedUnitId: string | null
  isLoadingUnits: boolean
  onFactionChange: (faction: string) => void
  onQueryChange: (query: string) => void
  onSelect: (unitId: string) => void
}

export function UnitSelector({
  label,
  factions,
  units,
  selectedUnitId,
  isLoadingUnits,
  onFactionChange,
  onQueryChange,
  onSelect,
}: Props) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{label}</h2>

      <select
        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
        onChange={(e) => onFactionChange(e.target.value)}
        defaultValue=""
      >
        <option value="" disabled>
          Select faction…
        </option>
        {factions.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Search units…"
        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
        onChange={(e) => onQueryChange(e.target.value)}
      />

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {isLoadingUnits ? (
          <p className="text-slate-400 text-sm py-2">Loading units…</p>
        ) : units.length === 0 ? (
          <p className="text-slate-500 text-sm py-2 italic">
            No units found. Import unit profiles from{' '}
            <a href="/data-import/" className="text-amber-400 hover:underline">Data Import</a>{' '}
            (Unit Profiles tab) first.
          </p>
        ) : (
          units.map((unit) => (
            <button
              key={unit.id}
              onClick={() => onSelect(unit.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedUnitId === unit.id
                  ? 'bg-amber-400/20 border border-amber-400 text-amber-400'
                  : 'bg-slate-900 border border-slate-800 text-slate-100 hover:border-slate-600'
              }`}
            >
              <span className="font-medium">{unit.name}</span>
              <span className="text-slate-500 ml-2">{unit.points}pts</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
