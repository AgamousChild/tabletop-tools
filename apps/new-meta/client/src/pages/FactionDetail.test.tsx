import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FactionDetail } from './FactionDetail'

let mockQueryResult: { data: unknown; isLoading: boolean } = {
  data: undefined,
  isLoading: true,
}

vi.mock('../lib/trpc', () => ({
  trpc: {
    meta: {
      faction: {
        useQuery: () => mockQueryResult,
      },
    },
  },
}))

const fakeData = {
  stat: {
    factionId: 'ork-1',
    faction: 'Orks',
    allegiance: 'xenos',
    winRate: 0.48,
    drawRate: 0.0,
    overRep: 0.9,
    fourOhStart: 0,
    eventWins: 1,
    eventFinals: 0,
    eventTop4: 2,
    eventTop8: 3,
    eventTop16: 5,
    playerPopPct: 0.15,
    wins: 14,
    losses: 16,
    draws: 0,
    games: 30,
    players: 8,
  },
  detachments: [
    {
      detachmentId: 'det-1',
      detachment: 'Waaagh! Tribe',
      wins: 8,
      losses: 5,
      draws: 0,
      games: 13,
      winRate: 0.615,
      players: 3,
    },
  ],
  combos: [
    {
      comboId: 'orks:green-tide+taktikal-brigade',
      members: 'Green Tide + Taktikal Brigade',
      memberCount: 2,
      totalDp: 3,
      wins: 9,
      losses: 3,
      draws: 0,
      games: 12,
      winRate: 0.75,
      players: 4,
    },
    // A single-detachment army is a combo of one. It belongs in the detachment
    // table, not the combinations table, or every faction shows a
    // "combination" list that is just its detachments again.
    {
      comboId: 'orks:war-horde',
      members: 'War Horde',
      memberCount: 1,
      totalDp: 3,
      wins: 5,
      losses: 5,
      draws: 0,
      games: 10,
      winRate: 0.5,
      players: 2,
    },
  ],
  timeline: [
    { week: '2025-01-06', winRate: 0.625, games: 8, wins: 5, losses: 3, draws: 0 },
    { week: '2025-01-13', winRate: 0.538, games: 13, wins: 7, losses: 5, draws: 1 },
  ],
  topLists: [
    {
      eventName: 'London GT',
      eventDate: '2025-03-01',
      placement: 2,
      detachment: 'Waaagh! Tribe',
      listText: null,
      wins: 5,
      losses: 1,
      draws: 0,
    },
  ],
}

describe('FactionDetail', () => {
  it('shows a loading skeleton while data is fetching', () => {
    mockQueryResult = { data: undefined, isLoading: true }
    render(<FactionDetail factionId="ork-1" onBack={() => {}} />)
    // The affordance is what matters, not the word: skeletons stand in for
    // the real content so a slow cube query does not read as a dead page.
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
  })

  it('shows not-found message when data is null', () => {
    mockQueryResult = { data: null, isLoading: false }
    render(<FactionDetail factionId="ork-1" onBack={() => {}} />)
    expect(screen.getByText(/no data for this faction/i)).toBeInTheDocument()
  })

  it('shows the faction name as a heading', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    render(<FactionDetail factionId="ork-1" onBack={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Orks' })).toBeInTheDocument()
  })

  it('shows win rate', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    render(<FactionDetail factionId="ork-1" onBack={() => {}} />)
    expect(screen.getByText('48.0%')).toBeInTheDocument()
  })

  it('shows detachment names', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    render(<FactionDetail factionId="ork-1" onBack={() => {}} />)
    expect(screen.getByText('Waaagh! Tribe')).toBeInTheDocument()
  })

  it('shows a multi-detachment combination with its DP cost', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    render(<FactionDetail factionId="ork-1" onBack={() => {}} />)
    expect(screen.getByText('Detachment Combinations')).toBeInTheDocument()
    expect(screen.getByText('Green Tide + Taktikal Brigade')).toBeInTheDocument()
    expect(screen.getByText('75.0%')).toBeInTheDocument()
  })

  it('keeps single-detachment armies out of the combinations table', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    render(<FactionDetail factionId="ork-1" onBack={() => {}} />)
    // "War Horde" is a one-detachment army — listing it as a "combination"
    // would just restate the detachment table.
    expect(screen.queryByText('War Horde')).not.toBeInTheDocument()
  })

  it('hides the combinations table when nothing multi-detachment was played', () => {
    mockQueryResult = {
      data: { ...fakeData, combos: [fakeData.combos[1]] },
      isLoading: false,
    }
    render(<FactionDetail factionId="ork-1" onBack={() => {}} />)
    expect(screen.queryByText('Detachment Combinations')).not.toBeInTheDocument()
    // The detachment breakdown still renders.
    expect(screen.getByText('Waaagh! Tribe')).toBeInTheDocument()
  })

  it('shows top list via ListCard', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    render(<FactionDetail factionId="ork-1" onBack={() => {}} />)
    expect(screen.getByText(/London GT/)).toBeInTheDocument()
  })

  it('shows timeline section with date range', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    render(<FactionDetail factionId="ork-1" onBack={() => {}} />)
    expect(screen.getByText('Win Rate Over Time')).toBeInTheDocument()
    expect(screen.getByText('2025-01-06')).toBeInTheDocument()
    expect(screen.getByText('2025-01-13')).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', () => {
    mockQueryResult = { data: fakeData, isLoading: false }
    const onBack = vi.fn()
    render(<FactionDetail factionId="ork-1" onBack={onBack} />)
    fireEvent.click(screen.getByText(/← Back/))
    expect(onBack).toHaveBeenCalled()
  })
})
