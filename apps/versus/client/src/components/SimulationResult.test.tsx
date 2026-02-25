import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SimulationResult } from './SimulationResult'

const baseResult = {
  expectedWounds: 2.5,
  expectedModelsRemoved: 1.2,
  survivors: 3.8,
  worstCase: { wounds: 0, modelsRemoved: 0 },
  bestCase: { wounds: 8, modelsRemoved: 4 },
}

describe('SimulationResult', () => {
  it('shows the attacker and defender names', () => {
    render(
      <SimulationResult
        attackerName="Brutalis Dreadnought"
        defenderName="Terminators"
        result={baseResult}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByText('Brutalis Dreadnought')).toBeInTheDocument()
    expect(screen.getByText('Terminators')).toBeInTheDocument()
  })

  it('shows expected wounds', () => {
    render(
      <SimulationResult
        attackerName="A"
        defenderName="D"
        result={baseResult}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByText('2.50')).toBeInTheDocument()
  })

  it('shows expected models removed', () => {
    render(
      <SimulationResult
        attackerName="A"
        defenderName="D"
        result={baseResult}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByText('1.20')).toBeInTheDocument()
  })

  it('shows best and worst case', () => {
    render(
      <SimulationResult
        attackerName="A"
        defenderName="D"
        result={baseResult}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByText(/best case/i)).toBeInTheDocument()
    expect(screen.getByText(/worst case/i)).toBeInTheDocument()
  })

  it('shows a save button', () => {
    render(
      <SimulationResult
        attackerName="A"
        defenderName="D"
        result={baseResult}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('calls onSave when save button is clicked', () => {
    const onSave = vi.fn()
    render(
      <SimulationResult
        attackerName="A"
        defenderName="D"
        result={baseResult}
        onSave={onSave}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('renders survivors count correctly', () => {
    render(
      <SimulationResult
        attackerName="A"
        defenderName="D"
        result={baseResult}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByText('3.80')).toBeInTheDocument()
  })
})
