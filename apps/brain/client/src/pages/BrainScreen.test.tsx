import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BrainScreen } from './BrainScreen'

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: any) => <div data-testid="react-flow">{props.children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
}))

// Mock fetch for Browse tab API calls
const mockFetch = vi.fn()
beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ layers: [{ id: 'core', label: 'Core Rules', count: 42 }] }),
  })
  global.fetch = mockFetch
})

describe('BrainScreen', () => {
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

  it('shows Browse tab and fetches layers from API', async () => {
    render(<BrainScreen />)
    fireEvent.click(screen.getByText('Browse'))
    await waitFor(() => {
      expect(screen.getByText(/Core Rules/)).toBeInTheDocument()
    })
    // Should have called the browse/layers API
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/browse/layers'))
  })

  it('Browse tab shows "Select a layer" prompt before selection', async () => {
    render(<BrainScreen />)
    fireEvent.click(screen.getByText('Browse'))
    await waitFor(() => {
      expect(screen.getByText(/Select a layer/)).toBeInTheDocument()
    })
  })
})
