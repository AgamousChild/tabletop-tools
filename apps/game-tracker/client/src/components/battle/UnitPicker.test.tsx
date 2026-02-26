import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UnitPicker } from './UnitPicker'

describe('UnitPicker', () => {
  it('shows label', () => {
    render(<UnitPicker units={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Units Destroyed')).toBeInTheDocument()
  })

  it('shows + Add Unit button', () => {
    render(<UnitPicker units={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('+ Add Unit')).toBeInTheDocument()
  })

  it('shows input when + Add Unit clicked', () => {
    render(<UnitPicker units={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByText('+ Add Unit'))
    expect(screen.getByLabelText('Unit name')).toBeInTheDocument()
  })

  it('calls onAdd with unit data', () => {
    const onAdd = vi.fn()
    render(<UnitPicker units={[]} onAdd={onAdd} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByText('+ Add Unit'))
    fireEvent.change(screen.getByLabelText('Unit name'), { target: { value: 'Intercessors' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith({ contentId: 'intercessors', name: 'Intercessors' })
  })

  it('shows existing units', () => {
    render(
      <UnitPicker
        units={[{ contentId: 'boyz', name: 'Boyz' }]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText('Boyz')).toBeInTheDocument()
  })

  it('calls onRemove when X clicked', () => {
    const onRemove = vi.fn()
    render(
      <UnitPicker
        units={[{ contentId: 'boyz', name: 'Boyz' }]}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />,
    )
    fireEvent.click(screen.getByLabelText('Remove Boyz'))
    expect(onRemove).toHaveBeenCalledWith(0)
  })

  it('accepts custom label', () => {
    render(<UnitPicker units={[]} onAdd={vi.fn()} onRemove={vi.fn()} label="Their Units Killed" />)
    expect(screen.getByText('Their Units Killed')).toBeInTheDocument()
  })
})
