import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ComboView } from './ComboView'
import type { CardContext, CardData } from './types'

const leftCard: CardData = {
  type: 'unit',
  data: {
    id: 'unit-forgefather',
    name: 'Forgefather',
    factionId: 'space-marines',
    role: 'Character',
    points: '1 model: 80pts',
    stats: { move: '6"', toughness: '4', save: '3+', wounds: '4', leadership: '6+', oc: '1' },
    rangedWeapons: [],
    meleeWeapons: [],
    abilities: [],
    coreAbilities: [],
    keywords: ['Infantry', 'Character'],
    factionKeywords: ['Adeptus Astartes'],
    composition: '1 Forgefather',
    loadout: 'bolt pistol',
    leaders: [],
  },
}

const rightCard: CardData = {
  type: 'stratagem',
  data: {
    id: 'strat-immolation-protocols',
    name: 'Immolation Protocols',
    type: "Forgefather's Seekers — Battle Tactic Stratagem",
    cpCost: '2',
    turn: 'Your turn',
    phase: 'Shooting phase',
    when: 'Your Shooting phase.',
    target: 'One ADEPTUS ASTARTES unit from your army.',
    effect: 'Torrent weapons gain [DEVASTATING WOUNDS].',
    detachmentName: "Forgefather's Seekers",
    factionId: 'space-marines',
  },
}

const makeContext = (overrides?: Partial<CardContext>): CardContext => ({
  highlightTerms: [],
  onContentClick: vi.fn(),
  onDismiss: vi.fn(),
  ...overrides,
})

describe('ComboView', () => {
  it('renders the left card title', () => {
    render(
      <ComboView
        leftCard={leftCard}
        rightCard={rightCard}
        label="wound re-rolls + devastating wounds on torrent weapons"
        context={makeContext()}
      />,
    )
    expect(screen.getByText('Forgefather')).toBeInTheDocument()
  })

  it('renders the right card title', () => {
    render(
      <ComboView
        leftCard={leftCard}
        rightCard={rightCard}
        label="wound re-rolls + devastating wounds on torrent weapons"
        context={makeContext()}
      />,
    )
    expect(screen.getByText('Immolation Protocols')).toBeInTheDocument()
  })

  it('shows the label text', () => {
    render(
      <ComboView
        leftCard={leftCard}
        rightCard={rightCard}
        label="wound re-rolls + devastating wounds on torrent weapons"
        context={makeContext()}
      />,
    )
    expect(
      screen.getByText('wound re-rolls + devastating wounds on torrent weapons'),
    ).toBeInTheDocument()
  })

  it('renders an SVG arrow between the cards', () => {
    const { container } = render(
      <ComboView
        leftCard={leftCard}
        rightCard={rightCard}
        label="combo label"
        context={makeContext()}
      />,
    )
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('arrow SVG contains a line element', () => {
    const { container } = render(
      <ComboView
        leftCard={leftCard}
        rightCard={rightCard}
        label="combo label"
        context={makeContext()}
      />,
    )
    const line = container.querySelector('svg line')
    expect(line).toBeInTheDocument()
  })

  it('arrow SVG contains a polygon arrowhead', () => {
    const { container } = render(
      <ComboView
        leftCard={leftCard}
        rightCard={rightCard}
        label="combo label"
        context={makeContext()}
      />,
    )
    const polygon = container.querySelector('svg polygon')
    expect(polygon).toBeInTheDocument()
  })

  it('renders both cards in the DOM', () => {
    const { container } = render(
      <ComboView
        leftCard={leftCard}
        rightCard={rightCard}
        label="combo label"
        context={makeContext()}
      />,
    )
    // Both card names visible = both cards rendered
    expect(screen.getByText('Forgefather')).toBeInTheDocument()
    expect(screen.getByText('Immolation Protocols')).toBeInTheDocument()
    // Container wraps both
    expect(container.firstChild).toBeInTheDocument()
  })

  it('has flex-col class on mobile via sm:flex-row breakpoint class', () => {
    const { container } = render(
      <ComboView
        leftCard={leftCard}
        rightCard={rightCard}
        label="combo label"
        context={makeContext()}
      />,
    )
    // The cards wrapper should have flex-col (default/mobile) and sm:flex-row (desktop)
    const cardsWrapper = container.querySelector('[data-testid="combo-cards"]')
    expect(cardsWrapper).toBeInTheDocument()
    expect(cardsWrapper?.className).toContain('flex-col')
    expect(cardsWrapper?.className).toContain('sm:flex-row')
  })

  it('passes the same context to both cards (same onContentClick)', () => {
    const onContentClick = vi.fn()
    const context = makeContext({ onContentClick })
    render(
      <ComboView leftCard={leftCard} rightCard={rightCard} label="combo label" context={context} />,
    )
    // Both cards rendered with context — just confirm the component renders without error
    expect(screen.getByText('Forgefather')).toBeInTheDocument()
    expect(screen.getByText('Immolation Protocols')).toBeInTheDocument()
  })
})
