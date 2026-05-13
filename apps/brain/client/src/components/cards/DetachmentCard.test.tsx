import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DetachmentCard } from './DetachmentCard'
import type { CardContext, DetachmentCardData } from './types'

const mockContext: CardContext = {
  highlightTerms: [],
  onContentClick: () => {},
  onDismiss: () => {},
}

const mockDetachment: DetachmentCardData = {
  id: 'det:1',
  name: 'Berzerker Warband',
  factionId: 'world-eaters',
  factionName: 'WORLD EATERS',
  abilityText:
    'Blood Surge: Units from your army are eligible to declare a charge in a turn in which they Advanced.',
  stratagems: [
    {
      id: 's1',
      name: 'Blood Tithe',
      type: 'Battle Tactic',
      cpCost: '1',
      turn: '',
      phase: 'fight',
      when: 'Fight phase',
      target: 'One unit',
      effect: 'Re-roll wound rolls',
      detachmentName: 'Berzerker Warband',
      factionId: 'world-eaters',
    },
    {
      id: 's2',
      name: 'Apoplectic Frenzy',
      type: 'Strategic Ploy',
      cpCost: '1',
      turn: '',
      phase: 'movement',
      when: 'Movement phase',
      target: 'One unit',
      effect: 'Pile in 6"',
      detachmentName: 'Berzerker Warband',
      factionId: 'world-eaters',
    },
  ],
  enhancements: [
    {
      id: 'e1',
      name: 'Berzerker Glaive',
      cost: '25',
      description: '+1 Strength and AP',
      detachmentName: 'Berzerker Warband',
      factionId: 'world-eaters',
    },
  ],
  chapterBadge: 'World Eaters',
}

describe('DetachmentCard', () => {
  it('renders detachment name', () => {
    render(<DetachmentCard data={mockDetachment} context={mockContext} />)
    expect(screen.getByText('Berzerker Warband')).toBeInTheDocument()
  })

  it('renders faction name', () => {
    render(<DetachmentCard data={mockDetachment} context={mockContext} />)
    // factionName appears in both header badge and subtitle — verify at least one is present
    expect(screen.getAllByText(/WORLD EATERS/).length).toBeGreaterThan(0)
  })

  it('renders ability text', () => {
    render(<DetachmentCard data={mockDetachment} context={mockContext} />)
    expect(screen.getByText(/Blood Surge/)).toBeInTheDocument()
  })

  it('renders chapter badge', () => {
    render(<DetachmentCard data={mockDetachment} context={mockContext} />)
    expect(screen.getByText('World Eaters')).toBeInTheDocument()
  })

  it('shows stratagem count', () => {
    render(<DetachmentCard data={mockDetachment} context={mockContext} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Stratagems')).toBeInTheDocument()
  })

  it('shows enhancement count', () => {
    render(<DetachmentCard data={mockDetachment} context={mockContext} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Enhancements')).toBeInTheDocument()
  })

  it('expands stratagems on click', () => {
    render(<DetachmentCard data={mockDetachment} context={mockContext} />)
    fireEvent.click(screen.getByText('Stratagems'))
    expect(screen.getByText('Blood Tithe')).toBeInTheDocument()
    expect(screen.getByText('Apoplectic Frenzy')).toBeInTheDocument()
  })

  it('renders without stratagems/enhancements', () => {
    render(
      <DetachmentCard
        data={{ ...mockDetachment, stratagems: [], enhancements: [] }}
        context={mockContext}
      />,
    )
    expect(screen.getByText('Berzerker Warband')).toBeInTheDocument()
    // CollapsibleSection renders nothing when count is 0
    expect(screen.queryByText('Stratagems')).not.toBeInTheDocument()
    expect(screen.queryByText('Enhancements')).not.toBeInTheDocument()
  })

  it('shows quality flags', () => {
    render(
      <DetachmentCard
        data={{ ...mockDetachment, qualityFlags: ['orphan'] }}
        context={mockContext}
      />,
    )
    expect(screen.getByText('orphan')).toBeInTheDocument()
  })
})
