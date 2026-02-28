import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StratagemPicker } from './StratagemPicker'

const mockStratagems = [
  { id: 's1', name: 'Overwatch', type: 'Strategic Ploy', cpCost: '1', turn: '', phase: 'Any', legend: '', description: '', factionId: 'SM', detachmentId: 'd1' },
  { id: 's2', name: 'Insane Bravery', type: 'Epic Deed', cpCost: '2', turn: '', phase: 'Morale', legend: '', description: '', factionId: 'SM', detachmentId: 'd1' },
]

describe('StratagemPicker', () => {
  it('shows label', () => {
    render(<StratagemPicker stratagems={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Stratagems')).toBeInTheDocument()
  })

  it('shows empty dropdown when no available data', () => {
    render(<StratagemPicker stratagems={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByLabelText('Select stratagem')).toBeInTheDocument()
    // Only the placeholder option
    const options = screen.getByLabelText('Select stratagem').querySelectorAll('option')
    expect(options).toHaveLength(1)
    expect(options[0]!.textContent).toBe('Select stratagem...')
  })

  it('shows dropdown with options when available stratagems provided', () => {
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
})
