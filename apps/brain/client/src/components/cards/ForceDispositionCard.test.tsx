import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ForceDispositionCard } from './ForceDispositionCard'
import type { CardContext } from './types'

const mockContext: CardContext = {
  highlightTerms: [],
  onContentClick: () => {},
  onDismiss: () => {},
}

describe('ForceDispositionCard', () => {
  it('renders disposition name', () => {
    render(
      <ForceDispositionCard
        data={{ id: '1', name: 'Take and Hold', description: 'Player-facing card.' }}
        context={mockContext}
      />,
    )
    expect(screen.getByText('Take and Hold')).toBeInTheDocument()
  })

  it('renders the Force Disposition badge', () => {
    render(
      <ForceDispositionCard
        data={{ id: '1', name: 'Disruption', description: 'Desc' }}
        context={mockContext}
      />,
    )
    expect(screen.getByText('Force Disposition')).toBeInTheDocument()
  })

  it('renders the card image when pdfImage is provided', () => {
    const { container } = render(
      <ForceDispositionCard
        data={{
          id: '1',
          name: 'Priority Assets',
          description: 'Desc',
          pdfImage: { pdfName: 'ca11-force-dispositions', page: 1 },
        }}
        context={mockContext}
      />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toContain('/pages/ca11-force-dispositions/page-1.png')
  })

  it('renders description when no pdfImage', () => {
    render(
      <ForceDispositionCard
        data={{ id: '1', name: 'Reconnaissance', description: 'Body text only.' }}
        context={mockContext}
      />,
    )
    expect(screen.getByText(/Body text only/)).toBeInTheDocument()
  })

  it('shows quality flags', () => {
    render(
      <ForceDispositionCard
        data={{
          id: '1',
          name: 'Purge the Foe',
          description: 'Desc',
          qualityFlags: ['content-inferred'],
        }}
        context={mockContext}
      />,
    )
    expect(screen.getByText('content-inferred')).toBeInTheDocument()
  })
})
