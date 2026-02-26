import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BattleSizeScreen } from './BattleSizeScreen'

describe('BattleSizeScreen', () => {
  it('shows title', () => {
    render(<BattleSizeScreen onSelect={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Select Battle Size')).toBeInTheDocument()
  })

  it('shows all battle size options', () => {
    render(<BattleSizeScreen onSelect={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('500pts')).toBeInTheDocument()
    expect(screen.getByText('1000pts')).toBeInTheDocument()
    expect(screen.getByText('2000pts')).toBeInTheDocument()
    expect(screen.getByText('3000pts')).toBeInTheDocument()
  })

  it('calls onSelect with the chosen battle size', () => {
    const onSelect = vi.fn()
    render(<BattleSizeScreen onSelect={onSelect} onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('2000pts'))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ points: 2000, maxDuplicates: 3 }),
    )
  })

  it('calls onBack when back is clicked', () => {
    const onBack = vi.fn()
    render(<BattleSizeScreen onSelect={vi.fn()} onBack={onBack} />)
    fireEvent.click(screen.getByText('Back'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows description for each size', () => {
    render(<BattleSizeScreen onSelect={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Small-scale skirmish')).toBeInTheDocument()
    expect(screen.getByText('Tournament standard')).toBeInTheDocument()
  })
})
