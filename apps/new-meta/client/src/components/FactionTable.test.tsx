import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FactionTable } from './FactionTable'

const stats = [
  {
    factionId: 'sm-1',
    faction: 'Space Marines',
    allegiance: 'imperium',
    winRate: 0.6,
    drawRate: 0.05,
    overRep: 1.3,
    fourOhStart: 2,
    eventWins: 3,
    eventFinals: 1,
    eventTop4: 2,
    eventTop8: 4,
    eventTop16: 6,
    playerPopPct: 0.2,
    wins: 26,
    losses: 12,
    draws: 2,
    games: 40,
    players: 10,
  },
  {
    factionId: 'ork-1',
    faction: 'Orks',
    allegiance: 'xenos',
    winRate: 0.45,
    drawRate: 0.0,
    overRep: 0.9,
    fourOhStart: 0,
    eventWins: 0,
    eventFinals: 0,
    eventTop4: 1,
    eventTop8: 2,
    eventTop16: 3,
    playerPopPct: 0.15,
    wins: 13,
    losses: 17,
    draws: 0,
    games: 30,
    players: 8,
  },
  {
    factionId: 'nec-1',
    faction: 'Necrons',
    allegiance: 'xenos',
    winRate: 0.4,
    drawRate: 0.0,
    overRep: 0.7,
    fourOhStart: 0,
    eventWins: 0,
    eventFinals: 0,
    eventTop4: 0,
    eventTop8: 1,
    eventTop16: 2,
    playerPopPct: 0.1,
    wins: 8,
    losses: 12,
    draws: 0,
    games: 20,
    players: 5,
  },
]

describe('FactionTable', () => {
  it('shows empty state when there are no stats', () => {
    render(<FactionTable stats={[]} />)
    expect(screen.getByText(/no data yet/i)).toBeInTheDocument()
  })

  it('renders each faction name', () => {
    render(<FactionTable stats={stats} />)
    expect(screen.getByText('Space Marines')).toBeInTheDocument()
    expect(screen.getByText('Orks')).toBeInTheDocument()
    expect(screen.getByText('Necrons')).toBeInTheDocument()
  })

  it('colors win rates above 55% in emerald', () => {
    render(<FactionTable stats={stats} />)
    const greenCell = screen.getByText('60.0%')
    expect(greenCell.className).toMatch(/emerald/)
  })

  it('colors win rates below 45% in red', () => {
    render(<FactionTable stats={stats} />)
    const redCell = screen.getByText('40.0%')
    expect(redCell.className).toMatch(/red/)
  })

  it('colors win rates between 45%–55% in slate (neutral)', () => {
    render(<FactionTable stats={stats} />)
    const neutralCell = screen.getByText('45.0%')
    expect(neutralCell.className).toMatch(/slate/)
  })

  it('calls onSelect with the factionId when a row is clicked', () => {
    const onSelect = vi.fn()
    render(<FactionTable stats={stats} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Space Marines'))
    expect(onSelect).toHaveBeenCalledWith('sm-1')
  })

  it('renders win counts', () => {
    render(<FactionTable stats={stats} />)
    expect(screen.getByText('26')).toBeInTheDocument() // Space Marines wins
  })

  it('renders meta share percentages', () => {
    render(<FactionTable stats={stats} />)
    // playerPopPct 0.2 = 20.0%
    expect(screen.getByText('20.0%')).toBeInTheDocument()
  })
})
