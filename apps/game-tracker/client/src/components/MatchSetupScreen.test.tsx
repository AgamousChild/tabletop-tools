import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MatchSetupScreen } from './MatchSetupScreen'

vi.mock('@tabletop-tools/game-data-store', () => ({
  useFactions: () => ({
    data: ['Space Marines', 'Orks'],
    error: null,
    isLoading: false,
  }),
  useDetachments: () => ({
    data: [],
    error: null,
    isLoading: false,
  }),
  useLists: () => ({
    data: [
      { id: 'list-1', name: 'My List', faction: 'Space Marines', totalPts: 2000, createdAt: 0, updatedAt: 0 },
    ],
    refetch: vi.fn(),
  }),
}))

describe('MatchSetupScreen', () => {
  it('shows Match Setup title', () => {
    render(<MatchSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Match Setup')).toBeInTheDocument()
  })

  it('shows date input', () => {
    render(<MatchSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Date')).toBeInTheDocument()
    // Date input exists (type="date")
    const dateInput = document.querySelector('input[type="date"]')
    expect(dateInput).toBeInTheDocument()
  })

  it('shows Your Info section', () => {
    render(<MatchSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Your Info')).toBeInTheDocument()
    expect(screen.getByLabelText('Your faction')).toBeInTheDocument()
  })

  it('shows Opponent section', () => {
    render(<MatchSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Opponent')).toBeInTheDocument()
    expect(screen.getByLabelText('Opponent faction')).toBeInTheDocument()
  })

  it('shows tournament checkbox', () => {
    render(<MatchSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Tournament match')).toBeInTheDocument()
  })

  it('shows tournament name field when tournament checked', () => {
    render(<MatchSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Tournament match'))
    expect(screen.getByPlaceholderText(/regional gt/i)).toBeInTheDocument()
  })

  it('Next button disabled when opponent faction empty', () => {
    render(<MatchSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('calls onNext with data when form submitted', () => {
    const onNext = vi.fn()
    render(<MatchSetupScreen onNext={onNext} onBack={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Opponent faction'), {
      target: { value: 'Orks' },
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ opponentFaction: 'Orks' }),
    )
  })

  it('calls onBack when back is clicked', () => {
    const onBack = vi.fn()
    render(<MatchSetupScreen onNext={vi.fn()} onBack={onBack} />)
    fireEvent.click(screen.getByText('Back'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows list selector when lists exist', () => {
    render(<MatchSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByLabelText('Your list')).toBeInTheDocument()
    expect(screen.getByText('My List (2000pts)')).toBeInTheDocument()
  })
})
