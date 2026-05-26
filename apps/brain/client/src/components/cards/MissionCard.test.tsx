import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MissionCard } from './MissionCard'
import type { CardContext, MissionCardData } from './types'

const mockPrimary: MissionCardData = {
  id: 'mission:ca25:primary:take-and-hold',
  name: 'Take and Hold',
  missionType: 'primary',
  content:
    "At the end of each player's Command phase, the player whose turn it is scores 4VP for each objective marker they control.",
}

const mockSecondary: MissionCardData = {
  id: 'mission:ca25:secondary:atk:extend-battle-lines',
  name: 'Extend Battle Lines',
  missionType: 'secondary',
  side: 'attacker',
  isFixed: false,
  content:
    "Score 3VP at the end of your turn for each objective marker you control in your opponent's deployment zone.",
}

const mockFixed: MissionCardData = {
  id: 'mission:ca25:secondary:def:defend-stronghold',
  name: 'Defend Stronghold',
  missionType: 'secondary',
  side: 'defender',
  isFixed: true,
  content: 'Score 5VP if you control your own stronghold objective at the end of the battle.',
}

const mockStructured: MissionCardData = {
  id: 'mission:structured',
  name: 'Structured Mission',
  missionType: 'primary',
  content: 'Full description here.',
  when: 'End of Command phase',
  condition: 'For each objective marker you control',
  scoring: '4VP per objective (max 15VP)',
  action: 'Perform the Secure action',
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

  it('shows PRIMARY badge for primary type', () => {
    render(<MissionCard data={mockPrimary} context={baseContext} />)
    expect(screen.getByTestId('mission-type-badge')).toHaveTextContent('PRIMARY')
  })

  it('shows SECONDARY badge for secondary type', () => {
    render(<MissionCard data={mockSecondary} context={baseContext} />)
    expect(screen.getByTestId('mission-type-badge')).toHaveTextContent('SECONDARY')
  })

  it('shows FIXED badge when isFixed is true', () => {
    render(<MissionCard data={mockFixed} context={baseContext} />)
    expect(screen.getByTestId('fixed-badge')).toBeInTheDocument()
  })

  it('does not show FIXED badge when isFixed is false', () => {
    render(<MissionCard data={mockSecondary} context={baseContext} />)
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

  it('does not show side badge when absent', () => {
    render(<MissionCard data={mockPrimary} context={baseContext} />)
    expect(screen.queryByTestId('side-badge')).not.toBeInTheDocument()
  })

  it('renders raw content when no structured fields', () => {
    render(<MissionCard data={mockPrimary} context={baseContext} />)
    expect(screen.getByText(/At the end of each player/)).toBeInTheDocument()
  })

  it('renders content as structured markdown', () => {
    render(<MissionCard data={mockStructured} context={baseContext} />)
    expect(screen.getByText('Full description here.')).toBeInTheDocument()
  })

  it('shows full content alongside structured fields', () => {
    render(<MissionCard data={mockStructured} context={baseContext} />)
    expect(screen.getByText('Full description here.')).toBeInTheDocument()
  })

  it('shows view-source button for PDF sources', () => {
    const data: MissionCardData = {
      ...mockPrimary,
      sources: [{ type: 'pdf', title: 'Chapter Approved 2025', page: 42 }],
    }
    const context: CardContext = { ...baseContext, onViewSource: vi.fn() }
    render(<MissionCard data={data} context={context} />)
    expect(screen.getByTestId('view-source')).toBeInTheDocument()
  })

  it('calls onViewSource when clicked', () => {
    const onViewSource = vi.fn()
    const data: MissionCardData = {
      ...mockPrimary,
      sources: [{ type: 'pdf', title: 'Chapter Approved 2025', page: 42 }],
    }
    render(<MissionCard data={data} context={{ ...baseContext, onViewSource }} />)
    fireEvent.click(screen.getByTestId('view-source'))
    expect(onViewSource).toHaveBeenCalledWith(
      'chapter-approved-2025',
      42,
      'Take and Hold',
      undefined,
      undefined,
      undefined,
      undefined,
    )
  })

  it('shows errata section when present', () => {
    const data: MissionCardData = {
      ...mockPrimary,
      errata: [
        {
          nodeId: 'e1',
          title: 'FAQ Q1',
          content: 'Clarified.',
          source: { type: 'pdf', title: 'CA', page: 10 },
        },
      ],
    }
    render(<MissionCard data={data} context={baseContext} />)
    expect(screen.getByText('Errata & FAQ')).toBeInTheDocument()
  })
})
