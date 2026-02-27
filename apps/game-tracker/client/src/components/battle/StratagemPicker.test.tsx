import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StratagemPicker } from './StratagemPicker'

const mockStratagems = [
  { id: 's1', name: 'Overwatch', type: 'Strategic Ploy', cpCost: '1', turn: '', phase: 'Any', legend: '', description: '' },
  { id: 's2', name: 'Insane Bravery', type: 'Epic Deed', cpCost: '2', turn: '', phase: 'Morale', legend: '', description: '' },
]

describe('StratagemPicker', () => {
  it('shows label', () => {
    render(<StratagemPicker stratagems={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Stratagems')).toBeInTheDocument()
  })

  it('shows + Add Stratagem button when no available data', () => {
    render(<StratagemPicker stratagems={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('+ Add Stratagem')).toBeInTheDocument()
  })

  it('shows text input when + Add clicked (no data mode)', () => {
    render(<StratagemPicker stratagems={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByText('+ Add Stratagem'))
    expect(screen.getByLabelText('Stratagem name')).toBeInTheDocument()
    expect(screen.getByLabelText('CP cost')).toBeInTheDocument()
  })

  it('calls onAdd with stratagem data from text input', () => {
    const onAdd = vi.fn()
    render(<StratagemPicker stratagems={[]} onAdd={onAdd} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByText('+ Add Stratagem'))
    fireEvent.change(screen.getByLabelText('Stratagem name'), { target: { value: 'Overwatch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith({ stratagemName: 'Overwatch', cpCost: 1 })
  })

  it('shows dropdown when available stratagems provided', () => {
    render(
      <StratagemPicker stratagems={[]} onAdd={vi.fn()} onRemove={vi.fn()} availableStratagems={mockStratagems} />,
    )
    expect(screen.getByLabelText('Select stratagem')).toBeInTheDocument()
    expect(screen.getByText('Overwatch (1 CP · Any)')).toBeInTheDocument()
  })

  it('calls onAdd when stratagem selected from dropdown', () => {
    const onAdd = vi.fn()
    render(
      <StratagemPicker stratagems={[]} onAdd={onAdd} onRemove={vi.fn()} availableStratagems={mockStratagems} />,
    )
    fireEvent.change(screen.getByLabelText('Select stratagem'), { target: { value: 's1' } })
    expect(onAdd).toHaveBeenCalledWith({ stratagemName: 'Overwatch', cpCost: 1 })
  })

  it('shows existing stratagems', () => {
    render(
      <StratagemPicker
        stratagems={[{ stratagemName: 'Overwatch', cpCost: 1 }]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText('Overwatch')).toBeInTheDocument()
    expect(screen.getByText('1 CP')).toBeInTheDocument()
  })

  it('calls onRemove when X clicked', () => {
    const onRemove = vi.fn()
    render(
      <StratagemPicker
        stratagems={[{ stratagemName: 'Overwatch', cpCost: 1 }]}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />,
    )
    fireEvent.click(screen.getByLabelText('Remove Overwatch'))
    expect(onRemove).toHaveBeenCalledWith(0)
  })

  it('disables Add button when name is empty', () => {
    render(<StratagemPicker stratagems={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByText('+ Add Stratagem'))
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })
})
