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
  requirePhotos: 0,
  whoGoesFirst: 'YOU',
  turns: [
    {
      id: 't1',
      turnNumber: 1,
      primaryScored: 15,
      secondaryScored: 10,
      cpSpent: 2,
      yourPrimary: 15,
      theirPrimary: 8,
      yourSecondary: 10,
      theirSecondary: 5,
      yourCpGained: 1,
      yourCpSpent: 2,
      theirCpGained: 1,
      theirCpSpent: 1,
      yourUnitsLost: '[]',
      theirUnitsLost: '[{"name":"Boyz"}]',
      yourUnitsDestroyed: '[]',
      theirUnitsDestroyed: '[]',
      notes: null,
    },
    {
      id: 't2',
      turnNumber: 2,
      primaryScored: 20,
      secondaryScored: 15,
      cpSpent: 1,
      yourPrimary: 20,
      theirPrimary: 10,
      yourSecondary: 15,
      theirSecondary: 8,
      yourCpGained: 1,
      yourCpSpent: 1,
      theirCpGained: 1,
      theirCpSpent: 2,
      yourUnitsLost: '[{"name":"Intercessors"}]',
      theirUnitsLost: '[]',
      yourUnitsDestroyed: '[]',
      theirUnitsDestroyed: '[]',
      notes: 'Close round',
    },
  ],
  secondaries: [
    { id: 's1', player: 'YOUR', secondaryName: 'Assassination', vpPerRound: '[3,4,0,0,0]' },
    { id: 's2', player: 'THEIRS', secondaryName: 'Behind Enemy Lines', vpPerRound: '[2,0,0,0,0]' },
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

  it('shows per-player CP stats', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    // Both player columns should show CP Used
    const cpLabels = screen.getAllByText('CP Used')
    expect(cpLabels).toHaveLength(2)
  })

  it('shows per-player units lost stats', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    const unitsLabels = screen.getAllByText('Units Lost')
    expect(unitsLabels).toHaveLength(2)
  })

  it('shows round breakdown', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    expect(screen.getByText('Round Breakdown')).toBeInTheDocument()
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText('Round 2')).toBeInTheDocument()
  })

  it('shows per-player VP in round breakdown', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    // Round 1: You 25VP, Them 13VP
    expect(screen.getByText('25VP (P:15 S:10)')).toBeInTheDocument()
    expect(screen.getByText('13VP (P:8 S:5)')).toBeInTheDocument()
  })

  it('shows secondaries summary', () => {
    render(<EndGameScreen matchId="m1" onBack={vi.fn()} />)
    expect(screen.getByText('Secondaries')).toBeInTheDocument()
    expect(screen.getByText('Assassination')).toBeInTheDocument()
    expect(screen.getByText('7 VP')).toBeInTheDocument()
    expect(screen.getByText('Behind Enemy Lines')).toBeInTheDocument()
    expect(screen.getByText('2 VP')).toBeInTheDocument()
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
