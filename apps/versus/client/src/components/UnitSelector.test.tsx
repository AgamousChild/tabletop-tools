import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/useGameData', () => ({
  useUnitRoles: () => new Map([
    ['u1', 'Battleline'],
    ['u2', 'Characters'],
  ]),
}))

import { UnitSelector } from './UnitSelector'

const mockFactions = ['Space Marines', 'Orks', 'Necrons']
const mockUnits = [
  { id: 'u1', name: 'Intercessor Squad', faction: 'Space Marines', points: 100 },
  { id: 'u2', name: 'Tactical Squad', faction: 'Space Marines', points: 90 },
]

const defaultProps = {
  label: 'Attacker',
  factions: mockFactions,
  units: mockUnits,
  selectedUnitId: null,
  isLoadingUnits: false,
  hasFaction: true,
  onFactionChange: vi.fn(),
  onQueryChange: vi.fn(),
  onSelect: vi.fn(),
}

describe('UnitSelector', () => {
  it('renders the label', () => {
    render(<UnitSelector {...defaultProps} />)
    expect(screen.getByText('Attacker')).toBeInTheDocument()
  })

  it('shows faction options in the dropdown', () => {
    render(<UnitSelector {...defaultProps} />)
    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()
    expect(screen.getByText('Space Marines')).toBeInTheDocument()
    expect(screen.getByText('Orks')).toBeInTheDocument()
  })

  it('calls onFactionChange when faction is selected', () => {
    const onFactionChange = vi.fn()
    render(<UnitSelector {...defaultProps} onFactionChange={onFactionChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Orks' } })
    expect(onFactionChange).toHaveBeenCalledWith('Orks')
  })

  it('shows unit list when units are provided', () => {
    render(<UnitSelector {...defaultProps} />)
    expect(screen.getByText('Intercessor Squad')).toBeInTheDocument()
    expect(screen.getByText('Tactical Squad')).toBeInTheDocument()
  })

  it('calls onSelect when a unit is clicked', () => {
    const onSelect = vi.fn()
    render(<UnitSelector {...defaultProps} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Intercessor Squad'))
    expect(onSelect).toHaveBeenCalledWith('u1')
  })

  it('highlights the selected unit', () => {
    render(<UnitSelector {...defaultProps} selectedUnitId="u1" />)
    const button = screen.getByText('Intercessor Squad').closest('button')
    expect(button?.className).toContain('amber')
  })

  it('shows loading state when isLoadingUnits is true', () => {
    render(<UnitSelector {...defaultProps} units={[]} isLoadingUnits={true} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('calls onQueryChange when search input changes', () => {
    const onQueryChange = vi.fn()
    render(<UnitSelector {...defaultProps} onQueryChange={onQueryChange} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'Intercessor' } })
    expect(onQueryChange).toHaveBeenCalledWith('Intercessor')
  })

  it('shows prompt to select faction when hasFaction is false', () => {
    render(<UnitSelector {...defaultProps} units={[]} hasFaction={false} />)
    expect(screen.getByText(/select a faction/i)).toBeInTheDocument()
  })

  it('shows role filter pills when faction is selected', () => {
    render(<UnitSelector {...defaultProps} />)
    expect(screen.getByText('All')).toBeInTheDocument()
    // Battleline appears as both filter pill and role badge, so check at least one exists
    expect(screen.getAllByText('Battleline').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Characters').length).toBeGreaterThanOrEqual(1)
  })

  it('filters units by role when a role pill is clicked', () => {
    render(<UnitSelector {...defaultProps} />)
    // Both units visible initially
    expect(screen.getByText('Intercessor Squad')).toBeInTheDocument()
    expect(screen.getByText('Tactical Squad')).toBeInTheDocument()
    // Click Battleline filter pill (u1 is Battleline, u2 is Characters)
    const battlelineButtons = screen.getAllByText('Battleline')
    // First match is the filter pill, second is the role badge on u1
    fireEvent.click(battlelineButtons[0]!)
    expect(screen.getByText('Intercessor Squad')).toBeInTheDocument()
    expect(screen.queryByText('Tactical Squad')).not.toBeInTheDocument()
  })
})
