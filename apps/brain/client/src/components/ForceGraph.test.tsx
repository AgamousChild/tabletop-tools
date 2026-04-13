import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ForceGraph } from './ForceGraph'

vi.mock('react-force-graph-2d', () => ({
  default: (props: any) => (
    <div data-testid="force-graph">
      {props.graphData?.nodes?.map((n: any) => (
        <div key={n.id} data-testid={`node-${n.id}`}>{n.label}</div>
      ))}
    </div>
  ),
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

  it('shows legend with layer names', () => {
    render(<ForceGraph />)
    expect(screen.getByText('core')).toBeInTheDocument()
    expect(screen.getByText('faction')).toBeInTheDocument()
    expect(screen.getByText('unit')).toBeInTheDocument()
    expect(screen.getByText('errata')).toBeInTheDocument()
    expect(screen.getByText('balance')).toBeInTheDocument()
    expect(screen.getByText('community')).toBeInTheDocument()
  })
})
