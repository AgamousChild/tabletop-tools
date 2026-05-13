import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChallengerCard } from './ChallengerCard'
import type { ChallengerCardData, CardContext } from './types'

const mockChallengerPlain: ChallengerCardData = {
  id: 'mission:ca25:challenger:seize-the-initiative',
  name: 'Seize the Initiative',
  content: 'Score 4VP at the start of your first turn if you go first. Score 2VP if you go second.',
}

const mockChallengerStructured: ChallengerCardData = {
  id: 'mission:ca25:challenger:flanking-manoeuvre',
  name: 'Flanking Manoeuvre',
  content: 'Score 3VP if you control a flank objective.\n**WHEN:** Your Movement phase.\n**TARGET:** One INFANTRY unit from your army.\n**EFFECT:** That unit can move up to 6" as if it were the Movement phase.',
}

const baseContext: CardContext = {
  highlightTerms: [],
  onContentClick: vi.fn(),
  onDismiss: vi.fn(),
}

describe('ChallengerCard', () => {
  it('renders challenger card name', () => {
    render(<ChallengerCard data={mockChallengerPlain} context={baseContext} />)
    expect(screen.getByText('Seize the Initiative')).toBeInTheDocument()
  })

  it('shows CHALLENGER badge', () => {
    render(<ChallengerCard data={mockChallengerPlain} context={baseContext} />)
    expect(screen.getByTestId('challenger-badge')).toHaveTextContent('CHALLENGER')
  })

  it('applies orange accent border', () => {
    render(<ChallengerCard data={mockChallengerPlain} context={baseContext} />)
    const header = screen.getByTestId('challenger-card-header')
    expect(header).toHaveClass('border-orange-500')
  })

  it('renders plain content when no WHEN/TARGET/EFFECT sections present', () => {
    render(<ChallengerCard data={mockChallengerPlain} context={baseContext} />)
    expect(screen.getByText(/Score 4VP at the start/)).toBeInTheDocument()
    expect(screen.queryByTestId('challenger-stratagem')).not.toBeInTheDocument()
  })

  it('renders structured stratagem section when WHEN/TARGET/EFFECT are present', () => {
    render(<ChallengerCard data={mockChallengerStructured} context={baseContext} />)
    expect(screen.getByTestId('challenger-stratagem')).toBeInTheDocument()
    expect(screen.getByText('WHEN')).toBeInTheDocument()
    expect(screen.getByText('TARGET')).toBeInTheDocument()
    expect(screen.getByText('EFFECT')).toBeInTheDocument()
  })

  it('shows Paired Stratagem label when structured sections are present', () => {
    render(<ChallengerCard data={mockChallengerStructured} context={baseContext} />)
    expect(screen.getByText('Paired Stratagem')).toBeInTheDocument()
  })

  it('shows narrative text separate from stratagem sections', () => {
    render(<ChallengerCard data={mockChallengerStructured} context={baseContext} />)
    expect(screen.getByText(/Score 3VP if you control/)).toBeInTheDocument()
  })

  it('does not render errata section when errata is absent', () => {
    render(<ChallengerCard data={mockChallengerPlain} context={baseContext} />)
    expect(screen.queryByText(/Errata & FAQ/i)).not.toBeInTheDocument()
  })

  it('shows errata section when errata entries are present', () => {
    const data: ChallengerCardData = {
      ...mockChallengerPlain,
      errata: [
        { nodeId: 'e1', title: 'Timing clarification', content: 'Scored at start of first battle round.', source: { type: 'pdf', title: 'Chapter Approved', page: 22 } },
      ],
    }
    render(<ChallengerCard data={data} context={baseContext} />)
    expect(screen.getByText('Errata & FAQ')).toBeInTheDocument()
  })

  it('shows view-source button for PDF sources with page', () => {
    const data: ChallengerCardData = {
      ...mockChallengerPlain,
      sources: [{ type: 'pdf', title: 'Chapter Approved 2025', page: 35 }],
    }
    const context: CardContext = { ...baseContext, onViewSource: vi.fn() }
    render(<ChallengerCard data={data} context={context} />)
    expect(screen.getByTestId('view-source')).toBeInTheDocument()
    expect(screen.getByText('View source (p.35)')).toBeInTheDocument()
  })

  it('calls onViewSource when view-source button is clicked', () => {
    const onViewSource = vi.fn()
    const data: ChallengerCardData = {
      ...mockChallengerPlain,
      sources: [{ type: 'pdf', title: 'Chapter Approved 2025', page: 35 }],
    }
    const context: CardContext = { ...baseContext, onViewSource }
    render(<ChallengerCard data={data} context={context} />)
    fireEvent.click(screen.getByTestId('view-source'))
    expect(onViewSource).toHaveBeenCalledWith('chapter-approved-2025', 35, 'Seize the Initiative', undefined, undefined, undefined, undefined)
  })

  it('does not show view-source button for non-pdf sources', () => {
    const data: ChallengerCardData = {
      ...mockChallengerPlain,
      sources: [{ type: 'bsdata', title: 'BSData', page: 1 }],
    }
    const context: CardContext = { ...baseContext, onViewSource: vi.fn() }
    render(<ChallengerCard data={data} context={context} />)
    expect(screen.queryByTestId('view-source')).not.toBeInTheDocument()
  })
})
