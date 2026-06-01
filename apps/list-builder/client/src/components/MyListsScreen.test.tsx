import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MyListsScreen } from './MyListsScreen'

const mockLists = [
  {
    id: 'list-1',
    userId: 'u1',
    name: 'My Crusade',
    edition: '11th' as const,
    battleSize: 'Strike Force',
    totalPoints: 1850,
    source: 'list-builder',
    author: null,
    factionId: 'Space Marines',
    subfactionId: null,
    detachmentId: null,
    dataslateId: null,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'list-2',
    userId: 'u1',
    name: 'Speed Freeks',
    edition: '11th' as const,
    battleSize: 'Incursion',
    totalPoints: 1000,
    source: 'list-builder',
    author: null,
    factionId: 'Orks',
    subfactionId: null,
    detachmentId: null,
    dataslateId: null,
    createdAt: 0,
    updatedAt: 0,
  },
]

const mockUseListsV2 = vi.fn(() => ({ data: mockLists, refetch: vi.fn() }))

// Stub the V2 hooks — MyListsScreen now reads from trpc.listV2 via useListsV2
vi.mock('../lib/useListsV2', () => ({
  useListsV2: (...args: unknown[]) => mockUseListsV2(...args),
  deleteListV2Imperative: vi.fn().mockResolvedValue({ success: true }),
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

  it('shows list faction and points', () => {
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

  it('shows empty state when no lists', () => {
    mockUseListsV2.mockReturnValueOnce({ data: [], refetch: vi.fn() })
    render(<MyListsScreen onCreateNew={vi.fn()} onSelectList={vi.fn()} />)
    expect(screen.getByText(/no lists yet/i)).toBeInTheDocument()
  })
})
