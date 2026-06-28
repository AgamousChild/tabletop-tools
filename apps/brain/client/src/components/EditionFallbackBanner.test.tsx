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

  it('renders nothing when fallbackFrom is "any"', () => {
    const { container } = render(<EditionFallbackBanner fallbackFrom="any" />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('edition-fallback-banner')).not.toBeInTheDocument()
  })

  it('renders nothing when fallbackFrom is undefined', () => {
    const { container } = render(<EditionFallbackBanner fallbackFrom={undefined} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('edition-fallback-banner')).not.toBeInTheDocument()
  })

  it('renders for 10th and 9th editions', () => {
    const { unmount } = render(<EditionFallbackBanner fallbackFrom="10th" />)
    expect(screen.getByText(/No 10th edition results/)).toBeInTheDocument()
    unmount()
    render(<EditionFallbackBanner fallbackFrom="9th" />)
    expect(screen.getByText(/No 9th edition results/)).toBeInTheDocument()
  })
})
