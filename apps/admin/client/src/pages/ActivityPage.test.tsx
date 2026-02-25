import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let queryReturn: any

vi.mock('../lib/trpc', () => ({
  trpc: {
    stats: {
      appActivity: { useQuery: vi.fn(() => queryReturn) },
    },
  },
}))

import { ActivityPage } from './ActivityPage'

beforeEach(() => {
  queryReturn = { data: null, isLoading: true, error: null }
})

describe('ActivityPage', () => {
  it('shows loading state', () => {
    render(<ActivityPage />)
    expect(screen.getByText('Loading activity...')).toBeInTheDocument()
  })

  it('shows error message on failure', () => {
    queryReturn = { data: null, isLoading: false, error: { message: 'Server error' } }
    render(<ActivityPage />)
    expect(screen.getByText('Server error')).toBeInTheDocument()
  })

  it('renders App Activity heading with data', () => {
    queryReturn = {
      data: [{ app: 'no-cheat', total: 100, recent: 10 }],
      isLoading: false,
      error: null,
    }
    render(<ActivityPage />)
    expect(screen.getByText('App Activity')).toBeInTheDocument()
  })

  it('renders app entries with human-readable labels', () => {
    queryReturn = {
      data: [
        { app: 'no-cheat', total: 100, recent: 10 },
        { app: 'versus', total: 80, recent: 5 },
      ],
      isLoading: false,
      error: null,
    }
    render(<ActivityPage />)
    expect(screen.getByText('No Cheat')).toBeInTheDocument()
    expect(screen.getByText('Versus')).toBeInTheDocument()
  })

  it('shows total and recent counts', () => {
    queryReturn = {
      data: [{ app: 'tournament', total: 50, recent: 7 }],
      isLoading: false,
      error: null,
    }
    render(<ActivityPage />)
    expect(screen.getByText('50 total')).toBeInTheDocument()
    expect(screen.getByText('7 this week')).toBeInTheDocument()
  })

  it('renders progress bars', () => {
    queryReturn = {
      data: [
        { app: 'no-cheat', total: 100, recent: 10 },
        { app: 'versus', total: 50, recent: 5 },
      ],
      isLoading: false,
      error: null,
    }
    const { container } = render(<ActivityPage />)
    const bars = container.querySelectorAll('.bg-amber-400.h-2')
    expect(bars).toHaveLength(2)
  })
})
