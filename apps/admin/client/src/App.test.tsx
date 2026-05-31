import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
      deleteUser: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      revokeSession: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      revokeAllSessions: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      appActivity: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      recentEvents: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      bsdataVersion: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      matchResults: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      topFactions: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      bcpScraperStatus: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      bcpScraperHistory: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
      triggerBcpScrape: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      triggerMetaPipeline: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      ingestSourcesList: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false, refetch: vi.fn() })),
      },
      ingestJobs: { useQuery: vi.fn(() => ({ data: [], isLoading: false, refetch: vi.fn() })) },
      addIngestSource: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      toggleIngestSource: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      triggerDiscover: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      triggerProcess: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      triggerYoutubeIngest: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
      triggerWebIngest: { useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })) },
    },
    crosswalk: {
      stats: { useQuery: vi.fn(() => ({ data: null, isLoading: true, refetch: vi.fn() })) },
      listPending: {
        useQuery: vi.fn(() => ({ data: null, isLoading: true, refetch: vi.fn() })),
      },
      candidate: {
        byId: { useQuery: vi.fn(() => ({ data: null, isLoading: true })) },
        approve: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        reject: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        override: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        approveBulk: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        rejectBulk: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
      runLlmEvaluator: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
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
    expect(screen.getByText('Events')).toBeInTheDocument()
    expect(screen.getByText('Scraper')).toBeInTheDocument()
    expect(screen.getByText('Ingest')).toBeInTheDocument()
    expect(screen.getByText('Crosswalk')).toBeInTheDocument()
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

  it('clicking Events nav renders EventsPage', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: '1', name: 'Micah', email: 'micah@test.com' }, session: {} },
      isPending: false,
      refetch: vi.fn(),
    } as any)

    render(<App />)
    fireEvent.click(screen.getByText('Events'))
    expect(screen.getByText('Loading events...')).toBeInTheDocument()
  })

  it('clicking Scraper nav renders ScraperPage', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: '1', name: 'Micah', email: 'micah@test.com' }, session: {} },
      isPending: false,
      refetch: vi.fn(),
    } as any)

    render(<App />)
    fireEvent.click(screen.getByText('Scraper'))
    expect(screen.getByText('Loading scraper status...')).toBeInTheDocument()
  })

  it('clicking Ingest nav renders IngestPage', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: '1', name: 'Micah', email: 'micah@test.com' }, session: {} },
      isPending: false,
      refetch: vi.fn(),
    } as any)

    render(<App />)
    fireEvent.click(screen.getByText('Ingest'))
    expect(screen.getByText('Content Ingestor')).toBeInTheDocument()
  })

  it('clicking Crosswalk nav renders CrosswalkPage', () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: '1', name: 'Micah', email: 'micah@test.com' }, session: {} },
      isPending: false,
      refetch: vi.fn(),
    } as any)

    render(<App />)
    fireEvent.click(screen.getByText('Crosswalk'))
    expect(screen.getByText('Crosswalk Review')).toBeInTheDocument()
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
