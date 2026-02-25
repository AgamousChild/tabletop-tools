import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let queryReturn: any

vi.mock('../lib/trpc', () => ({
  trpc: {
    stats: {
      activeSessions: { useQuery: vi.fn(() => queryReturn) },
    },
  },
}))

import { SessionsPage } from './SessionsPage'

beforeEach(() => {
  queryReturn = { data: null, isLoading: true, error: null }
})

describe('SessionsPage', () => {
  it('shows loading state', () => {
    render(<SessionsPage />)
    expect(screen.getByText('Loading sessions...')).toBeInTheDocument()
  })

  it('shows error message on failure', () => {
    queryReturn = { data: null, isLoading: false, error: { message: 'Unauthorized' } }
    render(<SessionsPage />)
    expect(screen.getByText('Unauthorized')).toBeInTheDocument()
  })

  it('shows empty state when no sessions', () => {
    queryReturn = { data: [], isLoading: false, error: null }
    render(<SessionsPage />)
    expect(screen.getByText('No active sessions.')).toBeInTheDocument()
  })

  it('renders table headers when sessions exist', () => {
    queryReturn = {
      data: [{ id: 's1', userName: 'Alice', userEmail: 'alice@test.com', ipAddress: '1.2.3.4', expiresAt: '2026-03-01T00:00:00Z' }],
      isLoading: false,
      error: null,
    }
    render(<SessionsPage />)
    expect(screen.getByText('User')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('IP')).toBeInTheDocument()
    expect(screen.getByText('Expires')).toBeInTheDocument()
  })

  it('renders session rows with user data', () => {
    queryReturn = {
      data: [
        { id: 's1', userName: 'Alice', userEmail: 'alice@test.com', ipAddress: '1.2.3.4', expiresAt: '2026-03-01T00:00:00Z' },
        { id: 's2', userName: 'Bob', userEmail: 'bob@test.com', ipAddress: null, expiresAt: null },
      ],
      isLoading: false,
      error: null,
    }
    render(<SessionsPage />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('bob@test.com')).toBeInTheDocument()
  })

  it('shows session count in header', () => {
    queryReturn = {
      data: [
        { id: 's1', userName: 'Alice', userEmail: 'alice@test.com', ipAddress: '1.2.3.4', expiresAt: '2026-03-01T00:00:00Z' },
      ],
      isLoading: false,
      error: null,
    }
    render(<SessionsPage />)
    expect(screen.getByText('(1)')).toBeInTheDocument()
  })
})
