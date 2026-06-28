import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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
    render(<ResultCard {...baseProps} factionId="space-marines" subfaction="ultramarines" />)
    expect(screen.getByText('SPACE MARINES')).toBeInTheDocument()
    expect(screen.getByText('ULTRAMARINES')).toBeInTheDocument()
  })

  it('shows relevance score as percentage (85%)', () => {
    render(<ResultCard {...baseProps} score={0.85} />)
    expect(screen.getByText('85%')).toBeInTheDocument()
  })

  it('shows summary text', () => {
    render(<ResultCard {...baseProps} />)
    expect(
      screen.getByText('How to resolve wound rolls in the shooting phase.'),
    ).toBeInTheDocument()
  })

  it('shows category badge', () => {
    render(<ResultCard {...baseProps} />)
    expect(screen.getByText('core-mechanic')).toBeInTheDocument()
  })

  it('shows category in colored badge', () => {
    render(<ResultCard {...baseProps} />)
    const badge = screen.getByText('core-mechanic')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('rounded')
  })

  it('shows phase when provided', () => {
    render(<ResultCard {...baseProps} phase="shooting" />)
    expect(screen.getByText('shooting')).toBeInTheDocument()
  })

  it('shows edition badge when edition is provided', () => {
    render(<ResultCard {...baseProps} edition="11th" />)
    const badge = screen.getByTestId('result-card-edition')
    expect(badge).toBeInTheDocument()
    expect(badge.textContent).toBe('11th')
  })

  it('does not render edition badge when edition is undefined', () => {
    render(<ResultCard {...baseProps} />)
    expect(screen.queryByTestId('result-card-edition')).not.toBeInTheDocument()
  })
})
