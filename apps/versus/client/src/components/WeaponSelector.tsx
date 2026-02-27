import type { WeaponProfile } from '@tabletop-tools/game-content'

type AttackType = 'ranged' | 'melee'

type Props = {
  weapons: WeaponProfile[]
  attackType: AttackType
  selectedWeapons: Set<number>
  onToggleWeapon: (index: number) => void
  onAttackTypeChange: (type: AttackType) => void
}

function formatAbilities(weapon: WeaponProfile): string {
  return weapon.abilities
    .map((a) => {
      switch (a.type) {
        case 'SUSTAINED_HITS': return `Sustained Hits ${a.value}`
        case 'LETHAL_HITS': return 'Lethal Hits'
        case 'DEVASTATING_WOUNDS': return 'Devastating Wounds'
        case 'TORRENT': return 'Torrent'
        case 'TWIN_LINKED': return 'Twin-linked'
        case 'BLAST': return 'Blast'
        case 'REROLL_HITS_OF_1': return 'Re-roll hits of 1'
        case 'REROLL_HITS': return 'Re-roll all hits'
        case 'REROLL_WOUNDS': return 'Re-roll wounds'
        case 'HIT_MOD': return `Hit ${a.value > 0 ? '+' : ''}${a.value}`
        case 'WOUND_MOD': return `Wound ${a.value > 0 ? '+' : ''}${a.value}`
        case 'STRENGTH_MOD': return `Str ${a.value > 0 ? '+' : ''}${a.value}`
        case 'ATTACKS_MOD': return `Attacks ${a.value > 0 ? '+' : ''}${a.value}`
        case 'ANTI': return `Anti-${a.keyword} ${a.value}+`
        case 'MELTA': return `Melta ${a.value}`
        case 'IGNORES_COVER': return 'Ignores Cover'
        case 'HAZARDOUS': return 'Hazardous'
        case 'PRECISION': return 'Precision'
        case 'INDIRECT_FIRE': return 'Indirect Fire'
        case 'ASSAULT': return 'Assault'
        case 'PISTOL': return 'Pistol'
        case 'ONE_SHOT': return 'One Shot'
        case 'PSYCHIC': return 'Psychic'
        default: return ''
      }
    })
    .filter(Boolean)
    .join(', ')
}

export function WeaponSelector({
  weapons,
  attackType,
  selectedWeapons,
  onToggleWeapon,
  onAttackTypeChange,
}: Props) {
  const rangedWeapons = weapons
    .map((w, i) => ({ weapon: w, index: i }))
    .filter(({ weapon }) => weapon.range !== 'melee')
  const meleeWeapons = weapons
    .map((w, i) => ({ weapon: w, index: i }))
    .filter(({ weapon }) => weapon.range === 'melee')

  const displayWeapons = attackType === 'ranged' ? rangedWeapons : meleeWeapons

  return (
    <div className="space-y-3">
      {/* Attack type toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => onAttackTypeChange('ranged')}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            attackType === 'ranged'
              ? 'bg-amber-400 text-slate-950'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Ranged ({rangedWeapons.length})
        </button>
        <button
          onClick={() => onAttackTypeChange('melee')}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            attackType === 'melee'
              ? 'bg-amber-400 text-slate-950'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Melee ({meleeWeapons.length})
        </button>
      </div>

      {/* Weapon list */}
      {displayWeapons.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No {attackType} weapons</p>
      ) : (
        <div className="space-y-2">
          {displayWeapons.map(({ weapon, index }) => {
            const checked = selectedWeapons.has(index)
            const abilities = formatAbilities(weapon)
            return (
              <label
                key={index}
                className={`flex items-start gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                  checked
                    ? 'bg-amber-400/10 border border-amber-400/30'
                    : 'bg-slate-800 border border-slate-700 hover:border-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleWeapon(index)}
                  className="mt-1 accent-amber-400"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-100">{weapon.name}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                    {weapon.range !== 'melee' && <span>R:{weapon.range}"</span>}
                    <span>A:{weapon.attacks}</span>
                    <span>{weapon.range === 'melee' ? 'WS' : 'BS'}:{weapon.skill}+</span>
                    <span>S:{weapon.strength}</span>
                    <span>AP:{weapon.ap}</span>
                    <span>D:{weapon.damage}</span>
                  </div>
                  {abilities && (
                    <p className="text-xs text-amber-400/70 mt-0.5">[{abilities}]</p>
                  )}
                </div>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
