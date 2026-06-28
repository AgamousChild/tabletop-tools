import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ForceGraph } from './ForceGraph'

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: any) => <div data-testid="react-flow">{props.children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
}))

global.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ForceGraph', () => {
  it('renders search input', () => {
    render(<ForceGraph />)
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })

  it('renders Visualize button', () => {
    render(<ForceGraph />)
    expect(screen.getByRole('button', { name: /visualize/i })).toBeInTheDocument()
  })

  it('shows empty state message', () => {
    render(<ForceGraph />)
    expect(screen.getByText(/Search to explore/)).toBeInTheDocument()
  })

  it('does not render an internal edition <select> (picker is the single source of truth)', () => {
    render(<ForceGraph edition="11th" />)
    // The old internal "All Editions / 10th Only / 11th Only" select is gone.
    // Edition filtering happens server-side via the picker prop.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByText(/All Editions/)).not.toBeInTheDocument()
    expect(screen.queryByText(/11th Only/)).not.toBeInTheDocument()
  })
})
