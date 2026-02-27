import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { UnitProfileCard } from './UnitProfileCard'
import type { UnitProfile } from '@tabletop-tools/game-content'

const unit: UnitProfile = {
  id: 'u1',
  faction: 'Space Marines',
  name: 'Intercessor Squad',
  move: 6,
  toughness: 4,
  save: 3,
  wounds: 2,
  leadership: 6,
  oc: 2,
  weapons: [],
  abilities: [],
  points: 100,
}

describe('UnitProfileCard', () => {
  it('shows the unit name', () => {
    render(<UnitProfileCard unit={unit} />)
    expect(screen.getByText('Intercessor Squad')).toBeInTheDocument()
  })

  it('shows core stats', () => {
    render(<UnitProfileCard unit={unit} />)
    expect(screen.getByText('M')).toBeInTheDocument()
    expect(screen.getByText('T')).toBeInTheDocument()
    expect(screen.getByText('Sv')).toBeInTheDocument()
    expect(screen.getByText('W')).toBeInTheDocument()
    expect(screen.getByText('Ld')).toBeInTheDocument()
    expect(screen.getByText('OC')).toBeInTheDocument()
  })

  it('shows stat values', () => {
    render(<UnitProfileCard unit={unit} />)
    expect(screen.getByText('6"')).toBeInTheDocument()  // move
    expect(screen.getByText('4')).toBeInTheDocument()    // toughness
    expect(screen.getByText('3+')).toBeInTheDocument()   // save
    // wounds=2 and oc=2 both show "2"
    expect(screen.getAllByText('2')).toHaveLength(2)
  })

  it('shows invuln save when provided', () => {
    render(<UnitProfileCard unit={unit} invulnSave={4} />)
    expect(screen.getByText('4+')).toBeInTheDocument()
  })

  it('shows dash when no invuln save', () => {
    render(<UnitProfileCard unit={unit} />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('shows data quality warning for toughness 0', () => {
    render(<UnitProfileCard unit={{ ...unit, toughness: 0 }} />)
    expect(screen.getByText('Data quality issues:')).toBeInTheDocument()
    expect(screen.getByText(/Toughness is 0/)).toBeInTheDocument()
  })

  it('shows warning for weapon with strength 0', () => {
    const unitWithBadWeapon = {
      ...unit,
      weapons: [{ name: 'Broken Gun', range: 24 as const, attacks: 2, skill: 3, strength: 0, ap: 0, damage: 1, abilities: [] }],
    }
    render(<UnitProfileCard unit={unitWithBadWeapon} />)
    expect(screen.getByText(/Broken Gun.*S0/)).toBeInTheDocument()
  })

  it('shows no warnings for valid unit', () => {
    const validUnit = {
      ...unit,
      weapons: [{ name: 'Good Gun', range: 24 as const, attacks: 2, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] }],
    }
    render(<UnitProfileCard unit={validUnit} />)
    expect(screen.queryByText('Data quality issues:')).not.toBeInTheDocument()
  })
})
