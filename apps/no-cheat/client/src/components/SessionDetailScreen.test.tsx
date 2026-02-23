import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SessionDetailScreen } from './SessionDetailScreen'

// Module-level state that the mock reads from — allows per-test variation
let mockQueryResult: { data: unknown; isLoading: boolean } = {
  data: undefined,
  isLoading: true,
}

vi.mock('../lib/trpc', () => ({
  trpc: {
    session: {
      get: {
        useQuery: () => mockQueryResult,
      },
    },
  },
}))

const loadedSession = {
  id: 'sess-1',
  userId: 'u1',
  diceSetId: 'set-1',
  isLoaded: 1,
  zScore: 2.84,
  opponentName: 'Dave',
  createdAt: 1_700_000_000_000,
  closedAt: 1_700_000_001_000,
  photoUrl: null,
}

const fakeRolls = [
  { id: 'r1', sessionId: 'sess-1', pipValues: '[3,5,2]', createdAt: 1_700_000_000_100 },
  { id: 'r2', sessionId: 'sess-1', pipValues: '[6,6,6]', createdAt: 1_700_000_000_200 },
]

describe('SessionDetailScreen', () => {
  it('shows loading state while data is fetching', () => {
    mockQueryResult = { data: undefined, isLoading: true }
    render(<SessionDetailScreen sessionId="sess-1" onBack={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows Loaded verdict for a loaded session', () => {
    mockQueryResult = { data: { session: loadedSession, rolls: fakeRolls }, isLoading: false }
    render(<SessionDetailScreen sessionId="sess-1" onBack={() => {}} />)
    expect(screen.getByText('Loaded')).toBeInTheDocument()
  })

  it('shows Fair verdict for a fair session', () => {
    const fairSession = { ...loadedSession, isLoaded: 0, zScore: 0.4, opponentName: null }
    mockQueryResult = { data: { session: fairSession, rolls: [] }, isLoading: false }
    render(<SessionDetailScreen sessionId="sess-2" onBack={() => {}} />)
    expect(screen.getByText('Fair')).toBeInTheDocument()
  })

  it('shows the z-score', () => {
    mockQueryResult = { data: { session: loadedSession, rolls: fakeRolls }, isLoading: false }
    render(<SessionDetailScreen sessionId="sess-1" onBack={() => {}} />)
    expect(screen.getByText(/z-score.*2\.84/i)).toBeInTheDocument()
  })

  it('shows opponent name when present', () => {
    mockQueryResult = { data: { session: loadedSession, rolls: fakeRolls }, isLoading: false }
    render(<SessionDetailScreen sessionId="sess-1" onBack={() => {}} />)
    expect(screen.getByText(/vs Dave/i)).toBeInTheDocument()
  })

  it('shows the roll count', () => {
    mockQueryResult = { data: { session: loadedSession, rolls: fakeRolls }, isLoading: false }
    render(<SessionDetailScreen sessionId="sess-1" onBack={() => {}} />)
    expect(screen.getByText(/2 rolls/i)).toBeInTheDocument()
  })

  it('shows individual rolls via RollDetail', () => {
    mockQueryResult = { data: { session: loadedSession, rolls: fakeRolls }, isLoading: false }
    render(<SessionDetailScreen sessionId="sess-1" onBack={() => {}} />)
    expect(screen.getByText('3, 5, 2')).toBeInTheDocument()
    expect(screen.getByText('6, 6, 6')).toBeInTheDocument()
  })

  it('calls onBack when the back button is clicked', () => {
    mockQueryResult = { data: { session: loadedSession, rolls: fakeRolls }, isLoading: false }
    const onBack = vi.fn()
    render(<SessionDetailScreen sessionId="sess-1" onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })
})
