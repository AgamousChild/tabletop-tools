import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// Mock auth client before importing App
vi.mock('./lib/auth', () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false, refetch: vi.fn() })),
    signOut: vi.fn(() => Promise.resolve()),
  },
  signIn: { email: vi.fn() },
  signOut: vi.fn(),
  signUp: { email: vi.fn() },
  useSession: vi.fn(() => ({ data: null, isPending: false, refetch: vi.fn() })),
}))

// Mock trpc
vi.mock('./lib/trpc', () => {
  const trpc = {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    stats: {
      overview: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      recentUsers: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      activeSessions: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      appActivity: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      importHistory: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      bsdataVersion: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      matchResults: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      topFactions: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
    },
  }
  return { trpc, createTRPCClient: vi.fn() }
})

import App from './App'
import { authClient } from './lib/auth'

describe('App', () => {
  it('shows loading state while session is pending', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: null,
      isPending: true,
      refetch: vi.fn(),
    } as any)

    render(<App />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows auth screen when not logged in', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: null,
      isPending: false,
      refetch: vi.fn(),
    } as any)

    render(<App />)
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
  })

  it('shows nav when logged in', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: '1', name: 'Micah', email: 'micah@test.com' }, session: {} },
      isPending: false,
      refetch: vi.fn(),
    } as any)

    render(<App />)
    expect(screen.getByText('ADMIN')).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    expect(screen.getByText('Imports')).toBeInTheDocument()
    expect(screen.getByText('Micah')).toBeInTheDocument()
    expect(screen.getByText('Sign out')).toBeInTheDocument()
  })

  it('clicking Users nav renders UsersPage', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: '1', name: 'Micah', email: 'micah@test.com' }, session: {} },
      isPending: false,
      refetch: vi.fn(),
    } as any)

    render(<App />)
    fireEvent.click(screen.getByText('Users'))
    // UsersPage shows "Loading users..." because tRPC mock returns isLoading: true
    expect(screen.getByText('Loading users...')).toBeInTheDocument()
  })

  it('clicking Sessions nav renders SessionsPage', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: '1', name: 'Micah', email: 'micah@test.com' }, session: {} },
      isPending: false,
      refetch: vi.fn(),
    } as any)

    render(<App />)
    fireEvent.click(screen.getByText('Sessions'))
    expect(screen.getByText('Loading sessions...')).toBeInTheDocument()
  })

  it('clicking Activity nav renders ActivityPage', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: '1', name: 'Micah', email: 'micah@test.com' }, session: {} },
      isPending: false,
      refetch: vi.fn(),
    } as any)

    render(<App />)
    fireEvent.click(screen.getByText('Activity'))
    expect(screen.getByText('Loading activity...')).toBeInTheDocument()
  })

  it('clicking Imports nav renders ImportsPage', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: '1', name: 'Micah', email: 'micah@test.com' }, session: {} },
      isPending: false,
      refetch: vi.fn(),
    } as any)

    render(<App />)
    fireEvent.click(screen.getByText('Imports'))
    expect(screen.getByText('Loading imports...')).toBeInTheDocument()
  })

  it('defaults to Overview (Dashboard) page', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: '1', name: 'Micah', email: 'micah@test.com' }, session: {} },
      isPending: false,
      refetch: vi.fn(),
    } as any)

    render(<App />)
    // Dashboard shows "Loading stats..." because tRPC mock returns isLoading: true
    expect(screen.getByText('Loading stats...')).toBeInTheDocument()
  })
})
