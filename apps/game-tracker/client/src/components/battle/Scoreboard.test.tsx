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
})
