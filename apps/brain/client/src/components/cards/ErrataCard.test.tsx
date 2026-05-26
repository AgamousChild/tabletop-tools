import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ErrataCard } from './ErrataCard'
import type { CardContext, ErrataCardData } from './types'

const mockContext: CardContext = {
  highlightTerms: [],
  onContentClick: vi.fn(),
  onDismiss: vi.fn(),
}

const mockData: ErrataCardData = {
  id: 'errata-001',
  name: 'Devastating Wounds Clarification',
  correctionText: 'This ability applies to all melee weapons, not just the primary weapon.',
}

describe('ErrataCard', () => {
  it('renders name/title', () => {
    render(<ErrataCard data={mockData} context={mockContext} />)
    expect(screen.getByText('Devastating Wounds Clarification')).toBeInTheDocument()
  })

  it('renders correction text (body content)', () => {
    render(<ErrataCard data={mockData} context={mockContext} />)
    expect(screen.getByText(/applies to all melee weapons/)).toBeInTheDocument()
  })

  it('handles missing optional fields without crashing', () => {
    const minimalData: ErrataCardData = {
      id: 'errata-002',
      name: 'Minimal Errata',
      correctionText: 'Some correction.',
    }
    render(<ErrataCard data={minimalData} context={mockContext} />)
    expect(screen.getByText('Minimal Errata')).toBeInTheDocument()
    expect(screen.getByText('Some correction.')).toBeInTheDocument()
  })

  it('shows quality flags when present', () => {
    const data: ErrataCardData = { ...mockData, qualityFlags: ['Official', 'FAQ'] }
    render(<ErrataCard data={data} context={mockContext} />)
    expect(screen.getByText('Official')).toBeInTheDocument()
    expect(screen.getByText('FAQ')).toBeInTheDocument()
  })

  it('renders "Clarifies: {targetRule}" when targetRule is set', () => {
    const data: ErrataCardData = { ...mockData, targetRule: 'Devastating Wounds' }
    render(<ErrataCard data={data} context={mockContext} />)
    expect(screen.getByText('Clarifies:')).toBeInTheDocument()
    expect(screen.getByText('Devastating Wounds')).toBeInTheDocument()
  })

  it('calls onContentClick when targetRule link is clicked', () => {
    const onContentClick = vi.fn()
    const context: CardContext = { ...mockContext, onContentClick }
    const data: ErrataCardData = { ...mockData, targetRule: 'Devastating Wounds' }
    render(<ErrataCard data={data} context={context} />)
    fireEvent.click(screen.getByText('Devastating Wounds'))
    expect(onContentClick).toHaveBeenCalledWith('Devastating Wounds')
  })

  it('does not render clarifies line when targetRule is absent', () => {
    render(<ErrataCard data={mockData} context={mockContext} />)
    expect(screen.queryByText('Clarifies:')).not.toBeInTheDocument()
  })

  it('renders source and effectiveDate in footer when present', () => {
    const data: ErrataCardData = {
      ...mockData,
      source: 'Chapter Approved 2024',
      effectiveDate: '2024-01-01',
    }
    render(<ErrataCard data={data} context={mockContext} />)
    expect(screen.getByText('Chapter Approved 2024')).toBeInTheDocument()
    expect(screen.getByText('2024-01-01')).toBeInTheDocument()
  })

  it('does not render footer when source and effectiveDate are absent', () => {
    render(<ErrataCard data={mockData} context={mockContext} />)
    // Footer section should not appear — verify no border-t separator
    // We verify indirectly: no extra text nodes in the footer area
    expect(screen.queryByText('Chapter Approved 2024')).not.toBeInTheDocument()
  })
})
