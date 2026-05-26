import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FactionBanner } from './FactionBanner'

describe('FactionBanner', () => {
  it('shows detected faction', () => {
    render(<FactionBanner factions={['space-marines']} onDismiss={() => {}} />)
    expect(screen.getByText(/SPACE MARINES/)).toBeInTheDocument()
  })

  it('shows subfaction when present', () => {
    render(
      <FactionBanner factions={['space-marines']} subfaction="ultramarines" onDismiss={() => {}} />,
    )
    expect(screen.getByText(/ULTRAMARINES/)).toBeInTheDocument()
  })

  it('calls onDismiss when "Show all" clicked', () => {
    const onDismiss = vi.fn()
    render(<FactionBanner factions={['space-marines']} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText(/Show all results/))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('renders nothing when no factions', () => {
    const { container } = render(<FactionBanner factions={[]} onDismiss={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('joins multiple factions with comma', () => {
    render(<FactionBanner factions={['space-marines', 'necrons']} onDismiss={() => {}} />)
    expect(screen.getByText(/SPACE MARINES, NECRONS/)).toBeInTheDocument()
  })

  it('prefers subfaction over faction list in display', () => {
    render(
      <FactionBanner factions={['space-marines']} subfaction="iron hands" onDismiss={() => {}} />,
    )
    expect(screen.getByText(/IRON HANDS/)).toBeInTheDocument()
    expect(screen.queryByText(/SPACE MARINES/)).not.toBeInTheDocument()
  })
})
