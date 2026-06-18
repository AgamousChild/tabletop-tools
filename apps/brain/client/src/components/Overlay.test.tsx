import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Overlay } from './Overlay'

describe('Overlay', () => {
  it('renders children when open', () => {
    render(
      <Overlay open onDismiss={() => {}}>
        <div>Card content</div>
      </Overlay>,
    )
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(
      <Overlay open={false} onDismiss={() => {}}>
        <div>Card content</div>
      </Overlay>,
    )
    expect(screen.queryByText('Card content')).not.toBeInTheDocument()
  })

  it('calls onDismiss when backdrop clicked', () => {
    const onDismiss = vi.fn()
    render(
      <Overlay open onDismiss={onDismiss}>
        <div>Content</div>
      </Overlay>,
    )
    fireEvent.click(screen.getByTestId('overlay-backdrop'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('does not dismiss when card content clicked', () => {
    const onDismiss = vi.fn()
    render(
      <Overlay open onDismiss={onDismiss}>
        <div>Content</div>
      </Overlay>,
    )
    fireEvent.click(screen.getByText('Content'))
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
