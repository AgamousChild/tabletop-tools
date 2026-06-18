import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ActionScorer } from './ActionScorer'

describe('ActionScorer', () => {
  it('shows action label and toggle button', () => {
    render(<ActionScorer label="Action completed" completed={false} onChange={() => {}} />)
    expect(screen.getByText('Action completed')).toBeTruthy()
    expect(screen.getByRole('button', { name: /mark complete/i })).toBeTruthy()
  })

  it('shows completed state', () => {
    render(<ActionScorer label="Action completed" completed={true} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /mark incomplete/i })).toBeTruthy()
  })

  it('calls onChange on toggle', () => {
    const onChange = vi.fn()
    render(<ActionScorer label="Action completed" completed={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /mark complete/i }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
