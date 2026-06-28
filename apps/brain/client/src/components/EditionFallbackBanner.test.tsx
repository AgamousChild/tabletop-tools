import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EditionFallbackBanner } from './EditionFallbackBanner'

describe('EditionFallbackBanner', () => {
  it('shows the requested edition in the message', () => {
    render(<EditionFallbackBanner fallbackFrom="11th" />)
    expect(screen.getByTestId('edition-fallback-banner')).toBeInTheDocument()
    expect(screen.getByText(/No 11th edition results\. Showing all editions\./)).toBeInTheDocument()
  })

  it('renders without a dismiss button when onDismiss is omitted', () => {
    render(<EditionFallbackBanner fallbackFrom="11th" />)
    expect(screen.queryByLabelText(/dismiss/i)).not.toBeInTheDocument()
  })

  it('calls onDismiss when the close button is clicked', () => {
    const onDismiss = vi.fn()
    render(<EditionFallbackBanner fallbackFrom="11th" onDismiss={onDismiss} />)
    fireEvent.click(screen.getByLabelText(/dismiss/i))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
