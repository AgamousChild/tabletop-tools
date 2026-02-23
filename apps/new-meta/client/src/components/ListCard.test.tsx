import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ListCard } from './ListCard'

const baseList = {
  eventName: 'London GT 2025',
  eventDate: '2025-03-15',
  placement: 4,
  faction: 'Space Marines',
  wins: 5,
  losses: 1,
  draws: 0,
  points: 2100,
}

describe('ListCard', () => {
  it('shows the faction name', () => {
    render(<ListCard list={baseList} />)
    expect(screen.getByText('Space Marines')).toBeInTheDocument()
  })

  it('shows the placement', () => {
    render(<ListCard list={baseList} />)
    expect(screen.getByText('#4')).toBeInTheDocument()
  })

  it('shows the event name', () => {
    render(<ListCard list={baseList} />)
    expect(screen.getByText(/London GT 2025/)).toBeInTheDocument()
  })

  it('shows wins and losses', () => {
    render(<ListCard list={baseList} />)
    expect(screen.getByText('5W 1L')).toBeInTheDocument()
  })

  it('omits draws from record when draws = 0', () => {
    render(<ListCard list={baseList} />)
    expect(screen.queryByText(/D/)).toBeNull()
  })

  it('includes draws in record when draws > 0', () => {
    render(<ListCard list={{ ...baseList, draws: 2 }} />)
    expect(screen.getByText('5W 1L 2D')).toBeInTheDocument()
  })

  it('shows points', () => {
    render(<ListCard list={baseList} />)
    expect(screen.getByText('2100pts')).toBeInTheDocument()
  })

  it('shows detachment when provided', () => {
    render(<ListCard list={{ ...baseList, detachment: 'Gladius Task Force' }} />)
    expect(screen.getByText(/Gladius Task Force/)).toBeInTheDocument()
  })

  it('shows "View list" when listText is provided', () => {
    render(<ListCard list={{ ...baseList, listText: '+ HQ: Captain\n+ Troops: Intercessors' }} />)
    expect(screen.getByText(/view list/i)).toBeInTheDocument()
  })

  it('shows "No list submitted" when listText is absent', () => {
    render(<ListCard list={baseList} />)
    expect(screen.getByText(/no list submitted/i)).toBeInTheDocument()
  })
})
