import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let queryReturn: any

const mockDeleteUser = vi.fn()
const mockRevokeAll = vi.fn()

vi.mock('../lib/trpc', () => ({
  trpc: {
    stats: {
      recentUsers: { useQuery: vi.fn(() => queryReturn) },
      deleteUser: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => { mockDeleteUser(args); opts?.onSuccess?.() },
          isPending: false,
        }),
      },
      revokeAllSessions: {
        useMutation: () => ({
          mutate: mockRevokeAll,
          isPending: false,
        }),
      },
    },
  },
}))

import { UsersPage } from './UsersPage'

beforeEach(() => {
  queryReturn = { data: null, isLoading: true, error: null }
})

describe('UsersPage', () => {
  it('shows loading state', () => {
    render(<UsersPage />)
    expect(screen.getByText('Loading users...')).toBeInTheDocument()
  })

  it('shows error message on failure', () => {
    queryReturn = { data: null, isLoading: false, error: { message: 'Forbidden' } }
    render(<UsersPage />)
    expect(screen.getByText('Forbidden')).toBeInTheDocument()
  })

  it('shows empty state when no users', () => {
    queryReturn = { data: [], isLoading: false, error: null }
    render(<UsersPage />)
    expect(screen.getByText('No users yet.')).toBeInTheDocument()
  })

  it('renders table with user rows', () => {
    queryReturn = {
      data: [
        { id: 'u1', name: 'Alice', email: 'alice@test.com', createdAt: '2026-01-15T00:00:00Z' },
        { id: 'u2', name: 'Bob', email: 'bob@test.com', createdAt: '2026-02-01T00:00:00Z' },
      ],
      isLoading: false,
      error: null,
    }
    render(<UsersPage />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Joined')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows dash for missing createdAt', () => {
    queryReturn = {
      data: [{ id: 'u1', name: 'Alice', email: 'alice@test.com', createdAt: null }],
      isLoading: false,
      error: null,
    }
    const { container } = render(<UsersPage />)
    const cells = container.querySelectorAll('td')
    const joinedCell = cells[2]
    expect(joinedCell.textContent).toBe('—')
  })
})
