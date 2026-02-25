import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let overviewReturn: any
let bsdataReturn: any
let matchResultsReturn: any
let topFactionsReturn: any

vi.mock('../lib/trpc', () => ({
  trpc: {
    stats: {
      overview: { useQuery: vi.fn(() => overviewReturn) },
      bsdataVersion: { useQuery: vi.fn(() => bsdataReturn) },
      matchResults: { useQuery: vi.fn(() => matchResultsReturn) },
      topFactions: { useQuery: vi.fn(() => topFactionsReturn) },
    },
  },
}))

import { Dashboard } from './Dashboard'

const mockOverview = {
  users: { total: 150, recent: 12 },
  sessions: { active: 5, total: 300 },
  elo: { players: 42 },
  newMeta: { glickoPlayers: 30, imports: 15 },
  versus: { simulations: 800 },
  gameTracker: { matches: 60, turns: 240 },
  tournament: { tournaments: 8, players: 64 },
  listBuilder: { lists: 45, units: 180 },
  noCheat: { diceSets: 20, rollingSessions: 35, totalRolls: 5000 },
}

beforeEach(() => {
  overviewReturn = { data: null, isLoading: true, error: null }
  bsdataReturn = { data: null, isLoading: true }
  matchResultsReturn = { data: null, isLoading: true }
  topFactionsReturn = { data: null, isLoading: true }
})

describe('Dashboard', () => {
  it('shows loading state', () => {
    render(<Dashboard />)
    expect(screen.getByText('Loading stats...')).toBeInTheDocument()
  })

  it('shows error message on failure', () => {
    overviewReturn = { data: null, isLoading: false, error: { message: 'Forbidden' } }
    render(<Dashboard />)
    expect(screen.getByText('Forbidden')).toBeInTheDocument()
  })

  it('renders Platform Overview heading with data', () => {
    overviewReturn = { data: mockOverview, isLoading: false, error: null }
    render(<Dashboard />)
    expect(screen.getByText('Platform Overview')).toBeInTheDocument()
  })

  it('renders Users & Sessions stat cards', () => {
    overviewReturn = { data: mockOverview, isLoading: false, error: null }
    render(<Dashboard />)
    expect(screen.getByText('Total Users')).toBeInTheDocument()
    expect(screen.getByText('150')).toBeInTheDocument()
    expect(screen.getByText('12 in last 7 days')).toBeInTheDocument()
    expect(screen.getByText('Active Sessions')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('ELO Players')).toBeInTheDocument()
    expect(screen.getByText('Glicko Players')).toBeInTheDocument()
  })

  it('renders App Usage stat cards', () => {
    overviewReturn = { data: mockOverview, isLoading: false, error: null }
    render(<Dashboard />)
    expect(screen.getByText('Versus Simulations')).toBeInTheDocument()
    expect(screen.getByText('800')).toBeInTheDocument()
    expect(screen.getByText('Games Tracked')).toBeInTheDocument()
    expect(screen.getByText('Tournaments')).toBeInTheDocument()
    expect(screen.getByText('Lists Built')).toBeInTheDocument()
    expect(screen.getByText('Dice Sets')).toBeInTheDocument()
    expect(screen.getByText('Meta Imports')).toBeInTheDocument()
  })

  it('renders Match Results section when data exists', () => {
    overviewReturn = { data: mockOverview, isLoading: false, error: null }
    matchResultsReturn = { data: { wins: 10, losses: 8, draws: 2, inProgress: 1, total: 21 }, isLoading: false }
    render(<Dashboard />)
    expect(screen.getByText('Match Results')).toBeInTheDocument()
    expect(screen.getByText('Wins')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('Total Matches')).toBeInTheDocument()
    expect(screen.getByText('21')).toBeInTheDocument()
  })

  it('hides Match Results section when data is null', () => {
    overviewReturn = { data: mockOverview, isLoading: false, error: null }
    matchResultsReturn = { data: null, isLoading: false }
    render(<Dashboard />)
    expect(screen.queryByText('Match Results')).not.toBeInTheDocument()
  })

  it('shows BSData SHA when available', () => {
    overviewReturn = { data: mockOverview, isLoading: false, error: null }
    bsdataReturn = { data: { sha: 'abc1234', date: '2026-01-15T00:00:00Z', message: 'Update data' }, isLoading: false }
    render(<Dashboard />)
    expect(screen.getByText('abc1234')).toBeInTheDocument()
    expect(screen.getByText('Update data')).toBeInTheDocument()
  })

  it('shows BSData error when present', () => {
    overviewReturn = { data: mockOverview, isLoading: false, error: null }
    bsdataReturn = { data: { error: 'Rate limited' }, isLoading: false }
    render(<Dashboard />)
    expect(screen.getByText('Rate limited')).toBeInTheDocument()
  })

  it('renders Top Factions list', () => {
    overviewReturn = { data: mockOverview, isLoading: false, error: null }
    topFactionsReturn = {
      data: [
        { faction: 'Space Marines', count: 25 },
        { faction: 'Orks', count: 18 },
      ],
      isLoading: false,
    }
    render(<Dashboard />)
    expect(screen.getByText('Space Marines')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
    expect(screen.getByText('Orks')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
  })
})
