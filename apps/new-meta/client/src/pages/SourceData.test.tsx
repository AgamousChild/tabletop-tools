import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SourceData } from './SourceData'

let mockTournaments: unknown[] = []
let mockIsLoading = false

vi.mock('../lib/trpc', () => ({
  trpc: {
    source: {
      tournaments: {
        useQuery: () => ({ data: mockTournaments, isLoading: mockIsLoading }),
      },
    },
  },
}))

const fakeTournaments = [
  {
    eventId: 'evt-1',
    eventName: 'London GT 2025',
    eventDate: '2025-03-15',
    format: '40k',
    location: 'London, UK',
    playerCount: 128,
    rounds: 6,
    winnerFaction: 'Space Marines',
  },
  {
    eventId: 'evt-2',
    eventName: 'Berlin Open',
    eventDate: '2025-04-20',
    format: '40k',
    location: 'Berlin, DE',
    playerCount: 64,
    rounds: 5,
    winnerFaction: 'Orks',
  },
]

describe('SourceData', () => {
  it('shows the page title', () => {
    mockTournaments = []
    mockIsLoading = false
    render(<SourceData onTournamentSelect={() => {}} />)
    expect(screen.getByText('Source Data')).toBeInTheDocument()
  })

  it('shows loading while fetching', () => {
    mockIsLoading = true
    mockTournaments = []
    render(<SourceData onTournamentSelect={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows empty state when no tournaments', () => {
    mockIsLoading = false
    mockTournaments = []
    render(<SourceData onTournamentSelect={() => {}} />)
    expect(screen.getByText(/no tournaments imported yet/i)).toBeInTheDocument()
  })

  it('shows tournament event names', () => {
    mockIsLoading = false
    mockTournaments = fakeTournaments
    render(<SourceData onTournamentSelect={() => {}} />)
    expect(screen.getByText('London GT 2025')).toBeInTheDocument()
    expect(screen.getByText('Berlin Open')).toBeInTheDocument()
  })

  it('calls onTournamentSelect with eventId when a row is clicked', () => {
    mockIsLoading = false
    mockTournaments = fakeTournaments
    const onTournamentSelect = vi.fn()
    render(<SourceData onTournamentSelect={onTournamentSelect} />)
    fireEvent.click(screen.getByText('London GT 2025'))
    expect(onTournamentSelect).toHaveBeenCalledWith('evt-1')
  })
})
