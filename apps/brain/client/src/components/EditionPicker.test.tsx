import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EditionPicker } from './EditionPicker'

describe('EditionPicker', () => {
  it('renders all four edition options', () => {
    render(<EditionPicker value="11th" onChange={() => {}} />)
    expect(screen.getByTestId('edition-option-11th')).toBeInTheDocument()
    expect(screen.getByTestId('edition-option-10th')).toBeInTheDocument()
    expect(screen.getByTestId('edition-option-9th')).toBeInTheDocument()
    expect(screen.getByTestId('edition-option-any')).toBeInTheDocument()
  })

  it('marks the active option with aria-pressed', () => {
    render(<EditionPicker value="10th" onChange={() => {}} />)
    expect(screen.getByTestId('edition-option-10th')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('edition-option-11th')).toHaveAttribute('aria-pressed', 'false')
  })

  it('fires onChange when an option is clicked', () => {
    const onChange = vi.fn()
    render(<EditionPicker value="11th" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('edition-option-10th'))
    expect(onChange).toHaveBeenCalledWith('10th')
  })

  it('does not fire onChange when the current value is re-clicked (still calls but with same value)', () => {
    // We don't deduplicate — the parent owns identity. This documents that.
    const onChange = vi.fn()
    render(<EditionPicker value="11th" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('edition-option-11th'))
    expect(onChange).toHaveBeenCalledWith('11th')
  })

  it('exposes a labelled group for accessibility', () => {
    render(<EditionPicker value="any" onChange={() => {}} />)
    expect(screen.getByRole('group', { name: /rules edition/i })).toBeInTheDocument()
  })
})
