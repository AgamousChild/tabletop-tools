import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PlayerProfile } from './PlayerProfile'

let mockProfileResult: { data: unknown; isLoading: boolean } = {
  data: undefined,
  isLoading: true,
}

vi.mock('../lib/trpc', () => ({
  trpc: {
    player: {
      profile: {
        useQuery: () => mockProfileResult,
      },
    },
  },
}))

const fakeProfile = {
  player: {
    id: 'p1',
    playerName: 'Alice',
    rating: 1720,
    ratingDeviation: 45,
    gamesPlayed: 60,
    displayRating: 1720,
    displayBand: 90,
  },
  history: [
    { id: 'h1', playerId: 'p1', eventName: 'London GT', ratingBefore: 1500, ratingAfter: 1650, recordedAt: 1700000000 },
    { id: 'h2', playerId: 'p1', eventName: 'Paris Open', ratingBefore: 1650, ratingAfter: 1720, recordedAt: 1700100000 },
  ],
}

describe('PlayerProfile', () => {
  it('shows loading while fetching', () => {
    mockProfileResult = { data: undefined, isLoading: true }
    render(<PlayerProfile playerId="p1" onBack={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows not found when data is null', () => {
    mockProfileResult = { data: null, isLoading: false }
    render(<PlayerProfile playerId="p1" onBack={() => {}} />)
    expect(screen.getByText(/player not found/i)).toBeInTheDocument()
  })

  it('shows player name as heading', () => {
    mockProfileResult = { data: fakeProfile, isLoading: false }
    render(<PlayerProfile playerId="p1" onBack={() => {}} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows player rating', () => {
    mockProfileResult = { data: fakeProfile, isLoading: false }
    render(<PlayerProfile playerId="p1" onBack={() => {}} />)
    // Rating appears in the header stat line
    expect(screen.getAllByText('1720').length).toBeGreaterThanOrEqual(1)
  })

  it('shows games played', () => {
    mockProfileResult = { data: fakeProfile, isLoading: false }
    render(<PlayerProfile playerId="p1" onBack={() => {}} />)
    expect(screen.getByText('60')).toBeInTheDocument()
  })

  it('shows rating history section', () => {
    mockProfileResult = { data: fakeProfile, isLoading: false }
    render(<PlayerProfile playerId="p1" onBack={() => {}} />)
    expect(screen.getByText('Rating History')).toBeInTheDocument()
  })

  it('shows recent events', () => {
    mockProfileResult = { data: fakeProfile, isLoading: false }
    render(<PlayerProfile playerId="p1" onBack={() => {}} />)
    expect(screen.getByText('Recent Events')).toBeInTheDocument()
    expect(screen.getByText('London GT')).toBeInTheDocument()
    expect(screen.getByText('Paris Open')).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', () => {
    mockProfileResult = { data: fakeProfile, isLoading: false }
    const onBack = vi.fn()
    render(<PlayerProfile playerId="p1" onBack={onBack} />)
    fireEvent.click(screen.getByText(/← Back/))
    expect(onBack).toHaveBeenCalled()
  })
})
