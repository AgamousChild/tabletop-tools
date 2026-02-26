import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SecondaryPicker } from './SecondaryPicker'

describe('SecondaryPicker', () => {
  it('shows label', () => {
    render(
      <SecondaryPicker secondaries={[]} onAdd={vi.fn()} onRemove={vi.fn()} onScore={vi.fn()} currentRound={1} />,
    )
    expect(screen.getByText('Secondaries')).toBeInTheDocument()
  })

  it('shows + Add Secondary button', () => {
    render(
      <SecondaryPicker secondaries={[]} onAdd={vi.fn()} onRemove={vi.fn()} onScore={vi.fn()} currentRound={1} />,
    )
    expect(screen.getByText('+ Add Secondary')).toBeInTheDocument()
  })

  it('shows input when + Add clicked', () => {
    render(
      <SecondaryPicker secondaries={[]} onAdd={vi.fn()} onRemove={vi.fn()} onScore={vi.fn()} currentRound={1} />,
    )
    fireEvent.click(screen.getByText('+ Add Secondary'))
    expect(screen.getByLabelText('Secondary name')).toBeInTheDocument()
  })

  it('calls onAdd with name', () => {
    const onAdd = vi.fn()
    render(
      <SecondaryPicker secondaries={[]} onAdd={onAdd} onRemove={vi.fn()} onScore={vi.fn()} currentRound={1} />,
    )
    fireEvent.click(screen.getByText('+ Add Secondary'))
    fireEvent.change(screen.getByLabelText('Secondary name'), { target: { value: 'Assassination' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith('Assassination')
  })

  it('shows existing secondaries with total VP', () => {
    render(
      <SecondaryPicker
        secondaries={[{ id: 's1', secondaryName: 'Assassination', vpPerRound: [2, 4, 0, 0, 0] }]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onScore={vi.fn()}
        currentRound={1}
      />,
    )
    expect(screen.getByText('Assassination')).toBeInTheDocument()
    expect(screen.getByText('6 VP')).toBeInTheDocument()
  })

  it('shows current round VP with stepper', () => {
    render(
      <SecondaryPicker
        secondaries={[{ id: 's1', secondaryName: 'Assassination', vpPerRound: [3, 0, 0, 0, 0] }]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onScore={vi.fn()}
        currentRound={1}
      />,
    )
    expect(screen.getByText('R1:')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('calls onScore when +/- clicked', () => {
    const onScore = vi.fn()
    render(
      <SecondaryPicker
        secondaries={[{ id: 's1', secondaryName: 'Assassination', vpPerRound: [2, 0, 0, 0, 0] }]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onScore={onScore}
        currentRound={1}
      />,
    )
    fireEvent.click(screen.getByLabelText('Increase Assassination VP'))
    expect(onScore).toHaveBeenCalledWith('s1', 1, 3)
  })

  it('calls onRemove when X clicked', () => {
    const onRemove = vi.fn()
    render(
      <SecondaryPicker
        secondaries={[{ id: 's1', secondaryName: 'Assassination', vpPerRound: [0, 0, 0, 0, 0] }]}
        onAdd={vi.fn()}
        onRemove={onRemove}
        onScore={vi.fn()}
        currentRound={1}
      />,
    )
    fireEvent.click(screen.getByLabelText('Remove Assassination'))
    expect(onRemove).toHaveBeenCalledWith('s1')
  })
})
