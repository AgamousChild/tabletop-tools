import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SecondaryPicker } from './SecondaryPicker'

const mockSecondaries = [
  { id: 'sec1', name: 'Assassination' },
  { id: 'sec2', name: 'Behind Enemy Lines' },
]

describe('SecondaryPicker', () => {
  it('shows label', () => {
    render(
      <SecondaryPicker secondaries={[]} onAdd={vi.fn()} onRemove={vi.fn()} onScore={vi.fn()} currentRound={1} />,
    )
    expect(screen.getByText('Secondaries')).toBeInTheDocument()
  })

  it('shows empty dropdown when no available data', () => {
    render(
      <SecondaryPicker secondaries={[]} onAdd={vi.fn()} onRemove={vi.fn()} onScore={vi.fn()} currentRound={1} />,
    )
    expect(screen.getByLabelText('Select secondary')).toBeInTheDocument()
    const options = screen.getByLabelText('Select secondary').querySelectorAll('option')
    expect(options).toHaveLength(1)
    expect(options[0]!.textContent).toBe('Select secondary...')
  })

  it('shows dropdown with options when available secondaries provided', () => {
    render(
      <SecondaryPicker
        secondaries={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onScore={vi.fn()}
        currentRound={1}
        availableSecondaries={mockSecondaries}
      />,
    )
    expect(screen.getByLabelText('Select secondary')).toBeInTheDocument()
    expect(screen.getByText('Assassination')).toBeInTheDocument()
  })

  it('calls onAdd when secondary selected from dropdown', () => {
    const onAdd = vi.fn()
    render(
      <SecondaryPicker
        secondaries={[]}
        onAdd={onAdd}
        onRemove={vi.fn()}
        onScore={vi.fn()}
        currentRound={1}
        availableSecondaries={mockSecondaries}
      />,
    )
    fireEvent.change(screen.getByLabelText('Select secondary'), { target: { value: 'Assassination' } })
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
