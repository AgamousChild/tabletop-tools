import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TwistCard } from './TwistCard'
import type { TwistCardData, CardContext } from './types'

const mockTwist: TwistCardData = {
  id: 'mission:ca25:twist:chosen-battlefield',
  name: 'Chosen Battlefield',
  description: 'Before setting up terrain, each player picks one of the terrain layouts from this pack. Roll off; the winner\'s layout is used.',
}

const baseContext: CardContext = {
  highlightTerms: [],
  onContentClick: vi.fn(),
  onDismiss: vi.fn(),
}

describe('TwistCard', () => {
  it('renders twist card name', () => {
    render(<TwistCard data={mockTwist} context={baseContext} />)
    expect(screen.getByText('Chosen Battlefield')).toBeInTheDocument()
  })

  it('renders the twist description', () => {
    render(<TwistCard data={mockTwist} context={baseContext} />)
    expect(screen.getByText(/Before setting up terrain/)).toBeInTheDocument()
  })

  it('shows TWIST badge', () => {
    render(<TwistCard data={mockTwist} context={baseContext} />)
    expect(screen.getByTestId('twist-badge')).toHaveTextContent('TWIST')
  })

  it('applies green accent border', () => {
    render(<TwistCard data={mockTwist} context={baseContext} />)
    const header = screen.getByTestId('twist-card-header')
    expect(header).toHaveClass('border-green-500')
  })

  it('does not render errata section when errata is absent', () => {
    render(<TwistCard data={mockTwist} context={baseContext} />)
    expect(screen.queryByText(/Errata & FAQ/i)).not.toBeInTheDocument()
  })

  it('shows errata section when errata entries are present', () => {
    const data: TwistCardData = {
      ...mockTwist,
      errata: [
        { nodeId: 'e1', title: 'Clarification', content: 'Roll-off occurs before deployment.', source: { type: 'pdf', title: 'Chapter Approved', page: 7 } },
      ],
    }
    render(<TwistCard data={data} context={baseContext} />)
    expect(screen.getByText('Errata & FAQ')).toBeInTheDocument()
  })

  it('shows view-source button for PDF sources with page', () => {
    const data: TwistCardData = {
      ...mockTwist,
      sources: [{ type: 'pdf', title: 'Chapter Approved 2025', page: 18 }],
    }
    const context: CardContext = { ...baseContext, onViewSource: vi.fn() }
    render(<TwistCard data={data} context={context} />)
    expect(screen.getByTestId('view-source')).toBeInTheDocument()
    expect(screen.getByText('View source (p.18)')).toBeInTheDocument()
  })

  it('calls onViewSource when view-source button is clicked', () => {
    const onViewSource = vi.fn()
    const data: TwistCardData = {
      ...mockTwist,
      sources: [{ type: 'pdf', title: 'Chapter Approved 2025', page: 18 }],
    }
    const context: CardContext = { ...baseContext, onViewSource }
    render(<TwistCard data={data} context={context} />)
    fireEvent.click(screen.getByTestId('view-source'))
    expect(onViewSource).toHaveBeenCalledWith('chapter-approved-2025', 18, 'Chosen Battlefield', undefined, undefined, undefined, undefined)
  })

  it('does not show view-source button for non-pdf sources', () => {
    const data: TwistCardData = {
      ...mockTwist,
      sources: [{ type: 'wahapedia', title: 'Wahapedia', page: 5 }],
    }
    const context: CardContext = { ...baseContext, onViewSource: vi.fn() }
    render(<TwistCard data={data} context={context} />)
    expect(screen.queryByTestId('view-source')).not.toBeInTheDocument()
  })
})
