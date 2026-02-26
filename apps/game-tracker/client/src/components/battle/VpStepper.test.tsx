import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { VpStepper } from './VpStepper'

describe('VpStepper', () => {
  it('renders label and value', () => {
    render(<VpStepper label="Primary VP" value={5} onChange={vi.fn()} />)
    expect(screen.getByText('Primary VP')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('increments value on + click', () => {
    const onChange = vi.fn()
    render(<VpStepper label="VP" value={3} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Increase VP'))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('decrements value on - click', () => {
    const onChange = vi.fn()
    render(<VpStepper label="VP" value={3} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Decrease VP'))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('does not go below min', () => {
    const onChange = vi.fn()
    render(<VpStepper label="VP" value={0} onChange={onChange} />)
    expect(screen.getByLabelText('Decrease VP')).toBeDisabled()
  })

  it('does not go above max', () => {
    const onChange = vi.fn()
    render(<VpStepper label="VP" value={20} onChange={onChange} />)
    expect(screen.getByLabelText('Increase VP')).toBeDisabled()
  })

  it('respects custom min/max', () => {
    const onChange = vi.fn()
    render(<VpStepper label="VP" value={5} onChange={onChange} min={5} max={10} />)
    expect(screen.getByLabelText('Decrease VP')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Increase VP'))
    expect(onChange).toHaveBeenCalledWith(6)
  })
})
