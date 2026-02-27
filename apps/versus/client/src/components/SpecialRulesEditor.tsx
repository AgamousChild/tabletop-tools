import { useState } from 'react'
import type { WeaponAbility } from '@tabletop-tools/game-content'

type Props = {
  rules: WeaponAbility[]
  /** Abilities already on selected weapons — shown read-only so user knows they're applied */
  weaponAbilities?: string[]
  onAdd: (rule: WeaponAbility) => void
  onRemove: (index: number) => void
}

const RULE_OPTIONS: { label: string; create: () => WeaponAbility }[] = [
  { label: 'Sustained Hits 1', create: () => ({ type: 'SUSTAINED_HITS', value: 1 }) },
  { label: 'Sustained Hits 2', create: () => ({ type: 'SUSTAINED_HITS', value: 2 }) },
  { label: 'Lethal Hits', create: () => ({ type: 'LETHAL_HITS' }) },
  { label: 'Devastating Wounds', create: () => ({ type: 'DEVASTATING_WOUNDS' }) },
  { label: 'Re-roll all hits', create: () => ({ type: 'REROLL_HITS' }) },
  { label: 'Re-roll hits of 1', create: () => ({ type: 'REROLL_HITS_OF_1' }) },
  { label: 'Re-roll wounds', create: () => ({ type: 'REROLL_WOUNDS' }) },
  { label: 'Twin-linked', create: () => ({ type: 'TWIN_LINKED' }) },
  { label: '+1 to hit', create: () => ({ type: 'HIT_MOD', value: 1 }) },
  { label: '-1 to hit', create: () => ({ type: 'HIT_MOD', value: -1 }) },
  { label: '+1 to wound', create: () => ({ type: 'WOUND_MOD', value: 1 }) },
  { label: '-1 to wound', create: () => ({ type: 'WOUND_MOD', value: -1 }) },
  { label: '+1 strength', create: () => ({ type: 'STRENGTH_MOD', value: 1 }) },
  { label: '+2 strength', create: () => ({ type: 'STRENGTH_MOD', value: 2 }) },
  { label: '+1 attacks', create: () => ({ type: 'ATTACKS_MOD', value: 1 }) },
  { label: '+2 attacks', create: () => ({ type: 'ATTACKS_MOD', value: 2 }) },
]

function ruleLabel(rule: WeaponAbility): string {
  switch (rule.type) {
    case 'SUSTAINED_HITS': return `Sustained Hits ${rule.value}`
    case 'LETHAL_HITS': return 'Lethal Hits'
    case 'DEVASTATING_WOUNDS': return 'Devastating Wounds'
    case 'TORRENT': return 'Torrent'
    case 'TWIN_LINKED': return 'Twin-linked'
    case 'BLAST': return 'Blast'
    case 'REROLL_HITS_OF_1': return 'Re-roll hits of 1'
    case 'REROLL_HITS': return 'Re-roll all hits'
    case 'REROLL_WOUNDS': return 'Re-roll wounds'
    case 'HIT_MOD': return `${rule.value > 0 ? '+' : ''}${rule.value} to hit`
    case 'WOUND_MOD': return `${rule.value > 0 ? '+' : ''}${rule.value} to wound`
    case 'STRENGTH_MOD': return `${rule.value > 0 ? '+' : ''}${rule.value} strength`
    case 'ATTACKS_MOD': return `${rule.value > 0 ? '+' : ''}${rule.value} attacks`
    default: return 'Unknown'
  }
}

export function SpecialRulesEditor({ rules, weaponAbilities, onAdd, onRemove }: Props) {
  const [showDropdown, setShowDropdown] = useState(false)

  // Deduplicate weapon abilities for display
  const uniqueWeaponAbilities = weaponAbilities
    ? [...new Set(weaponAbilities)].filter(Boolean)
    : []

  return (
    <div className="space-y-2">
      {/* Data-derived abilities from weapons */}
      {uniqueWeaponAbilities.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            From weapon data
          </p>
          <div className="flex flex-wrap gap-1.5">
            {uniqueWeaponAbilities.map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-xs text-slate-400"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Additional Rules
        </p>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
        >
          + Add Rule
        </button>
      </div>

      {/* Active rules */}
      {rules.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rules.map((rule, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 border border-amber-400/20 px-2.5 py-0.5 text-xs text-amber-400"
            >
              {ruleLabel(rule)}
              <button
                onClick={() => onRemove(i)}
                className="text-amber-400/50 hover:text-amber-400 ml-0.5"
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {showDropdown && (
        <div className="rounded-lg bg-slate-800 border border-slate-700 p-1 max-h-48 overflow-y-auto">
          {RULE_OPTIONS.map((opt, i) => (
            <button
              key={i}
              onClick={() => {
                onAdd(opt.create())
                setShowDropdown(false)
              }}
              className="w-full text-left px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-700 rounded transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
