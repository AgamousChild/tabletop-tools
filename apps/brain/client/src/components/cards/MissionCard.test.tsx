import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MissionCard } from './MissionCard'
import type { MissionCardData, CardContext } from './types'

const mockPrimary: MissionCardData = {
  id: 'mission:ca25:primary:take-and-hold',
  name: 'Take and Hold',
  missionType: 'primary',
  content: 'At the end of each player\'s Command phase, the player whose turn it is scores 4VP for each objective marker they control.',
}

const mockSecondary: MissionCardData = {
  id: 'mission:ca25:secondary:atk:extend-battle-lines',
  name: 'Extend Battle Lines',
  missionType: 'secondary',
  side: 'attacker',
  isFixed: false,
  content: 'Score 3VP at the end of your turn for each objective marker you control in your opponent\'s deployment zone.',
}

const mockFixed: MissionCardData = {
  id: 'mission:ca25:secondary:def:defend-stronghold',
  name: 'Defend Stronghold',
  missionType: 'secondary',
  side: 'defender',
  isFixed: true,
  content: 'Score 5VP if you control your own stronghold objective at the end of the battle.',
}

const baseContext: CardContext = {
  highlightTerms: [],
  onContentClick: vi.fn(),
  onDismiss: vi.fn(),
}

describe('MissionCard', () => {
  it('renders mission name', () => {
    render(<MissionCard data={mockPrimary} context={baseContext} />)
    expect(screen.getByText('Take and Hold')).toBeInTheDocument()
  })

  it('renders primary mission with amber accent border', () => {
    render(<MissionCard data={mockPrimary} context={baseContext} />)
    const header = screen.getByTestId('mission-card-header')
    expect(header).toHaveClass('border-amber-400')
  })

  it('renders secondary mission with blue accent border', () => {
    render(<MissionCard data={mockSecondary} context={baseContext} />)
    const header = screen.getByTestId('mission-card-header')
    expect(header).toHaveClass('border-blue-400')
  })

  it('shows PRIMARY MISSION badge for primary type', () => {
    render(<MissionCard data={mockPrimary} context={baseContext} />)
    expect(screen.getByTestId('mission-type-badge')).toHaveTextContent('PRIMARY MISSION')
  })

  it('shows SECONDARY MISSION badge for secondary type', () => {
    render(<MissionCard data={mockSecondary} context={baseContext} />)
    expect(screen.getByTestId('mission-type-badge')).toHaveTextContent('SECONDARY MISSION')
  })

  it('shows FIXED badge when isFixed is true', () => {
    render(<MissionCard data={mockFixed} context={baseContext} />)
    expect(screen.getByTestId('fixed-badge')).toBeInTheDocument()
  })

  it('does not show FIXED badge when isFixed is false', () => {
    render(<MissionCard data={mockSecondary} context={baseContext} />)
    expect(screen.queryByTestId('fixed-badge')).not.toBeInTheDocument()
  })

  it('does not show FIXED badge when isFixed is absent', () => {
    render(<MissionCard data={mockPrimary} context={baseContext} />)
    expect(screen.queryByTestId('fixed-badge')).not.toBeInTheDocument()
  })

  it('shows attacker side badge', () => {
    render(<MissionCard data={mockSecondary} context={baseContext} />)
    expect(screen.getByTestId('side-badge')).toHaveTextContent('attacker')
  })

  it('shows defender side badge', () => {
    render(<MissionCard data={mockFixed} context={baseContext} />)
    expect(screen.getByTestId('side-badge')).toHaveTextContent('defender')
  })

  it('does not show side badge when side is absent', () => {
    render(<MissionCard data={mockPrimary} context={baseContext} />)
    expect(screen.queryByTestId('side-badge')).not.toBeInTheDocument()
  })

  it('renders the mission content text', () => {
    render(<MissionCard data={mockPrimary} context={baseContext} />)
    expect(screen.getByText(/At the end of each player/)).toBeInTheDocument()
  })

  it('does not render errata section when errata is absent', () => {
    render(<MissionCard data={mockPrimary} context={baseContext} />)
    expect(screen.queryByText(/Errata & FAQ/i)).not.toBeInTheDocument()
  })

  it('shows errata section when errata entries are present', () => {
    const data: MissionCardData = {
      ...mockPrimary,
      errata: [
        { nodeId: 'e1', title: 'FAQ Q1', content: 'Clarified wording.', source: { type: 'pdf', title: 'Chapter Approved', page: 10 } },
      ],
    }
    render(<MissionCard data={data} context={baseContext} />)
    expect(screen.getByText('Errata & FAQ')).toBeInTheDocument()
  })

  it('shows view-source button for PDF sources with page', () => {
    const data: MissionCardData = {
      ...mockPrimary,
      sources: [{ type: 'pdf', title: 'Chapter Approved 2025', page: 42 }],
    }
    const context: CardContext = { ...baseContext, onViewSource: vi.fn() }
    render(<MissionCard data={data} context={context} />)
    expect(screen.getByTestId('view-source')).toBeInTheDocument()
    expect(screen.getByText('View source (p.42)')).toBeInTheDocument()
  })

  it('calls onViewSource when view-source button is clicked', () => {
    const onViewSource = vi.fn()
    const data: MissionCardData = {
      ...mockPrimary,
      sources: [{ type: 'pdf', title: 'Chapter Approved 2025', page: 42 }],
    }
    const context: CardContext = { ...baseContext, onViewSource }
    render(<MissionCard data={data} context={context} />)
    fireEvent.click(screen.getByTestId('view-source'))
    expect(onViewSource).toHaveBeenCalledWith('chapter-approved-2025', 42, 'Take and Hold', undefined, undefined, undefined, undefined)
  })

  it('does not show view-source button for non-pdf sources', () => {
    const data: MissionCardData = {
      ...mockPrimary,
      sources: [{ type: 'wahapedia', title: 'Wahapedia', page: 5 }],
    }
    const context: CardContext = { ...baseContext, onViewSource: vi.fn() }
    render(<MissionCard data={data} context={context} />)
    expect(screen.queryByTestId('view-source')).not.toBeInTheDocument()
  })
})
