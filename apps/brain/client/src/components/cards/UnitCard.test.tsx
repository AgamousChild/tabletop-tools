import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UnitCard } from './UnitCard'
import type { UnitCardData, CardContext } from './types'

const mockUnit: UnitCardData = {
  id: '000000126',
  name: 'Infernus Squad',
  factionId: 'space-marines',
  role: 'Other',
  points: '5 models: 90pts',
  stats: { move: '6"', toughness: '4', save: '3+', wounds: '2', leadership: '6+', oc: '1' },
  rangedWeapons: [
    { name: 'Bolt pistol', range: '12"', attacks: '1', skill: '3+', strength: '4', ap: '0', damage: '1', abilities: '[PISTOL]' },
    { name: 'Pyreblaster', range: '12"', attacks: 'D6', skill: 'N/A', strength: '5', ap: '-1', damage: '1', abilities: '[IGNORES COVER] [TORRENT]' },
  ],
  meleeWeapons: [
    { name: 'Close combat weapon', range: 'Melee', attacks: '3', skill: '3+', strength: '4', ap: '0', damage: '1', abilities: '' },
  ],
  abilities: [{ name: 'Incendiary Terror', description: 'After shooting, select one enemy INFANTRY unit hit — Battle-shock test.', type: 'Datasheet' }],
  coreAbilities: ['Grenades'],
  keywords: ['Infantry', 'Grenades', 'Imperium', 'Tacticus'],
  factionKeywords: ['Adeptus Astartes'],
  composition: '1 Infernus Sergeant, 4-9 Infernus Marines',
  loadout: 'bolt pistol; pyreblaster; close combat weapon',
  leaders: ["Vulkan He'stan", 'Captain', 'Chaplain'],
}

const makeContext = (overrides?: Partial<CardContext>): CardContext => ({
  highlightTerms: [],
  onContentClick: vi.fn(),
  onDismiss: vi.fn(),
  ...overrides,
})

describe('UnitCard', () => {
  it('renders unit name', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.getByText('Infernus Squad')).toBeInTheDocument()
  })

  it('renders points cost', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.getByText('5 models: 90pts')).toBeInTheDocument()
  })

  it('renders move stat', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.getByText('6"')).toBeInTheDocument()
  })

  it('renders toughness stat', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    // '4' appears in toughness stat and weapon tables — just confirm at least one exists
    expect(screen.getAllByText('4').length).toBeGreaterThan(0)
  })

  it('renders save stat', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    // '3+' appears in stat line and weapon skill columns
    expect(screen.getAllByText('3+').length).toBeGreaterThan(0)
  })

  it('renders wounds stat', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders leadership stat', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.getByText('6+')).toBeInTheDocument()
  })

  it('renders OC stat', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    // '1' appears in OC stat and weapon columns — confirm the stat line has it
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('renders ranged weapon names', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.getByText('Bolt pistol')).toBeInTheDocument()
    expect(screen.getByText('Pyreblaster')).toBeInTheDocument()
  })

  it('renders melee weapon names', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.getByText('Close combat weapon')).toBeInTheDocument()
  })

  it('renders ability names and descriptions', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.getByText('Incendiary Terror')).toBeInTheDocument()
    expect(screen.getByText(/After shooting, select one enemy INFANTRY unit hit/)).toBeInTheDocument()
  })

  it('renders core abilities as badges', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    // 'Grenades' appears both as a core ability badge and in the keywords bar
    expect(screen.getAllByText('Grenades').length).toBeGreaterThan(0)
  })

  it('renders keywords', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.getByText(/^Infantry/)).toBeInTheDocument()
    expect(screen.getByText('Imperium')).toBeInTheDocument()
    expect(screen.getByText('Tacticus')).toBeInTheDocument()
  })

  it('renders faction keywords', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    // Faction keywords appear in header subtitle and keywords bar (displayed as ALL CAPS)
    expect(screen.getAllByText('ADEPTUS ASTARTES').length).toBeGreaterThan(0)
  })

  it('renders eligible leader names', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.getByText("Vulkan He'stan")).toBeInTheDocument()
    expect(screen.getByText('Captain')).toBeInTheDocument()
    expect(screen.getByText('Chaplain')).toBeInTheDocument()
  })

  it('renders composition in footer', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.getByText(/1 Infernus Sergeant/)).toBeInTheDocument()
  })

  it('renders loadout in footer', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.getByText(/bolt pistol; pyreblaster/)).toBeInTheDocument()
  })

  it('highlights weapon row when abilities match highlightTerms', () => {
    const context = makeContext({ highlightTerms: ['torrent'] })
    render(<UnitCard data={mockUnit} context={context} />)
    // The Pyreblaster row has [TORRENT] in abilities — should be highlighted
    const rows = document.querySelectorAll('[data-highlight="true"]')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('does NOT highlight non-matching weapon rows', () => {
    const context = makeContext({ highlightTerms: ['torrent'] })
    render(<UnitCard data={mockUnit} context={context} />)
    // Bolt pistol only has [PISTOL] — should NOT be highlighted
    const allRows = document.querySelectorAll('tr[data-weapon]')
    const nonHighlighted = Array.from(allRows).filter(r => r.getAttribute('data-highlight') !== 'true')
    expect(nonHighlighted.length).toBeGreaterThan(0)
  })

  it('calls onContentClick when a keyword is clicked', () => {
    const onContentClick = vi.fn()
    const context = makeContext({ onContentClick })
    render(<UnitCard data={mockUnit} context={context} />)
    fireEvent.click(screen.getByText(/^Infantry/))
    expect(onContentClick).toHaveBeenCalledWith('Infantry')
  })

  it('calls onContentClick when a leader name is clicked', () => {
    const onContentClick = vi.fn()
    const context = makeContext({ onContentClick })
    render(<UnitCard data={mockUnit} context={context} />)
    fireEvent.click(screen.getByText('Captain'))
    expect(onContentClick).toHaveBeenCalledWith('Captain')
  })

  it('calls onContentClick when an ability name is clicked', () => {
    const onContentClick = vi.fn()
    const context = makeContext({ onContentClick })
    render(<UnitCard data={mockUnit} context={context} />)
    fireEvent.click(screen.getByText('Incendiary Terror'))
    expect(onContentClick).toHaveBeenCalledWith('Incendiary Terror')
  })

  it('does not show errata section when errata is absent', () => {
    render(<UnitCard data={mockUnit} context={makeContext()} />)
    expect(screen.queryByText(/Errata & FAQ/i)).not.toBeInTheDocument()
  })

  it('shows errata section when errata entries are present', () => {
    const data = {
      ...mockUnit,
      errata: [
        { nodeId: 'e1', title: 'Datasheet FAQ', content: 'The ability triggers once per turn.', source: { type: 'pdf', title: 'Chapter Approved', page: 8 } },
      ],
    }
    render(<UnitCard data={data} context={makeContext()} />)
    expect(screen.getByText('Errata & FAQ')).toBeInTheDocument()
  })

  it('reveals errata entry content when section is expanded', () => {
    const data = {
      ...mockUnit,
      errata: [
        { nodeId: 'e1', title: 'Datasheet FAQ', content: 'The ability triggers once per turn.', source: { type: 'pdf', title: 'Chapter Approved', page: 8 } },
      ],
    }
    render(<UnitCard data={data} context={makeContext()} />)
    fireEvent.click(screen.getByText('Errata & FAQ'))
    expect(screen.getByText('Datasheet FAQ')).toBeInTheDocument()
    expect(screen.getByText('The ability triggers once per turn.')).toBeInTheDocument()
  })
})
