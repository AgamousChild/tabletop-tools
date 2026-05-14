import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let queryReturn: any

vi.mock('../lib/trpc', () => ({
  trpc: {
    stats: {
      recentEvents: { useQuery: vi.fn(() => queryReturn) },
    },
  },
}))

import { ImportsPage } from './ImportsPage'

beforeEach(() => {
  queryReturn = { data: null, isLoading: true, error: null }
})

describe('ImportsPage', () => {
  it('shows loading state', () => {
    render(<ImportsPage />)
    expect(screen.getByText('Loading events...')).toBeInTheDocument()
  })

  it('shows error message on failure', () => {
    queryReturn = { data: null, isLoading: false, error: { message: 'DB error' } }
    render(<ImportsPage />)
    expect(screen.getByText('DB error')).toBeInTheDocument()
  })

  it('shows empty state when no events', () => {
    queryReturn = { data: [], isLoading: false, error: null }
    render(<ImportsPage />)
    expect(screen.getByText('No events scraped yet.')).toBeInTheDocument()
  })

  it('renders event count in header', () => {
    queryReturn = {
      data: [
        { id: 'e1', name: 'GT Alpha', source: 'bcp', playerCount: 32, rounds: 5, location: 'Austin, TX', date: 1706745600000 },
        { id: 'e2', name: 'GT Beta', source: 'bcp', playerCount: 48, rounds: 6, location: 'Denver, CO', date: 1707350400000 },
      ],
      isLoading: false,
      error: null,
    }
    render(<ImportsPage />)
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })

  it('renders table with event data', () => {
    queryReturn = {
      data: [
        { id: 'e1', name: 'GT Alpha', source: 'bcp', playerCount: 32, rounds: 5, location: 'Austin, TX', date: 1706745600000 },
      ],
      isLoading: false,
      error: null,
    }
    render(<ImportsPage />)
    expect(screen.getByText('GT Alpha')).toBeInTheDocument()
    expect(screen.getByText('bcp')).toBeInTheDocument()
    expect(screen.getByText('32')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Austin, TX')).toBeInTheDocument()
  })
})
