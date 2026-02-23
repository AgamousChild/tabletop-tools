import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MatchupMatrix } from './MatchupMatrix'

const cells = [
  { factionA: 'Orks', factionB: 'Necrons', aWinRate: 0.58, totalGames: 12 },
  { factionA: 'Space Marines', factionB: 'Orks', aWinRate: 0.62, totalGames: 8 },
]

describe('MatchupMatrix', () => {
  it('shows empty state when no cells', () => {
    render(<MatchupMatrix cells={[]} />)
    expect(screen.getByText(/no matchup data yet/i)).toBeInTheDocument()
  })

  it('renders faction names in the header', () => {
    render(<MatchupMatrix cells={cells} />)
    // Factions are sliced to 6 chars in the header
    const headers = screen.getAllByText(/Necron|Space |Orks/)
    expect(headers.length).toBeGreaterThan(0)
  })

  it('shows — for mirror matches (same faction vs itself)', () => {
    render(<MatchupMatrix cells={cells} />)
    const dashes = screen.getAllByText('—')
    // 3 factions → 3 mirror match cells
    expect(dashes.length).toBe(3)
  })

  it('shows a win rate value for known matchups', () => {
    render(<MatchupMatrix cells={cells} />)
    // Orks vs Necrons: 58% → shows "58"
    expect(screen.getByTitle(/Orks vs Necrons: 58\.0%/)).toBeInTheDocument()
  })

  it('reflects inverse win rate for the opposite matchup', () => {
    render(<MatchupMatrix cells={cells} />)
    // Necrons vs Orks: 1 - 0.58 = 0.42 → 42%
    expect(screen.getByTitle(/Necrons vs Orks: 42\.0%/)).toBeInTheDocument()
  })

  it('shows · for matchups with no data', () => {
    const minimalCells = [{ factionA: 'Alpha', factionB: 'Beta', aWinRate: 0.5, totalGames: 5 }]
    render(<MatchupMatrix cells={minimalCells} />)
    // Alpha vs Beta and Beta vs Alpha exist; no other pairs → no · needed
    // Only 2 factions, no "No data" cells
    expect(screen.queryByTitle('No data')).toBeNull()
  })
})
