import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { RollEntry } from './RollEntry'

describe('RollEntry', () => {
  it('renders 6 pip buttons', () => {
    render(<RollEntry onRecord={vi.fn()} />)
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument()
    }
  })

  it('shows hint text when no values entered', () => {
    render(<RollEntry onRecord={vi.fn()} />)
    expect(screen.getByText('Tap each die value above')).toBeInTheDocument()
  })

  it('clicking a pip hides hint text and adds a value badge', () => {
    render(<RollEntry onRecord={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(screen.queryByText('Tap each die value above')).not.toBeInTheDocument()
    // Button "3" + badge "3" = 2 elements
    expect(screen.getAllByText('3')).toHaveLength(2)
  })

  it('clicking multiple pips builds up value badges', () => {
    render(<RollEntry onRecord={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    // Each pip has button + badge = 2 elements each
    expect(screen.getAllByText('2')).toHaveLength(2)
    expect(screen.getAllByText('5')).toHaveLength(2)
    expect(screen.getAllByText('1')).toHaveLength(2)
  })

  it('undo removes the last entered value', () => {
    render(<RollEntry onRecord={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    fireEvent.click(screen.getByRole('button', { name: '6' }))
    // 4 has button + badge, 6 has button + badge
    expect(screen.getAllByText('4')).toHaveLength(2)
    expect(screen.getAllByText('6')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    // 4 still has button + badge, 6 now only has button
    expect(screen.getAllByText('4')).toHaveLength(2)
    expect(screen.getAllByText('6')).toHaveLength(1)
  })

  it('Record Roll calls onRecord with entered values', () => {
    const onRecord = vi.fn()
    render(<RollEntry onRecord={onRecord} />)
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    fireEvent.click(screen.getByRole('button', { name: /record roll/i }))
    expect(onRecord).toHaveBeenCalledWith([3, 5])
  })

  it('Record Roll is disabled when no values entered', () => {
    render(<RollEntry onRecord={vi.fn()} />)
    expect(screen.getByRole('button', { name: /record roll/i })).toBeDisabled()
  })

  it('Undo is disabled when no values entered', () => {
    render(<RollEntry onRecord={vi.fn()} />)
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled()
  })
})
