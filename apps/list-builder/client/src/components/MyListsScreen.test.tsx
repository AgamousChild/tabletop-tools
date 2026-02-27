import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MyListsScreen } from './MyListsScreen'

vi.mock('@tabletop-tools/game-data-store', () => ({
  useLists: () => ({
    data: [
      { id: 'list-1', faction: 'Space Marines', name: 'My Crusade', totalPts: 1850, createdAt: 0, updatedAt: 0 },
      { id: 'list-2', faction: 'Orks', name: 'Speed Freeks', totalPts: 1000, createdAt: 0, updatedAt: 0 },
    ],
    refetch: vi.fn(),
  }),
}))

describe('MyListsScreen', () => {
  it('shows title', () => {
    render(<MyListsScreen onCreateNew={vi.fn()} onSelectList={vi.fn()} />)
    expect(screen.getByText('My Army Lists')).toBeInTheDocument()
  })

  it('shows existing lists', () => {
    render(<MyListsScreen onCreateNew={vi.fn()} onSelectList={vi.fn()} />)
    expect(screen.getByText('My Crusade')).toBeInTheDocument()
    expect(screen.getByText('Speed Freeks')).toBeInTheDocument()
  })

  it('shows list details', () => {
    render(<MyListsScreen onCreateNew={vi.fn()} onSelectList={vi.fn()} />)
    expect(screen.getByText('Space Marines')).toBeInTheDocument()
    expect(screen.getByText('1850pts')).toBeInTheDocument()
  })

  it('calls onSelectList when a list is clicked', () => {
    const onSelect = vi.fn()
    render(<MyListsScreen onCreateNew={vi.fn()} onSelectList={onSelect} />)
    fireEvent.click(screen.getByText('My Crusade'))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'list-1', name: 'My Crusade' }),
    )
  })

  it('calls onCreateNew when new list button is clicked', () => {
    const onCreate = vi.fn()
    render(<MyListsScreen onCreateNew={onCreate} onSelectList={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /new list/i }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('shows Use in Tournament button on each list', () => {
    render(<MyListsScreen onCreateNew={vi.fn()} onSelectList={vi.fn()} />)
    const buttons = screen.getAllByText('Use in Tournament')
    expect(buttons).toHaveLength(2)
  })

  it('sets tournament list in localStorage when Use in Tournament is clicked', () => {
    render(<MyListsScreen onCreateNew={vi.fn()} onSelectList={vi.fn()} />)
    const buttons = screen.getAllByText('Use in Tournament')
    fireEvent.click(buttons[0])
    const stored = JSON.parse(localStorage.getItem('tournament-list')!)
    expect(stored.listId).toBe('list-1')
    expect(stored.faction).toBe('Space Marines')
  })

  it('shows Active for Tournament after clicking Use in Tournament', () => {
    render(<MyListsScreen onCreateNew={vi.fn()} onSelectList={vi.fn()} />)
    const buttons = screen.getAllByText('Use in Tournament')
    fireEvent.click(buttons[0])
    expect(screen.getByText('Active for Tournament')).toBeInTheDocument()
  })
})
