import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FactionTable } from './FactionTable'

const stats = [
  {
    faction: 'Space Marines',
    games: 40,
    winRate: 0.6,
    players: 10,
    representationPct: 0.2,
    wins: 26,
    losses: 12,
    draws: 2,
  },
  {
    faction: 'Orks',
    games: 30,
    winRate: 0.45,
    players: 8,
    representationPct: 0.15,
    wins: 13,
    losses: 17,
    draws: 0,
  },
  {
    faction: 'Necrons',
    games: 20,
    winRate: 0.4,
    players: 5,
    representationPct: 0.1,
    wins: 8,
    losses: 12,
    draws: 0,
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

  it('calls onSelect with the faction when a row is clicked', () => {
    const onSelect = vi.fn()
    render(<FactionTable stats={stats} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Space Marines'))
    expect(onSelect).toHaveBeenCalledWith('Space Marines')
  })

  it('renders win counts', () => {
    render(<FactionTable stats={stats} />)
    expect(screen.getByText('26')).toBeInTheDocument() // Space Marines wins
  })

  it('renders representation percentages', () => {
    render(<FactionTable stats={stats} />)
    expect(screen.getByText('20.0%')).toBeInTheDocument() // Space Marines rep
  })
})
