# apps/versus/client/src/components/WeaponSelector.tsx

> Weapon profile selector with ranged/melee toggle and ability display.

## Prompt

Write a React component for selecting which weapon profiles to include in a combat simulation.

### Props

`weapons` (WeaponProfile[]), `attackType` ('ranged' | 'melee'), `selectedWeapons` (Set<number>), `onToggleWeapon` (index toggle), `onAttackTypeChange`.

### Ability formatting

Write a `formatAbilities(weapon: WeaponProfile): string` helper that converts each ability in the weapon's abilities array to a display string via a switch statement. Handle all WeaponAbility types:
- `SUSTAINED_HITS` → "Sustained Hits N"
- `LETHAL_HITS` → "Lethal Hits"
- `DEVASTATING_WOUNDS` → "Devastating Wounds"
- `ANTI` → "Anti-{keyword} {value}+"
- `MELTA` → "Melta N"
- `HIT_MOD` → "Hit +/-N"
- `WOUND_MOD` → "Wound +/-N"
- ... (all types)

Join with ", " and filter out empty strings.

### Layout

1. Ranged/Melee toggle buttons (two-button group)
2. Weapon list — each weapon shown as a checkbox row with:
   - Checkbox (checked if index is in `selectedWeapons`)
   - Weapon name
   - Stat line: Range | A | BS/WS | S | AP | D
   - Abilities string (if any)

## Dependencies

- `@tabletop-tools/game-content` — `WeaponProfile` (type)
