import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WeaponSelector } from './WeaponSelector'
import type { WeaponProfile } from '@tabletop-tools/game-content'

const weapons: WeaponProfile[] = [
  { name: 'Bolt Rifle', range: 30, attacks: 2, skill: 3, strength: 4, ap: -1, damage: 1, abilities: [] },
  { name: 'Bolt Pistol', range: 12, attacks: 1, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
  { name: 'Close Combat Weapon', range: 'melee', attacks: 3, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
]

describe('WeaponSelector', () => {
  it('shows ranged and melee toggle buttons', () => {
    render(
      <WeaponSelector
        weapons={weapons}
        attackType="ranged"
        selectedWeapons={new Set([0, 1])}
        onToggleWeapon={vi.fn()}
        onAttackTypeChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /ranged/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /melee/i })).toBeInTheDocument()
  })

  it('shows weapon count in toggle buttons', () => {
    render(
      <WeaponSelector
        weapons={weapons}
        attackType="ranged"
        selectedWeapons={new Set()}
        onToggleWeapon={vi.fn()}
        onAttackTypeChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /ranged \(2\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /melee \(1\)/i })).toBeInTheDocument()
  })

  it('only shows ranged weapons when ranged is selected', () => {
    render(
      <WeaponSelector
        weapons={weapons}
        attackType="ranged"
        selectedWeapons={new Set([0, 1])}
        onToggleWeapon={vi.fn()}
        onAttackTypeChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Bolt Rifle')).toBeInTheDocument()
    expect(screen.getByText('Bolt Pistol')).toBeInTheDocument()
    expect(screen.queryByText('Close Combat Weapon')).not.toBeInTheDocument()
  })

  it('only shows melee weapons when melee is selected', () => {
    render(
      <WeaponSelector
        weapons={weapons}
        attackType="melee"
        selectedWeapons={new Set([2])}
        onToggleWeapon={vi.fn()}
        onAttackTypeChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Close Combat Weapon')).toBeInTheDocument()
    expect(screen.queryByText('Bolt Rifle')).not.toBeInTheDocument()
  })

  it('calls onToggleWeapon when a weapon is toggled', () => {
    const onToggle = vi.fn()
    render(
      <WeaponSelector
        weapons={weapons}
        attackType="ranged"
        selectedWeapons={new Set([0, 1])}
        onToggleWeapon={onToggle}
        onAttackTypeChange={vi.fn()}
      />,
    )
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(onToggle).toHaveBeenCalledWith(0)
  })

  it('calls onAttackTypeChange when toggle is clicked', () => {
    const onChange = vi.fn()
    render(
      <WeaponSelector
        weapons={weapons}
        attackType="ranged"
        selectedWeapons={new Set()}
        onToggleWeapon={vi.fn()}
        onAttackTypeChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /melee/i }))
    expect(onChange).toHaveBeenCalledWith('melee')
  })

  it('shows weapon stats', () => {
    render(
      <WeaponSelector
        weapons={weapons}
        attackType="ranged"
        selectedWeapons={new Set([0])}
        onToggleWeapon={vi.fn()}
        onAttackTypeChange={vi.fn()}
      />,
    )
    expect(screen.getByText('A:2')).toBeInTheDocument()
    // S:4 appears on both ranged weapons
    expect(screen.getAllByText('S:4').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('AP:-1')).toBeInTheDocument()
  })

  it('shows no weapons message when type has none', () => {
    const rangedOnly: WeaponProfile[] = [
      { name: 'Bolter', range: 24, attacks: 2, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
    ]
    render(
      <WeaponSelector
        weapons={rangedOnly}
        attackType="melee"
        selectedWeapons={new Set()}
        onToggleWeapon={vi.fn()}
        onAttackTypeChange={vi.fn()}
      />,
    )
    expect(screen.getByText(/no melee weapons/i)).toBeInTheDocument()
  })

  it('shows weapon abilities', () => {
    const weaponsWithAbilities: WeaponProfile[] = [
      {
        name: 'Plasma Rifle',
        range: 24,
        attacks: 2,
        skill: 3,
        strength: 7,
        ap: -2,
        damage: 1,
        abilities: [{ type: 'LETHAL_HITS' }],
      },
    ]
    render(
      <WeaponSelector
        weapons={weaponsWithAbilities}
        attackType="ranged"
        selectedWeapons={new Set([0])}
        onToggleWeapon={vi.fn()}
        onAttackTypeChange={vi.fn()}
      />,
    )
    expect(screen.getByText(/lethal hits/i)).toBeInTheDocument()
  })
})
