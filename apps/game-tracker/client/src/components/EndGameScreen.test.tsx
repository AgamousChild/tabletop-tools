import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EndGameScreen } from './EndGameScreen'

const completedMatch = {
  id: 'm1',
  opponentFaction: 'Orks',
  opponentName: 'Dave',
  mission: 'Scorched Earth',
  yourFaction: 'Space Marines',
  yourDetachment: 'Gladius Task Force',
  result: 'WIN',
  isTournament: 0,
  yourFinalScore: 85,
  theirFinalScore: 60,
  deploymentZone: 'Tipping Point',
  turns: [
    {
      id: 't1',
      turnNumber: 1,
      primaryScored: 15,
      secondaryScored: 10,
      cpSpent: 2,
      yourUnitsLost: '[]',
      theirUnitsLost: '[{"name":"Boyz"}]',
      notes: null,
    },
    {
      id: 't2',
      turnNumber: 2,
      primaryScored: 20,
      secondaryScored: 15,
      cpSpent: 1,
      yourUnitsLost: '[{"name":"Intercessors"}]',
      theirUnitsLost: '[]',
      notes: 'Close round',
    },
  ],
}

vi.mock('../lib/trpc', () => ({
  trpc: {
    match: {
      get: {
        useQuery: () => ({
          data: completedMatch,
          refetch: vi.fn(),
        }),
      },
    },
  },
}))

describe('EndGameScreen', () => {
  it('shows Match Summary title', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    expect(screen.getByText('Match Summary')).toBeInTheDocument()
  })

  it('shows result text', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    expect(screen.getByText('WIN')).toBeInTheDocument()
  })

  it('shows final scores', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    expect(screen.getByText('85 -- 60')).toBeInTheDocument()
  })

  it('shows opponent with name', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    expect(screen.getByText(/Dave \(Orks\)/)).toBeInTheDocument()
  })

  it('shows your faction and detachment', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    expect(screen.getByText(/Space Marines/)).toBeInTheDocument()
    expect(screen.getByText(/Gladius Task Force/)).toBeInTheDocument()
  })

  it('shows match stats', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    expect(screen.getByText('CP Used')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument() // 2 + 1 CP
    expect(screen.getByText('Units Lost')).toBeInTheDocument()
    expect(screen.getByText('Units Killed')).toBeInTheDocument()
  })

  it('shows round breakdown', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    expect(screen.getByText('Round Breakdown')).toBeInTheDocument()
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText('Round 2')).toBeInTheDocument()
  })

  it('shows per-round VP breakdown', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    expect(screen.getByText('25VP (P:15 S:10)')).toBeInTheDocument()
    expect(screen.getByText('35VP (P:20 S:15)')).toBeInTheDocument()
  })

  it('shows units killed in round breakdown', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    expect(screen.getByText(/Killed: Boyz/)).toBeInTheDocument()
  })

  it('shows notes in round breakdown', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    expect(screen.getByText('Close round')).toBeInTheDocument()
  })

  it('calls onBack when back is clicked', () => {
    const onBack = vi.fn()
    render(<EndGameScreen matchId="m1" onBack={onBack} />)
    fireEvent.click(screen.getByText('Back'))
    expect(onBack).toHaveBeenCalled()
  })
})
