import { useState } from 'react'

import { useUnitRoles } from '../lib/useGameData'

const ROLE_FILTERS = [
  'All',
  'Battleline',
  'Characters',
  'Other',
  'Dedicated Transports',
  'Fortifications',
] as const
type RoleFilter = (typeof ROLE_FILTERS)[number]

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
  hasFaction?: boolean
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
  hasFaction,
  onFactionChange,
  onQueryChange,
  onSelect,
}: Props) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All')
  const unitRoles = useUnitRoles()

  const filteredUnits =
    roleFilter === 'All'
      ? units
      : units.filter((u) => {
          const role = unitRoles.get(u.id) ?? ''
          return role.toLowerCase() === roleFilter.toLowerCase()
        })

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

      {/* Role filter pills */}
      {hasFaction && (
        <div className="flex gap-1 flex-wrap">
          {ROLE_FILTERS.map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                roleFilter === role
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {role}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {isLoadingUnits ? (
          <p className="text-slate-400 text-xs py-2">Loading units…</p>
        ) : !hasFaction ? (
          <p className="text-slate-500 text-xs py-2 italic">Select a faction to browse units.</p>
        ) : filteredUnits.length === 0 ? (
          <p className="text-slate-500 text-xs py-2 italic">
            {roleFilter !== 'All' ? (
              `No ${roleFilter.toLowerCase()} units found.`
            ) : (
              <>
                No units found. Import unit profiles from{' '}
                <a href="/data-import/" className="text-amber-400 hover:underline">
                  Data Import
                </a>{' '}
                first.
              </>
            )}
          </p>
        ) : (
          filteredUnits.map((unit) => {
            const role = unitRoles.get(unit.id)
            return (
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
                {role && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-500">
                    {role}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
