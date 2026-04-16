import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RuleCard } from './RuleCard'
import type { RuleCardData, CardContext } from './types'

const mockArmyRule: RuleCardData = {
  id: 'faction:world-eaters:blessings-of-khorne',
  name: 'Blessings of Khorne',
  description: 'At the start of the battle round, roll eight D6. Activate up to two Blessings of Khorne.',
  factionId: 'world-eaters',
  isArmyRule: true,
  subRules: [
    { name: 'Martial Excellence', description: 'Melee weapons have the [SUSTAINED HITS 1] ability.' },
    { name: 'Warp Blades', description: 'Melee weapons have the [LETHAL HITS] ability.' },
    { name: 'Decapitating Strikes', description: 'Melee attacks targeting INFANTRY have [DEVASTATING WOUNDS].' },
  ],
  appliesTo: 54,
}

const mockDetRule: RuleCardData = {
  id: 'det:space-marines:forgefathers-seekers:vulkans-quest',
  name: "Vulkan's Quest",
  description: 'Ranged weapons have [ASSAULT]. Within 12", add 1 to Strength.',
  factionId: 'space-marines',
  subfaction: 'salamanders',
  detachmentName: "Forgefather's Seekers",
  isArmyRule: false,
}

const baseContext: CardContext = {
  highlightTerms: [],
  onContentClick: vi.fn(),
  onDismiss: vi.fn(),
}

describe('RuleCard', () => {
  it('renders rule name', () => {
    render(<RuleCard data={mockArmyRule} context={baseContext} />)
    expect(screen.getByText('Blessings of Khorne')).toBeInTheDocument()
  })

  it('shows Army Rule style (amber border) when isArmyRule=true', () => {
    render(<RuleCard data={mockArmyRule} context={baseContext} />)
    const header = screen.getByTestId('rule-card-header')
    expect(header).toHaveClass('border-amber-400')
  })

  it('shows Detachment Ability style (blue border) when isArmyRule=false', () => {
    render(<RuleCard data={mockDetRule} context={baseContext} />)
    const header = screen.getByTestId('rule-card-header')
    expect(header).toHaveClass('border-blue-400')
  })

  it('shows "Army Rule" subtitle for army rules', () => {
    render(<RuleCard data={mockArmyRule} context={baseContext} />)
    expect(screen.getByText(/Army Rule/)).toBeInTheDocument()
  })

  it('shows "Detachment Ability" subtitle for detachment rules', () => {
    render(<RuleCard data={mockDetRule} context={baseContext} />)
    expect(screen.getByText(/Detachment Ability/)).toBeInTheDocument()
  })

  it('shows faction subtitle for army rule', () => {
    render(<RuleCard data={mockArmyRule} context={baseContext} />)
    expect(screen.getByText(/world-eaters/i)).toBeInTheDocument()
  })

  it('shows detachment name in subtitle for detachment rule', () => {
    render(<RuleCard data={mockDetRule} context={baseContext} />)
    expect(screen.getByText(/Forgefather's Seekers/)).toBeInTheDocument()
  })

  it('renders description text', () => {
    render(<RuleCard data={mockArmyRule} context={baseContext} />)
    expect(screen.getByText(/At the start of the battle round/)).toBeInTheDocument()
  })

  it('renders sub-rules when present', () => {
    render(<RuleCard data={mockArmyRule} context={baseContext} />)
    expect(screen.getByText('Martial Excellence')).toBeInTheDocument()
    expect(screen.getByText('Warp Blades')).toBeInTheDocument()
    expect(screen.getByText('Decapitating Strikes')).toBeInTheDocument()
  })

  it('does not render sub-rules section when subRules is absent', () => {
    render(<RuleCard data={mockDetRule} context={baseContext} />)
    expect(screen.queryByTestId('sub-rules')).not.toBeInTheDocument()
  })

  it('highlights matching sub-rule with amber background', () => {
    const context: CardContext = { ...baseContext, highlightTerms: ['LETHAL HITS'] }
    render(<RuleCard data={mockArmyRule} context={context} />)
    const warpBladesCard = screen.getByTestId('sub-rule-Warp Blades')
    expect(warpBladesCard).toHaveClass('bg-amber-400/10')
  })

  it('does not highlight non-matching sub-rule', () => {
    const context: CardContext = { ...baseContext, highlightTerms: ['LETHAL HITS'] }
    render(<RuleCard data={mockArmyRule} context={context} />)
    const martialCard = screen.getByTestId('sub-rule-Martial Excellence')
    expect(martialCard).not.toHaveClass('bg-amber-400/10')
  })

  it('shows "Applies to X datasheets" when appliesTo is set', () => {
    render(<RuleCard data={mockArmyRule} context={baseContext} />)
    expect(screen.getByText(/Applies to 54 datasheets/)).toBeInTheDocument()
  })

  it('does not show "Applies to" line when appliesTo is absent', () => {
    render(<RuleCard data={mockDetRule} context={baseContext} />)
    expect(screen.queryByText(/Applies to/)).not.toBeInTheDocument()
  })

  it('calls onContentClick when "Applies to" line is clicked', () => {
    const onContentClick = vi.fn()
    const context: CardContext = { ...baseContext, onContentClick }
    render(<RuleCard data={mockArmyRule} context={context} />)
    fireEvent.click(screen.getByTestId('applies-to'))
    expect(onContentClick).toHaveBeenCalledWith('Blessings of Khorne')
  })

  it('shows chapter badge when subfaction is set', () => {
    render(<RuleCard data={mockDetRule} context={baseContext} />)
    expect(screen.getByTestId('subfaction-badge')).toBeInTheDocument()
    expect(screen.getByText('salamanders')).toBeInTheDocument()
  })

  it('does not show chapter badge when subfaction is absent', () => {
    render(<RuleCard data={mockArmyRule} context={baseContext} />)
    expect(screen.queryByTestId('subfaction-badge')).not.toBeInTheDocument()
  })

  it('calls onContentClick when a bracket keyword in description is clicked', () => {
    const onContentClick = vi.fn()
    const context: CardContext = { ...baseContext, onContentClick }
    render(<RuleCard data={mockDetRule} context={context} />)
    fireEvent.click(screen.getByText('[ASSAULT]'))
    expect(onContentClick).toHaveBeenCalledWith('ASSAULT')
  })

  it('calls onContentClick when a bracket keyword in sub-rule description is clicked', () => {
    const onContentClick = vi.fn()
    const context: CardContext = { ...baseContext, onContentClick }
    render(<RuleCard data={mockArmyRule} context={context} />)
    fireEvent.click(screen.getByText('[LETHAL HITS]'))
    expect(onContentClick).toHaveBeenCalledWith('LETHAL HITS')
  })
})
