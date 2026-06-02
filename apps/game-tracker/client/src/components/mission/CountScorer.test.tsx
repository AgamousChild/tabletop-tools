import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CountScorer } from './CountScorer'

describe('CountScorer', () => {
  it('renders a stepper showing current count', () => {
    render(
      <CountScorer label="Objectives controlled" value={2} min={0} max={10} onChange={() => {}} />,
    )
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('Objectives controlled')).toBeTruthy()
  })

  it('increments on + click', () => {
    const onChange = vi.fn()
    render(<CountScorer label="Units" value={3} min={0} max={10} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /increment/i }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('decrements on - click', () => {
    const onChange = vi.fn()
    render(<CountScorer label="Units" value={3} min={0} max={10} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /decrement/i }))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('does not go below min', () => {
    const onChange = vi.fn()
    render(<CountScorer label="Units" value={0} min={0} max={10} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /decrement/i }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not exceed max', () => {
    const onChange = vi.fn()
    render(<CountScorer label="Units" value={10} min={0} max={10} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /increment/i }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
