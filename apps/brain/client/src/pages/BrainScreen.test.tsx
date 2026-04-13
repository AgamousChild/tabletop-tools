import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrainScreen } from './BrainScreen'
import { saveNodes, clearBrainData, setBrainMeta, type BrainNode } from '../lib/store'

vi.mock('react-force-graph-2d', () => ({
  default: (props: any) => (
    <div data-testid="force-graph">
      {props.graphData?.nodes?.map((n: any) => (
        <div key={n.id} data-testid={`node-${n.id}`}>{n.label}</div>
      ))}
    </div>
  ),
}))

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

  it('renders tab navigation with four tabs', () => {
    render(<BrainScreen />)
    expect(screen.getAllByText('Ask').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Search')).toBeInTheDocument()
    expect(screen.getByText('Browse')).toBeInTheDocument()
    expect(screen.getByText('Graph')).toBeInTheDocument()
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

  it('shows Graph tab with ForceGraph', () => {
    render(<BrainScreen />)
    fireEvent.click(screen.getByText('Graph'))
    expect(screen.getByPlaceholderText(/Search to visualize/i)).toBeInTheDocument()
  })

  it('shows Browse tab sync prompt when no brain meta', async () => {
    render(<BrainScreen />)
    fireEvent.click(screen.getByText('Browse'))
    await waitFor(() => {
      expect(screen.getByText(/No brain data synced yet/)).toBeInTheDocument()
    })
  })

  it('shows Browse tab with layer nav when brain data exists', async () => {
    await setBrainMeta({ lastSync: Date.now(), fileHashes: {} })
    render(<BrainScreen />)
    fireEvent.click(screen.getByText('Browse'))
    await waitFor(() => {
      expect(screen.getByText('Core Rules')).toBeInTheDocument()
    })
  })
})
