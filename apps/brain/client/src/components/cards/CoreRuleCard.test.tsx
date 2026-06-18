import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CoreRuleCard } from './CoreRuleCard'
import type { CardContext } from './types'

const mockContext: CardContext = {
  highlightTerms: [],
  onContentClick: () => {},
  onDismiss: () => {},
}

describe('CoreRuleCard', () => {
  it('renders rule name and description', () => {
    render(
      <CoreRuleCard
        data={{
          id: '1',
          name: 'SUSTAINED HITS',
          description: 'Weapons with [SUSTAINED HITS X] score additional hits on critical hits.',
        }}
        context={mockContext}
      />,
    )
    expect(screen.getByText('SUSTAINED HITS')).toBeInTheDocument()
    expect(screen.getByText(/Weapons with/)).toBeInTheDocument()
  })

  it('renders phase badge when provided', () => {
    render(
      <CoreRuleCard
        data={{
          id: '1',
          name: 'WOUND ROLL',
          description: 'Make a wound roll...',
          phase: 'shooting',
        }}
        context={mockContext}
      />,
    )
    expect(screen.getByText(/shooting/i)).toBeInTheDocument()
  })

  it('does not render phase badge when absent', () => {
    const { container } = render(
      <CoreRuleCard data={{ id: '1', name: 'Test', description: 'Desc' }} context={mockContext} />,
    )
    expect(container.querySelector('[class*="bg-amber-400/10"]')).toBeNull()
  })

  it('renders HTML table when tableHtml provided', () => {
    render(
      <CoreRuleCard
        data={{
          id: '1',
          name: 'WOUND ROLL',
          description: 'Roll.',
          tableHtml: '<table><tr><td>3+</td><td>S >= 2xT</td></tr></table>',
        }}
        context={mockContext}
      />,
    )
    expect(document.querySelector('table')).toBeTruthy()
  })

  it('shows quality flag badges', () => {
    render(
      <CoreRuleCard
        data={{ id: '1', name: 'Test', description: 'Desc', qualityFlags: ['content-inferred'] }}
        context={mockContext}
      />,
    )
    expect(screen.getByText('content-inferred')).toBeInTheDocument()
  })

  it('renders without crashing when all optional fields absent', () => {
    render(
      <CoreRuleCard
        data={{ id: '1', name: 'Min', description: 'Minimal.' }}
        context={mockContext}
      />,
    )
    expect(screen.getByText('Min')).toBeInTheDocument()
  })
})
