import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StratagemCard } from './StratagemCard'
import type { CardContext, StratagemCardData } from './types'

const mockStratagem: StratagemCardData = {
  id: 'det:space-marines:forgefathers-seekers:immolation-protocols',
  name: 'Immolation Protocols',
  type: "Forgefather's Seekers — Battle Tactic Stratagem",
  cpCost: '2',
  turn: 'Your turn',
  phase: 'Shooting phase',
  when: 'Your Shooting phase.',
  target:
    'One ADEPTUS ASTARTES unit from your army that has not been selected to shoot this phase.',
  effect:
    'Until the end of the phase, Torrent weapons equipped by models in your unit have the [DEVASTATING WOUNDS] ability.',
  detachmentName: "Forgefather's Seekers",
  factionId: 'space-marines',
}

const baseContext: CardContext = {
  highlightTerms: [],
  onContentClick: vi.fn(),
  onDismiss: vi.fn(),
}

describe('StratagemCard', () => {
  it('renders stratagem name', () => {
    render(<StratagemCard data={mockStratagem} context={baseContext} />)
    expect(screen.getByText('Immolation Protocols')).toBeInTheDocument()
  })

  it('renders CP cost', () => {
    render(<StratagemCard data={mockStratagem} context={baseContext} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders type line with phase', () => {
    render(<StratagemCard data={mockStratagem} context={baseContext} />)
    expect(
      screen.getByText("Forgefather's Seekers — Battle Tactic Stratagem — Shooting phase"),
    ).toBeInTheDocument()
  })

  it('renders WHEN section with label and text', () => {
    render(<StratagemCard data={mockStratagem} context={baseContext} />)
    expect(screen.getByText('WHEN')).toBeInTheDocument()
    expect(screen.getByText('Your Shooting phase.')).toBeInTheDocument()
  })

  it('renders TARGET section', () => {
    render(<StratagemCard data={mockStratagem} context={baseContext} />)
    expect(screen.getByText('TARGET')).toBeInTheDocument()
    expect(screen.getByText(/One ADEPTUS ASTARTES unit/)).toBeInTheDocument()
  })

  it('renders EFFECT section', () => {
    render(<StratagemCard data={mockStratagem} context={baseContext} />)
    expect(screen.getByText('EFFECT')).toBeInTheDocument()
    expect(screen.getByText(/Torrent weapons equipped by models/)).toBeInTheDocument()
  })

  it('renders faction and detachment name in footer', () => {
    render(<StratagemCard data={mockStratagem} context={baseContext} />)
    expect(screen.getByText("SPACE MARINES — Forgefather's Seekers Detachment")).toBeInTheDocument()
  })

  it('renders chapter faction directly from factionId in footer', () => {
    // Post-PR-D chapter identity lives on `factionId` (see model.ts).
    const data = { ...mockStratagem, factionId: 'blood-angels' }
    render(<StratagemCard data={data} context={baseContext} />)
    expect(screen.getByText("BLOOD ANGELS — Forgefather's Seekers Detachment")).toBeInTheDocument()
  })

  it('highlights EFFECT section when highlightTerms match effect text', () => {
    const context: CardContext = {
      ...baseContext,
      highlightTerms: ['DEVASTATING WOUNDS'],
    }
    render(<StratagemCard data={mockStratagem} context={context} />)
    const effectSection = screen.getByTestId('section-effect')
    expect(effectSection).toHaveClass('bg-amber-400/10')
  })

  it('does not highlight EFFECT section when highlightTerms do not match', () => {
    const context: CardContext = {
      ...baseContext,
      highlightTerms: ['something unrelated'],
    }
    render(<StratagemCard data={mockStratagem} context={context} />)
    const effectSection = screen.getByTestId('section-effect')
    expect(effectSection).not.toHaveClass('bg-amber-400/10')
  })

  it('does not highlight WHEN section when highlightTerms do not match its text', () => {
    const context: CardContext = {
      ...baseContext,
      highlightTerms: ['DEVASTATING WOUNDS'],
    }
    render(<StratagemCard data={mockStratagem} context={context} />)
    const whenSection = screen.getByTestId('section-when')
    expect(whenSection).not.toHaveClass('bg-amber-400/10')
  })

  it('calls onContentClick when a keyword in the text is clicked', () => {
    const onContentClick = vi.fn()
    const context: CardContext = {
      ...baseContext,
      onContentClick,
    }
    render(<StratagemCard data={mockStratagem} context={context} />)
    // DEVASTATING WOUNDS appears in brackets in the effect text — it's a clickable keyword
    const keyword = screen.getByText('[DEVASTATING WOUNDS]')
    fireEvent.click(keyword)
    expect(onContentClick).toHaveBeenCalledWith('DEVASTATING WOUNDS')
  })

  it('does not show errata section when errata is absent', () => {
    render(<StratagemCard data={mockStratagem} context={baseContext} />)
    expect(screen.queryByText(/Errata & FAQ/i)).not.toBeInTheDocument()
  })

  it('shows errata section when errata entries are present', () => {
    const data = {
      ...mockStratagem,
      errata: [
        {
          nodeId: 'e1',
          title: 'Stratagem FAQ',
          content: 'This can only be used once per phase.',
          source: { type: 'pdf', title: 'Chapter Approved', page: 15 },
        },
      ],
    }
    render(<StratagemCard data={data} context={baseContext} />)
    expect(screen.getByText('Errata & FAQ')).toBeInTheDocument()
  })

  it('reveals errata entry content when section is expanded', () => {
    const data = {
      ...mockStratagem,
      errata: [
        {
          nodeId: 'e1',
          title: 'Stratagem FAQ',
          content: 'This can only be used once per phase.',
          source: { type: 'pdf', title: 'Chapter Approved', page: 15 },
        },
      ],
    }
    render(<StratagemCard data={data} context={baseContext} />)
    fireEvent.click(screen.getByText('Errata & FAQ'))
    expect(screen.getByText('Stratagem FAQ')).toBeInTheDocument()
    expect(screen.getByText('This can only be used once per phase.')).toBeInTheDocument()
  })

  it('renders the COST section showing the CP cost in body', () => {
    render(<StratagemCard data={mockStratagem} context={baseContext} />)
    const costSection = screen.getByTestId('section-cost')
    expect(costSection).toHaveTextContent('COST')
    expect(costSection).toHaveTextContent('2 CP')
  })
})
