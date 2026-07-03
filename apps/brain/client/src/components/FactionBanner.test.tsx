import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FactionBanner } from './FactionBanner'

describe('FactionBanner', () => {
  it('shows detected faction', () => {
    render(<FactionBanner factions={['space-marines']} onDismiss={() => {}} />)
    expect(screen.getByText(/SPACE MARINES/)).toBeInTheDocument()
  })

  it('shows chapter faction slug when present in factions list', () => {
    // Post-PR-D chapters are their own faction slugs (see faction-detect.ts).
    render(<FactionBanner factions={['blood-angels']} onDismiss={() => {}} />)
    expect(screen.getByText(/BLOOD ANGELS/)).toBeInTheDocument()
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

  it('renders each detected faction slug as a display name', () => {
    // Chapter slug lands in `factions` alongside its parent (see
    // faction-detect.ts). The banner surfaces both.
    render(<FactionBanner factions={['iron-hands', 'space-marines']} onDismiss={() => {}} />)
    expect(screen.getByText(/IRON HANDS, SPACE MARINES/)).toBeInTheDocument()
  })
})
