import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TournamentDetail } from './TournamentDetail'

let mockQueryResult: { data: unknown; isLoading: boolean } = {
  data: undefined,
  isLoading: true,
}

vi.mock('../lib/trpc', () => ({
  trpc: {
    source: {
      tournament: {
        useQuery: () => mockQueryResult,
      },
    },
  },
}))

const fakeTournament = {
  eventName: 'London GT 2025',
  eventDate: '2025-03-15',
  format: '40k',
  metaWindow: '2025-Q1',
  players: [
    {
      placement: 1,
      faction: 'Space Marines',
      detachment: 'Gladius',
      wins: 6,
      losses: 0,
      draws: 0,
      points: 2400,
      listText: null,
    },
    {
      placement: 2,
      faction: 'Orks',
      detachment: null,
      wins: 5,
      losses: 1,
      draws: 0,
      points: 2100,
      listText: '+ HQ: Warboss',
    },
  ],
}

describe('TournamentDetail', () => {
  it('shows loading while data is fetching', () => {
    mockQueryResult = { data: undefined, isLoading: true }
    render(<TournamentDetail importId="imp-1" onBack={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows not-found when data is null', () => {
    mockQueryResult = { data: null, isLoading: false }
    render(<TournamentDetail importId="imp-1" onBack={() => {}} />)
    expect(screen.getByText(/tournament not found/i)).toBeInTheDocument()
  })

  it('shows the event name', () => {
    mockQueryResult = { data: fakeTournament, isLoading: false }
    render(<TournamentDetail importId="imp-1" onBack={() => {}} />)
    expect(screen.getByRole('heading', { name: 'London GT 2025' })).toBeInTheDocument()
  })

  it('shows player faction names', () => {
    mockQueryResult = { data: fakeTournament, isLoading: false }
    render(<TournamentDetail importId="imp-1" onBack={() => {}} />)
    expect(screen.getByText('Space Marines')).toBeInTheDocument()
    expect(screen.getByText('Orks')).toBeInTheDocument()
  })

  it('shows player count in the event header', () => {
    mockQueryResult = { data: fakeTournament, isLoading: false }
    render(<TournamentDetail importId="imp-1" onBack={() => {}} />)
    expect(screen.getByText('2 players')).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', () => {
    mockQueryResult = { data: fakeTournament, isLoading: false }
    const onBack = vi.fn()
    render(<TournamentDetail importId="imp-1" onBack={onBack} />)
    fireEvent.click(screen.getByText(/← Back/))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows download buttons', () => {
    mockQueryResult = { data: fakeTournament, isLoading: false }
    render(<TournamentDetail importId="imp-1" onBack={() => {}} />)
    expect(screen.getByText(/↓ JSON/i)).toBeInTheDocument()
    expect(screen.getByText(/↓ CSV/i)).toBeInTheDocument()
  })
})
