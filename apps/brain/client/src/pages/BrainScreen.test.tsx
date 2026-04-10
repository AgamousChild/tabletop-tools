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
  {
    id: 'core:hit-roll',
    layer: 'core',
    category: 'core-mechanic',
    title: 'Hit Roll',
    content: 'Roll dice to determine hits.',
    summary: 'How hit rolls work.',
    sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-04-08' }],
    refs: [],
    version: 1,
    keywords: ['hit', 'roll'],
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

  it('renders layer navigation', () => {
    render(<BrainScreen />)
    expect(screen.getByText('Core Rules')).toBeInTheDocument()
    expect(screen.getByText('Faction')).toBeInTheDocument()
  })

  it('shows initial instruction text', () => {
    render(<BrainScreen />)
    expect(screen.getByText(/Select a layer or search/)).toBeInTheDocument()
  })

  it('shows nodes when a layer is selected', async () => {
    render(<BrainScreen />)
    fireEvent.click(screen.getByText('Core Rules'))
    await waitFor(() => {
      expect(screen.getByText('Wound Roll')).toBeInTheDocument()
    })
  })

  it('has a search input', () => {
    render(<BrainScreen />)
    expect(screen.getByPlaceholderText('Search rules...')).toBeInTheDocument()
  })
})
