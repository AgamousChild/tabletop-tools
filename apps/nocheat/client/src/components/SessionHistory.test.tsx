import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionHistory } from './SessionHistory'

const sessions = [
  {
    id: 'sess-1',
    userId: 'u1',
    diceSetId: 'set-1',
    isLoaded: 1,
    zScore: 2.84,
    opponentName: 'Dave',
    createdAt: Date.now() - 86400000, // yesterday
    closedAt: Date.now() - 86000000,
    photoUrl: null,
  },
  {
    id: 'sess-2',
    userId: 'u1',
    diceSetId: 'set-1',
    isLoaded: 0,
    zScore: 0.42,
    opponentName: null,
    createdAt: Date.now() - 3600000, // 1 hour ago
    closedAt: Date.now() - 3000000,
    photoUrl: null,
  },
  {
    id: 'sess-3',
    userId: 'u1',
    diceSetId: 'set-1',
    isLoaded: null,
    zScore: null,
    opponentName: 'Carol',
    createdAt: Date.now(),
    closedAt: null, // open session
    photoUrl: null,
  },
]

describe('SessionHistory', () => {
  it('renders each session', () => {
    render(<SessionHistory sessions={sessions} onSelect={() => {}} />)
    expect(screen.getAllByRole('button').length).toBe(3)
  })

  it('shows LOADED label for loaded sessions', () => {
    render(<SessionHistory sessions={sessions} onSelect={() => {}} />)
    expect(screen.getByText(/loaded/i)).toBeInTheDocument()
  })

  it('shows FAIR label for fair sessions', () => {
    render(<SessionHistory sessions={sessions} onSelect={() => {}} />)
    expect(screen.getByText(/fair/i)).toBeInTheDocument()
  })

  it('shows IN PROGRESS for open sessions', () => {
    render(<SessionHistory sessions={sessions} onSelect={() => {}} />)
    expect(screen.getByText(/in progress/i)).toBeInTheDocument()
  })

  it('shows opponent name when present', () => {
    render(<SessionHistory sessions={sessions} onSelect={() => {}} />)
    expect(screen.getByText(/dave/i)).toBeInTheDocument()
  })

  it('calls onSelect with the session id when clicked', () => {
    const onSelect = vi.fn()
    render(<SessionHistory sessions={sessions} onSelect={onSelect} />)
    fireEvent.click(screen.getAllByRole('button')[0]!)
    expect(onSelect).toHaveBeenCalledWith('sess-1')
  })

  it('shows empty state when there are no sessions', () => {
    render(<SessionHistory sessions={[]} onSelect={() => {}} />)
    expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument()
  })
})
