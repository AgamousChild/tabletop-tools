import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Scoreboard } from './Scoreboard'

describe('Scoreboard', () => {
  it('shows round number', () => {
    render(<Scoreboard roundNumber={3} yourVp={20} theirVp={15} yourCp={4} theirCp={3} opponentName="Orks" />)
    expect(screen.getByText('Round 3 of 5')).toBeInTheDocument()
  })

  it('shows VP for both players', () => {
    render(<Scoreboard roundNumber={1} yourVp={20} theirVp={15} yourCp={4} theirCp={3} opponentName="Orks" />)
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('shows CP for both players', () => {
    render(<Scoreboard roundNumber={1} yourVp={0} theirVp={0} yourCp={4} theirCp={3} opponentName="Orks" />)
    expect(screen.getByText('4 CP')).toBeInTheDocument()
    expect(screen.getByText('3 CP')).toBeInTheDocument()
  })

  it('shows opponent name', () => {
    render(<Scoreboard roundNumber={1} yourVp={0} theirVp={0} yourCp={0} theirCp={0} opponentName="Bob" />)
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows "You" label and "vs" separator', () => {
    render(<Scoreboard roundNumber={1} yourVp={0} theirVp={0} yourCp={0} theirCp={0} opponentName="Orks" />)
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('vs')).toBeInTheDocument()
  })

  it('highlights your VP differently from opponent VP', () => {
    const { container } = render(
      <Scoreboard roundNumber={2} yourVp={30} theirVp={25} yourCp={2} theirCp={1} opponentName="Orks" />,
    )
    // Your VP should be amber (highlighted), theirs slate (neutral)
    const yourVp = screen.getByText('30')
    const theirVp = screen.getByText('25')
    expect(yourVp.className).toContain('amber')
    expect(theirVp.className).not.toContain('amber')
  })

  it('shows correct round format', () => {
    render(<Scoreboard roundNumber={5} yourVp={45} theirVp={40} yourCp={0} theirCp={0} opponentName="Tyranids" />)
    expect(screen.getByText('Round 5 of 5')).toBeInTheDocument()
  })
})
