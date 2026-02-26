import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StratagemPicker } from './StratagemPicker'

describe('StratagemPicker', () => {
  it('shows label', () => {
    render(<StratagemPicker stratagems={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Stratagems')).toBeInTheDocument()
  })

  it('shows + Add Stratagem button', () => {
    render(<StratagemPicker stratagems={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('+ Add Stratagem')).toBeInTheDocument()
  })

  it('shows input fields when + Add clicked', () => {
    render(<StratagemPicker stratagems={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByText('+ Add Stratagem'))
    expect(screen.getByLabelText('Stratagem name')).toBeInTheDocument()
    expect(screen.getByLabelText('CP cost')).toBeInTheDocument()
  })

  it('calls onAdd with stratagem data', () => {
    const onAdd = vi.fn()
    render(<StratagemPicker stratagems={[]} onAdd={onAdd} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByText('+ Add Stratagem'))
    fireEvent.change(screen.getByLabelText('Stratagem name'), { target: { value: 'Overwatch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
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
