import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResultCard } from './ResultCard'

const baseProps = {
  index: 1,
  title: 'Wound Roll',
  summary: 'How to resolve wound rolls in the shooting phase.',
  layer: 'core',
  category: 'core-mechanic',
  score: 0.85,
}

describe('ResultCard', () => {
  it('renders numbered result (#1)', () => {
    render(<ResultCard {...baseProps} />)
    expect(screen.getByText('#1')).toBeInTheDocument()
  })

  it('shows title', () => {
    render(<ResultCard {...baseProps} />)
    expect(screen.getByText('Wound Roll')).toBeInTheDocument()
  })

  it('shows parent unit when provided', () => {
    render(<ResultCard {...baseProps} parentUnit="Intercessor Squad" />)
    expect(screen.getByText(/on Intercessor Squad/)).toBeInTheDocument()
  })

  it('does not show parent unit line when omitted', () => {
    render(<ResultCard {...baseProps} />)
    expect(screen.queryByText(/on /)).not.toBeInTheDocument()
  })

  it('shows faction and subfaction tags', () => {
    render(<ResultCard {...baseProps} factionId="Space Marines" subfaction="Ultramarines" />)
    expect(screen.getByText('Space Marines')).toBeInTheDocument()
    expect(screen.getByText('Ultramarines')).toBeInTheDocument()
  })

  it('shows relevance score as percentage (85%)', () => {
    render(<ResultCard {...baseProps} score={0.85} />)
    expect(screen.getByText('85%')).toBeInTheDocument()
  })

  it('shows summary text', () => {
    render(<ResultCard {...baseProps} />)
    expect(screen.getByText('How to resolve wound rolls in the shooting phase.')).toBeInTheDocument()
  })

  it('shows layer badge', () => {
    render(<ResultCard {...baseProps} />)
    expect(screen.getByText('core')).toBeInTheDocument()
  })

  it('shows category', () => {
    render(<ResultCard {...baseProps} />)
    expect(screen.getByText('core-mechanic')).toBeInTheDocument()
  })

  it('shows phase when provided', () => {
    render(<ResultCard {...baseProps} phase="shooting" />)
    expect(screen.getByText('shooting')).toBeInTheDocument()
  })
})
