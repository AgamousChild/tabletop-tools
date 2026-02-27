import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FactionDetail } from './FactionDetail'

let mockQueryResult: { data: unknown; isLoading: boolean } = {
  data: undefined,
  isLoading: true,
}

vi.mock('../lib/trpc', () => ({
  trpc: {
    meta: {
      faction: {
        useQuery: () => mockQueryResult,
      },
    },
  },
}))

const fakeData = {
  stat: {
    faction: 'Orks',
    games: 30,
    winRate: 0.48,
    players: 8,
    representationPct: 0.15,
    wins: 14,
    losses: 16,
    draws: 0,
  },
  detachments: [
    { detachment: 'Waaagh! Tribe', wins: 8, losses: 5, games: 13, winRate: 0.615 },
  ],
  timeline: [
    { week: '2025-01-06', faction: 'Orks', wins: 5, losses: 3, draws: 0 },
    { week: '2025-01-13', faction: 'Orks', wins: 7, losses: 5, draws: 1 },
  ],
  topLists: [
    {
      eventName: 'London GT',
      eventDate: '2025-03-01',
      placement: 2,
      faction: 'Orks',
      wins: 5,
      losses: 1,
      draws: 0,
      points: 2050,
    },
  ],
}

describe('FactionDetail', () => {
  it('shows loading while data is fetching', () => {
    mockQueryResult = { data: undefined, isLoading: true }
    render(<FactionDetail faction="Orks" onBack={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows not-found message when data is null', () => {
    mockQueryResult = { data: null, isLoading: false }
    render(<FactionDetail faction="Orks" onBack={() => {}} />)
    expect(screen.getByText(/no data for orks/i)).toBeInTheDocument()
  })

  it('shows the faction name as a heading', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    render(<FactionDetail faction="Orks" onBack={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Orks' })).toBeInTheDocument()
  })

  it('shows win rate', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    render(<FactionDetail faction="Orks" onBack={() => {}} />)
    expect(screen.getByText('48.0%')).toBeInTheDocument()
  })

  it('shows detachment names', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    render(<FactionDetail faction="Orks" onBack={() => {}} />)
    expect(screen.getByText("Waaagh! Tribe")).toBeInTheDocument()
  })

  it('shows top list via ListCard', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    render(<FactionDetail faction="Orks" onBack={() => {}} />)
    // eventName is rendered alongside the date: "London GT · <date>"
    expect(screen.getByText(/London GT/)).toBeInTheDocument()
  })

  it('shows timeline section with date range', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    render(<FactionDetail faction="Orks" onBack={() => {}} />)
    expect(screen.getByText('Win Rate Over Time')).toBeInTheDocument()
    expect(screen.getByText('2025-01-06')).toBeInTheDocument()
    expect(screen.getByText('2025-01-13')).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    const onBack = vi.fn()
    render(<FactionDetail faction="Orks" onBack={onBack} />)
    fireEvent.click(screen.getByText(/← Back/))
    expect(onBack).toHaveBeenCalled()
  })
})
