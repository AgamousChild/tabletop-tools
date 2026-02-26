import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PregameScreen } from './PregameScreen'

describe('PregameScreen', () => {
  it('shows Pre-Game title', () => {
    render(
      <PregameScreen
        opponentFaction="Orks"
        mission="Take and Hold"
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByText('Pre-Game')).toBeInTheDocument()
  })

  it('shows match info banner', () => {
    render(
      <PregameScreen
        opponentFaction="Orks"
        mission="Take and Hold"
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByText('vs Orks')).toBeInTheDocument()
    expect(screen.getByText('Take and Hold')).toBeInTheDocument()
  })

  it('shows attacker/defender buttons', () => {
    render(
      <PregameScreen
        opponentFaction="Orks"
        mission="Take and Hold"
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByText('You Attack')).toBeInTheDocument()
    expect(screen.getByText('You Defend')).toBeInTheDocument()
  })

  it('shows who goes first buttons', () => {
    render(
      <PregameScreen
        opponentFaction="Orks"
        mission="Take and Hold"
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'You' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opponent' })).toBeInTheDocument()
  })

  it('Start Battle disabled until both selections made', () => {
    render(
      <PregameScreen
        opponentFaction="Orks"
        mission="Take and Hold"
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /start battle/i })).toBeDisabled()
  })

  it('calls onStart with selections when Start Battle clicked', () => {
    const onStart = vi.fn()
    render(
      <PregameScreen
        opponentFaction="Orks"
        mission="Take and Hold"
        onStart={onStart}
        onBack={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('You Attack'))
    fireEvent.click(screen.getByRole('button', { name: 'You' }))
    fireEvent.click(screen.getByRole('button', { name: /start battle/i }))

    expect(onStart).toHaveBeenCalledWith({
      attackerDefender: 'YOU_ATTACK',
      whoGoesFirst: 'YOU',
    })
  })

  it('calls onBack when back is clicked', () => {
    const onBack = vi.fn()
    render(
      <PregameScreen
        opponentFaction="Orks"
        mission="Take and Hold"
        onStart={vi.fn()}
        onBack={onBack}
      />,
    )
    fireEvent.click(screen.getByText('Back'))
    expect(onBack).toHaveBeenCalled()
  })
})
