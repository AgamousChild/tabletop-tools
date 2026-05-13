import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EnhancementCard } from './EnhancementCard'
import type { EnhancementCardData, CardContext } from './types'

const mockEnhancement: EnhancementCardData = {
  id: 'det:space-marines:wrathful-procession:benediction-of-fury',
  name: 'Benediction of Fury',
  cost: '10',
  description: "The bearer's melee weapons have the [DEVASTATING WOUNDS] ability.",
  restriction: 'Chaplain model only',
  detachmentName: 'Wrathful Procession',
  factionId: 'space-marines',
}

const mockContext: CardContext = {
  highlightTerms: [],
  onContentClick: vi.fn(),
  onDismiss: vi.fn(),
}

describe('EnhancementCard', () => {
  it('renders enhancement name', () => {
    render(<EnhancementCard data={mockEnhancement} context={mockContext} />)
    expect(screen.getByText('Benediction of Fury')).toBeInTheDocument()
  })

  it('renders points cost', () => {
    render(<EnhancementCard data={mockEnhancement} context={mockContext} />)
    expect(screen.getByText('10 pts')).toBeInTheDocument()
  })

  it('renders restriction text', () => {
    render(<EnhancementCard data={mockEnhancement} context={mockContext} />)
    expect(screen.getByText('Chaplain model only')).toBeInTheDocument()
  })

  it('renders description', () => {
    render(<EnhancementCard data={mockEnhancement} context={mockContext} />)
    expect(screen.getByText(/The bearer's melee weapons/)).toBeInTheDocument()
  })

  it('renders faction and detachment name in footer', () => {
    render(<EnhancementCard data={mockEnhancement} context={mockContext} />)
    expect(screen.getByText('SPACE MARINES — Wrathful Procession Detachment')).toBeInTheDocument()
  })

  it('does not render restriction line when restriction is absent', () => {
    const data = { ...mockEnhancement, restriction: undefined }
    render(<EnhancementCard data={data} context={mockContext} />)
    expect(screen.queryByText('Chaplain model only')).not.toBeInTheDocument()
  })

  it('highlights description when highlightTerms match', () => {
    const context: CardContext = { ...mockContext, highlightTerms: ['DEVASTATING WOUNDS'] }
    render(<EnhancementCard data={mockEnhancement} context={context} />)
    const highlighted = screen.getByText('DEVASTATING WOUNDS')
    expect(highlighted.tagName).toBe('MARK')
  })

  it('calls onContentClick when a highlighted term is clicked', () => {
    const onContentClick = vi.fn()
    const context: CardContext = { ...mockContext, highlightTerms: ['DEVASTATING WOUNDS'], onContentClick }
    render(<EnhancementCard data={mockEnhancement} context={context} />)
    fireEvent.click(screen.getByText('DEVASTATING WOUNDS'))
    expect(onContentClick).toHaveBeenCalledWith('DEVASTATING WOUNDS')
  })

  it('does not show errata section when errata is absent', () => {
    render(<EnhancementCard data={mockEnhancement} context={mockContext} />)
    expect(screen.queryByText(/Errata & FAQ/i)).not.toBeInTheDocument()
  })

  it('shows errata section when errata entries are present', () => {
    const data = {
      ...mockEnhancement,
      errata: [
        { nodeId: 'e1', title: 'Enhancement FAQ', content: 'Only applies to the bearer.', source: { type: 'pdf', title: 'Chapter Approved', page: 20 } },
      ],
    }
    render(<EnhancementCard data={data} context={mockContext} />)
    expect(screen.getByText('Errata & FAQ')).toBeInTheDocument()
  })

  it('reveals errata entry content when section is expanded', () => {
    const data = {
      ...mockEnhancement,
      errata: [
        { nodeId: 'e1', title: 'Enhancement FAQ', content: 'Only applies to the bearer.', source: { type: 'pdf', title: 'Chapter Approved', page: 20 } },
      ],
    }
    render(<EnhancementCard data={data} context={mockContext} />)
    fireEvent.click(screen.getByText('Errata & FAQ'))
    expect(screen.getByText('Enhancement FAQ')).toBeInTheDocument()
    expect(screen.getByText('Only applies to the bearer.')).toBeInTheDocument()
  })
})
