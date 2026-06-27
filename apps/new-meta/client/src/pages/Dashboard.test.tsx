import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Dashboard } from './Dashboard'

const fakeFactions = [
  {
    factionId: 'sm-1',
    faction: 'Space Marines',
    allegiance: 'imperium',
    winRate: 0.6,
    drawRate: 0.05,
    overRep: 1.3,
    fourOhStart: 2,
    eventWins: 3,
    eventFinals: 1,
    eventTop4: 2,
    eventTop8: 4,
    eventTop16: 6,
    playerPopPct: 0.2,
    wins: 26,
    losses: 12,
    draws: 2,
    games: 40,
    players: 10,
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
      availableFilters: {
        useQuery: () => ({
          data: {
            granularityId: 1,
            types: [],
            // Single granularity hides the GranularitySelector — keeps
            // the test focused on dashboard layout, not the picker.
            granularities: [{ id: 1, name: 'Faction' }],
            framesByType: {},
          },
        }),
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

  it('calls onFactionSelect with factionId when a faction row is clicked', () => {
    mockFactions = fakeFactions
    mockMatchups = []
    mockLoadingFactions = false
    const onFactionSelect = vi.fn()
    render(<Dashboard onFactionSelect={onFactionSelect} />)
    fireEvent.click(screen.getByText('Space Marines'))
    expect(onFactionSelect).toHaveBeenCalledWith('sm-1')
  })

  it('renders the matchup matrix section', () => {
    mockFactions = fakeFactions
    mockMatchups = fakeMatchups
    mockLoadingFactions = false
    render(<Dashboard onFactionSelect={() => {}} />)
    expect(screen.getByText('Matchup Matrix')).toBeInTheDocument()
  })
})
