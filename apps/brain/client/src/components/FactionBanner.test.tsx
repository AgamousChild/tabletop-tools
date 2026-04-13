import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FactionBanner } from './FactionBanner'

describe('FactionBanner', () => {
  it('shows detected faction', () => {
    render(<FactionBanner factions={['Space Marines']} onDismiss={() => {}} />)
    expect(screen.getByText(/Space Marines/)).toBeInTheDocument()
  })

  it('shows subfaction when present', () => {
    render(<FactionBanner factions={['Space Marines']} subfaction="Ultramarines" onDismiss={() => {}} />)
    expect(screen.getByText(/Ultramarines/)).toBeInTheDocument()
  })

  it('calls onDismiss when "Show all" clicked', () => {
    const onDismiss = vi.fn()
    render(<FactionBanner factions={['Space Marines']} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText(/Show all results/))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('renders nothing when no factions', () => {
    const { container } = render(<FactionBanner factions={[]} onDismiss={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('joins multiple factions with comma', () => {
    render(<FactionBanner factions={['Space Marines', 'Necrons']} onDismiss={() => {}} />)
    expect(screen.getByText(/Space Marines, Necrons/)).toBeInTheDocument()
  })

  it('prefers subfaction over faction list in display', () => {
    render(<FactionBanner factions={['Space Marines']} subfaction="Iron Hands" onDismiss={() => {}} />)
    expect(screen.getByText(/Iron Hands/)).toBeInTheDocument()
    expect(screen.queryByText(/Space Marines/)).not.toBeInTheDocument()
  })
})
