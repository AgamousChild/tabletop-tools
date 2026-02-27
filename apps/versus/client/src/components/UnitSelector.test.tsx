import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
})
