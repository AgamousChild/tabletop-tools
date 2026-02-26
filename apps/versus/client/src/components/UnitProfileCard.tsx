import type { UnitProfile } from '@tabletop-tools/game-content'

type Props = {
  unit: UnitProfile
  invulnSave?: number
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-slate-500 uppercase">{label}</p>
      <p className="text-sm font-semibold text-slate-100 tabular-nums">{value}</p>
    </div>
  )
}

export function UnitProfileCard({ unit, invulnSave }: Props) {
  return (
    <div className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2">
      <p className="text-sm font-semibold text-amber-400 mb-2">{unit.name}</p>
      <div className="grid grid-cols-7 gap-1">
        <StatBox label="M" value={`${unit.move}"`} />
        <StatBox label="T" value={unit.toughness} />
        <StatBox label="Sv" value={`${unit.save}+`} />
        <StatBox label="W" value={unit.wounds} />
        <StatBox label="Ld" value={`${unit.leadership}+`} />
        <StatBox label="OC" value={unit.oc} />
        <StatBox label="Inv" value={invulnSave ? `${invulnSave}+` : '-'} />
      </div>
    </div>
  )
}
