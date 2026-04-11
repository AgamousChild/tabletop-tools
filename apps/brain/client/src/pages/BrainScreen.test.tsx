import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrainScreen } from './BrainScreen'
import { saveNodes, clearBrainData, type BrainNode } from '../lib/store'

const testNodes: BrainNode[] = [
  {
    id: 'core:wound-roll',
    layer: 'core',
    category: 'core-mechanic',
    title: 'Wound Roll',
    content: 'Compare Strength to Toughness.',
    summary: 'How wound rolls work.',
    sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-04-08' }],
    refs: [],
    version: 1,
    keywords: ['wound', 'roll'],
  },
]

describe('BrainScreen', () => {
  beforeEach(async () => {
    await clearBrainData()
    await saveNodes(testNodes)
  })

  it('renders the header', () => {
    render(<BrainScreen />)
    expect(screen.getByText('40K Brain')).toBeInTheDocument()
  })

  it('renders tab navigation', () => {
    render(<BrainScreen />)
    expect(screen.getAllByText('Ask').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Search')).toBeInTheDocument()
    expect(screen.getByText('Browse')).toBeInTheDocument()
  })

  it('shows Ask tab by default with prompt', () => {
    render(<BrainScreen />)
    expect(screen.getByPlaceholderText(/Ask a 40K rules question/)).toBeInTheDocument()
  })

  it('shows Search tab when clicked', () => {
    render(<BrainScreen />)
    fireEvent.click(screen.getByText('Search'))
    expect(screen.getByPlaceholderText(/Semantic search/)).toBeInTheDocument()
  })

  it('shows Browse tab with layer nav when clicked', async () => {
    render(<BrainScreen />)
    fireEvent.click(screen.getByText('Browse'))
    await waitFor(() => {
      expect(screen.getByText('Core Rules')).toBeInTheDocument()
    })
  })
})
