import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Dashboard } from './Dashboard'

const fakeFactions = [
  {
    faction: 'Space Marines',
    games: 40,
    winRate: 0.6,
    players: 10,
    representationPct: 0.2,
    wins: 26,
    losses: 12,
    draws: 2,
  },
]

const fakeMatchups = [
  { factionA: 'Space Marines', factionB: 'Orks', aWinRate: 0.6, totalGames: 10 },
]

let mockFactions = fakeFactions
let mockMatchups = fakeMatchups
let mockLoadingFactions = false

vi.mock('../lib/trpc', () => ({
  trpc: {
    meta: {
      factions: {
        useQuery: () => ({ data: mockFactions, isLoading: mockLoadingFactions }),
      },
      matchups: {
        useQuery: () => ({ data: mockMatchups, isLoading: false }),
      },
      windows: {
        useQuery: () => ({ data: [] }),
      },
    },
  },
}))

describe('Dashboard', () => {
  it('shows the page title', () => {
    mockFactions = fakeFactions
    mockMatchups = fakeMatchups
    mockLoadingFactions = false
    render(<Dashboard onFactionSelect={() => {}} />)
    expect(screen.getByText('Meta Dashboard')).toBeInTheDocument()
  })

  it('renders faction names via FactionTable', () => {
    mockFactions = fakeFactions
    mockMatchups = fakeMatchups
    mockLoadingFactions = false
    render(<Dashboard onFactionSelect={() => {}} />)
    // Space Marines appears in both FactionTable and MatchupMatrix — use getAllByText
    expect(screen.getAllByText('Space Marines').length).toBeGreaterThan(0)
  })

  it('shows loading text while factions are fetching', () => {
    mockLoadingFactions = true
    mockFactions = []
    mockMatchups = []
    render(<Dashboard onFactionSelect={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('calls onFactionSelect when a faction row is clicked', () => {
    mockFactions = fakeFactions
    mockMatchups = []
    mockLoadingFactions = false
    const onFactionSelect = vi.fn()
    render(<Dashboard onFactionSelect={onFactionSelect} />)
    fireEvent.click(screen.getByText('Space Marines'))
    expect(onFactionSelect).toHaveBeenCalledWith('Space Marines')
  })

  it('renders the matchup matrix section', () => {
    mockFactions = fakeFactions
    mockMatchups = fakeMatchups
    mockLoadingFactions = false
    render(<Dashboard onFactionSelect={() => {}} />)
    expect(screen.getByText('Matchup Matrix')).toBeInTheDocument()
  })
})
