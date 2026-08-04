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
    render(<ListCard list={baseList} layout="roster" />)
    expect(screen.getByText('Space Marines')).toBeInTheDocument()
  })

  it('shows the placement', () => {
    render(<ListCard list={baseList} layout="roster" />)
    expect(screen.getByText('#4')).toBeInTheDocument()
  })

  it('shows the event name', () => {
    render(<ListCard list={baseList} layout="roster" />)
    expect(screen.getByText(/London GT 2025/)).toBeInTheDocument()
  })

  it('shows wins and losses', () => {
    render(<ListCard list={baseList} layout="roster" />)
    expect(screen.getByText('5W 1L')).toBeInTheDocument()
  })

  it('omits draws from record when draws = 0', () => {
    render(<ListCard list={baseList} layout="roster" />)
    // Record should be exactly "5W 1L" with no draws suffix
    expect(screen.getByText('5W 1L')).toBeInTheDocument()
  })

  it('includes draws in record when draws > 0', () => {
    render(<ListCard list={{ ...baseList, draws: 2 }} />)
    expect(screen.getByText('5W 1L 2D')).toBeInTheDocument()
  })

  it('shows points', () => {
    render(<ListCard list={baseList} layout="roster" />)
    expect(screen.getByText('2100pts')).toBeInTheDocument()
  })

  it('shows detachment when provided', () => {
    render(<ListCard list={{ ...baseList, detachment: 'Gladius Task Force' }} layout="roster" />)
    expect(screen.getByText(/Gladius Task Force/)).toBeInTheDocument()
  })

  it('offers the raw text when there is no parse, labelled as unparsed', () => {
    render(
      <ListCard
        list={{ ...baseList, listText: '+ HQ: Captain\n+ Troops: Intercessors' }}
        layout="roster"
      />,
    )
    // Deliberately distinct from the parsed "View list" affordance: 6,504 of
    // 36,223 stored lists have no usable parse, and presenting an unreadable
    // run-on blob under the same label reads as a rendering bug.
    expect(screen.getByText(/view raw list \(unparsed\)/i)).toBeInTheDocument()
  })

  it('shows "No list submitted" when listText is absent', () => {
    render(<ListCard list={baseList} layout="roster" />)
    expect(screen.getByText(/no list submitted/i)).toBeInTheDocument()
  })

  it('renders the parsed army instead of the raw text when a parse exists', () => {
    render(
      <ListCard
        list={{
          ...baseList,
          listText: 'Captain(80 Points)  • 1x Bolter',
          listTtt: {
            parseStatus: 'ok',
            meta: { name: 'Test', totalPoints: 2000, battleSize: 'Strike Force' },
            list: {
              factionName: 'Space Marines',
              units: [
                {
                  name: 'Captain',
                  role: 'Character',
                  models: 1,
                  points: 80,
                  wargear: ['Bolter'],
                  isWarlord: true,
                },
              ],
            },
          },
        }}
        layout="roster"
      />,
    )
    expect(screen.getByText('Characters')).toBeInTheDocument()
    expect(screen.getByText('Captain')).toBeInTheDocument()
    expect(screen.getByText('WARLORD')).toBeInTheDocument()
    expect(screen.queryByText(/view raw list/i)).not.toBeInTheDocument()
  })

  it('prefers the parsed total over the caller-supplied points', () => {
    render(
      <ListCard
        list={{
          ...baseList,
          points: 0,
          listTtt: {
            parseStatus: 'ok',
            meta: { name: 'Test', totalPoints: 1995, battleSize: 'Strike Force' },
            list: { factionName: 'Space Marines', units: [] },
          },
        }}
        layout="roster"
      />,
    )
    // Every card used to read "0pts" because the page hardcoded points: 0.
    expect(screen.getByText('1995pts')).toBeInTheDocument()
  })
})
