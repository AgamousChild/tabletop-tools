import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PlayerRanking } from './PlayerRanking'

let mockPlayers: unknown[] = []
let mockIsLoading = false

vi.mock('../lib/trpc', () => ({
  trpc: {
    player: {
      leaderboard: {
        useQuery: () => ({ data: mockPlayers, isLoading: mockIsLoading }),
      },
    },
  },
}))

const fakePlayers = [
  { id: 'p1', playerName: 'Alice', rating: 1720, ratingDeviation: 45, gamesPlayed: 60 },
  { id: 'p2', playerName: 'Bob', rating: 1580, ratingDeviation: 110, gamesPlayed: 22 },
]

describe('PlayerRanking', () => {
  it('shows the page title', () => {
    mockPlayers = []
    mockIsLoading = false
    render(<PlayerRanking />)
    expect(screen.getByText('Player Rankings')).toBeInTheDocument()
  })

  it('shows loading text while fetching', () => {
    mockIsLoading = true
    mockPlayers = []
    render(<PlayerRanking />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows empty-state message when no players', () => {
    mockIsLoading = false
    mockPlayers = []
    render(<PlayerRanking />)
    expect(screen.getByText(/no players with/i)).toBeInTheDocument()
  })

  it('renders player names via GlickoBar', () => {
    mockIsLoading = false
    mockPlayers = fakePlayers
    render(<PlayerRanking />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows ranks alongside player names', () => {
    mockIsLoading = false
    mockPlayers = fakePlayers
    render(<PlayerRanking />)
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })
})
