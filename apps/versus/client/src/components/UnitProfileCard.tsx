import { useState } from 'react'
import type { UnitProfile } from '@tabletop-tools/game-content'

type Props = {
  unit: UnitProfile
  invulnSave?: number
  fnp?: number
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-slate-500 uppercase">{label}</p>
      <p className="text-sm font-semibold text-slate-100 tabular-nums">{value}</p>
    </div>
  )
}

export function UnitProfileCard({ unit, invulnSave, fnp }: Props) {
  const [expandedAbility, setExpandedAbility] = useState<string | null>(null)

  // Use data-driven invuln/fnp from unit if available, allow override
  const displayInvuln = invulnSave ?? unit.invulnSave
  const displayFnp = fnp ?? unit.fnp

  // Data quality warnings
  const warnings: string[] = []
  if (unit.toughness === 0) warnings.push('Toughness is 0 — possible parse error')
  if (unit.save === 0) warnings.push('Save is 0 — possible parse error')
  if (unit.weapons.length === 0) warnings.push('No weapons found in imported data')
  for (const w of unit.weapons) {
    if (w.strength === 0) warnings.push(`Weapon "${w.name}" has S0 — possible parse error`)
  }

  return (
    <div className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-amber-400">{unit.name}</p>
        <span className="text-xs text-slate-500 tabular-nums">{unit.points}pts</span>
      </div>
      {warnings.length > 0 && (
        <div className="mb-2 rounded bg-amber-900/20 border border-amber-800/50 px-2 py-1.5 text-xs text-amber-300">
          <p className="font-semibold">Data quality issues:</p>
          <ul className="mt-0.5 space-y-0.5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-7 gap-1">
        <StatBox label="M" value={`${unit.move}"`} />
        <StatBox label="T" value={unit.toughness} />
        <StatBox label="Sv" value={`${unit.save}+`} />
        <StatBox label="W" value={unit.wounds} />
        <StatBox label="Ld" value={`${unit.leadership}+`} />
        <StatBox label="OC" value={unit.oc} />
        <StatBox label="Inv" value={displayInvuln ? `${displayInvuln}+` : '-'} />
      </div>
      {displayFnp && (
        <div className="mt-1 text-xs text-slate-400">
          Feel No Pain: {displayFnp}+
        </div>
      )}
      {unit.abilities.length > 0 && (
        <div className="mt-2 border-t border-slate-700 pt-2">
          <p className="text-[10px] text-slate-500 uppercase mb-1">Abilities</p>
          <div className="flex flex-wrap gap-1">
            {unit.abilities.map((ability) => {
              const desc = unit.abilityDescriptions?.[ability]
              const isExpanded = expandedAbility === ability
              return (
                <button
                  key={ability}
                  onClick={() => desc && setExpandedAbility(isExpanded ? null : ability)}
                  className={`px-1.5 py-0.5 text-xs rounded border ${desc ? 'cursor-pointer hover:border-amber-400/50' : 'cursor-default'} ${isExpanded ? 'bg-amber-400/10 border-amber-400/30 text-amber-400' : 'bg-slate-900 border-slate-700 text-slate-300'}`}
                >
                  {ability}
                </button>
              )
            })}
          </div>
          {expandedAbility && unit.abilityDescriptions?.[expandedAbility] && (
            <div className="mt-2 px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-400">
              {unit.abilityDescriptions[expandedAbility]}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
