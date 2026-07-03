import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CardContext, UnitCardData } from './types'
import { UnitCard } from './UnitCard'

const mockUnit: UnitCardData = {
  id: '000000126',
  name: 'Infernus Squad',
  factionId: 'space-marines',
  role: 'Other',
  points: '5 models: 90pts',
  stats: { move: '6"', toughness: '4', save: '3+', wounds: '2', leadership: '6+', oc: '1' },
  rangedWeapons: [
    {
      name: 'Bolt pistol',
      range: '12"',
      attacks: '1',
      skill: '3+',
      strength: '4',
      ap: '0',
      damage: '1',
      abilities: '[PISTOL]',
    },
    {
      name: 'Pyreblaster',
      range: '12"',
      attacks: 'D6',
      skill: 'N/A',
      strength: '5',
      ap: '-1',
      damage: '1',
      abilities: '[IGNORES COVER] [TORRENT]',
    },
  ],
  meleeWeapons: [
    {
      name: 'Close combat weapon',
      range: 'Melee',
      attacks: '3',
      skill: '3+',
      strength: '4',
      ap: '0',
      damage: '1',
      abilities: '',
    },
  ],
  abilities: [
    {
      name: 'Incendiary Terror',
      description: 'After shooting, select one enemy INFANTRY unit hit — Battle-shock test.',
      type: 'Datasheet',
    },
  ],
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
    expect(
      screen.getByText(/After shooting, select one enemy INFANTRY unit hit/),
    ).toBeInTheDocument()
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
    // Faction keywords appear in the keywords bar (displayed as ALL CAPS).
    // Post-PR-E the header shows factionId ("SPACE MARINES") rather than
    // factionKeywords[0], so ADEPTUS ASTARTES surfaces once — in the bar.
    expect(screen.getAllByText('ADEPTUS ASTARTES').length).toBeGreaterThan(0)
  })

  // ── Bug 3 regression: header only renders factionId, never duplicates ────
  //
  // Before PR E, the header's `factionKeywords[0] || factionId` expression
  // painted the header with the first factionKeyword. Every unit whose slug
  // and first factionKeyword had the same display — Blightlord Terminators
  // ("death-guard" + "Death Guard"), Lord on Juggernaut ("world-eaters" +
  // "World Eaters"), etc. — surfaced the badge twice: once from the header,
  // once from the keywords bar. See PR E of the 2026-07-03 scalar-to-ref
  // refactor plan.
  it('renders the primary faction badge exactly once for a Death Guard datasheet (Blightlord Terminators)', () => {
    const blightlord: UnitCardData = {
      ...mockUnit,
      id: 'datasheet:blightlord-terminators',
      name: 'Blightlord Terminators',
      factionId: 'death-guard',
      // Post-`filterRedundantFactionKeywords` the Death-Guard-duplicate
      // keyword is stripped; only parent-faction tags remain.
      factionKeywords: [],
    }
    render(<UnitCard data={blightlord} context={makeContext()} />)
    expect(screen.getAllByText('DEATH GUARD')).toHaveLength(1)
  })

  it('renders the primary faction badge exactly once for a World Eaters datasheet (Lord on Juggernaut)', () => {
    const lord: UnitCardData = {
      ...mockUnit,
      id: 'datasheet:lord-on-juggernaut',
      name: 'Lord on Juggernaut',
      factionId: 'world-eaters',
      factionKeywords: [],
    }
    render(<UnitCard data={lord} context={makeContext()} />)
    expect(screen.getAllByText('WORLD EATERS')).toHaveLength(1)
  })

  it('renders the header badge from factionId when factionKeywords is populated with a parent-faction tag', () => {
    // Space Marines datasheets keep "Adeptus Astartes" as a parent tag in
    // factionKeywords. The header still reads SPACE MARINES (from factionId),
    // NOT ADEPTUS ASTARTES.
    const rhino: UnitCardData = {
      ...mockUnit,
      id: 'datasheet:rhino',
      name: 'Rhino',
      factionId: 'space-marines',
      factionKeywords: ['Adeptus Astartes'],
    }
    render(<UnitCard data={rhino} context={makeContext()} />)
    expect(screen.getByText('SPACE MARINES')).toBeInTheDocument()
    // ADEPTUS ASTARTES appears once in the keywords bar — not in the header.
    expect(screen.getAllByText('ADEPTUS ASTARTES')).toHaveLength(1)
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
    const nonHighlighted = Array.from(allRows).filter(
      (r) => r.getAttribute('data-highlight') !== 'true',
    )
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
        {
          nodeId: 'e1',
          title: 'Datasheet FAQ',
          content: 'The ability triggers once per turn.',
          source: { type: 'pdf', title: 'Chapter Approved', page: 8 },
        },
      ],
    }
    render(<UnitCard data={data} context={makeContext()} />)
    expect(screen.getByText('Errata & FAQ')).toBeInTheDocument()
  })

  it('reveals errata entry content when section is expanded', () => {
    const data = {
      ...mockUnit,
      errata: [
        {
          nodeId: 'e1',
          title: 'Datasheet FAQ',
          content: 'The ability triggers once per turn.',
          source: { type: 'pdf', title: 'Chapter Approved', page: 8 },
        },
      ],
    }
    render(<UnitCard data={data} context={makeContext()} />)
    fireEvent.click(screen.getByText('Errata & FAQ'))
    expect(screen.getByText('Datasheet FAQ')).toBeInTheDocument()
    expect(screen.getByText('The ability triggers once per turn.')).toBeInTheDocument()
  })

  it('renders structured coreAbilities with values (FEEL NO PAIN 5+)', () => {
    const data: UnitCardData = {
      ...mockUnit,
      coreAbilities: [{ keyword: 'FEEL NO PAIN', value: '5+' }, { keyword: 'LEADER' }],
    }
    render(<UnitCard data={data} context={makeContext()} />)
    expect(screen.getByText('FEEL NO PAIN 5+')).toBeInTheDocument()
    expect(screen.getByText('LEADER')).toBeInTheDocument()
  })

  it('still renders legacy string coreAbilities entries', () => {
    const data: UnitCardData = {
      ...mockUnit,
      coreAbilities: ['DEEP STRIKE', 'SCOUTS 6"'],
    }
    render(<UnitCard data={data} context={makeContext()} />)
    expect(screen.getByText('DEEP STRIKE')).toBeInTheDocument()
    expect(screen.getByText('SCOUTS 6"')).toBeInTheDocument()
  })

  it('does NOT render an INV stat when invSv is the placeholder "-+"', () => {
    const data: UnitCardData = {
      ...mockUnit,
      stats: { ...mockUnit.stats, invSv: '-+' },
    }
    render(<UnitCard data={data} context={makeContext()} />)
    expect(screen.queryByText('INV')).not.toBeInTheDocument()
  })

  it('does NOT render an INV stat when invSv is "-"', () => {
    const data: UnitCardData = {
      ...mockUnit,
      stats: { ...mockUnit.stats, invSv: '-' },
    }
    render(<UnitCard data={data} context={makeContext()} />)
    expect(screen.queryByText('INV')).not.toBeInTheDocument()
  })

  it('renders INV stat when invSv is a real value', () => {
    const data: UnitCardData = {
      ...mockUnit,
      stats: { ...mockUnit.stats, invSv: '4+' },
    }
    render(<UnitCard data={data} context={makeContext()} />)
    expect(screen.getByText('INV')).toBeInTheDocument()
    expect(screen.getByText('4+')).toBeInTheDocument()
  })

  // ── 11e attachment panels (PR #76 SUPPORT extraction wiring) ─────────────
  describe('leaderChips / supportChips attachment panels', () => {
    it('does not render attachment panels when both chip arrays are empty/missing', () => {
      render(<UnitCard data={mockUnit} context={makeContext()} />)
      expect(screen.queryByTestId('attachment-leaders')).not.toBeInTheDocument()
      expect(screen.queryByTestId('attachment-support')).not.toBeInTheDocument()
    })

    it('character datasheet — renders "Can lead (N)" panel from leaderChips', () => {
      const data: UnitCardData = {
        ...mockUnit,
        keywords: ['Character', 'Infantry'],
        leaderChips: [
          { id: 'datasheet:squad-a', title: 'Test Squad A' },
          { id: 'datasheet:squad-b', title: 'Test Squad B' },
        ],
      }
      render(<UnitCard data={data} context={makeContext()} />)
      const panel = screen.getByTestId('attachment-leaders')
      expect(panel).toBeInTheDocument()
      expect(panel.textContent).toMatch(/Can lead \(2\)/)
    })

    it('character datasheet — renders "Can support (N)" panel from supportChips', () => {
      const data: UnitCardData = {
        ...mockUnit,
        keywords: ['Character'],
        supportChips: [{ id: 'datasheet:tanks', title: 'Test Tanks' }],
      }
      render(<UnitCard data={data} context={makeContext()} />)
      const panel = screen.getByTestId('attachment-support')
      expect(panel).toBeInTheDocument()
      expect(panel.textContent).toMatch(/Can support \(1\)/)
    })

    it('non-character datasheet — renders "Leaders (N)" panel from leaderChips', () => {
      const data: UnitCardData = {
        ...mockUnit,
        keywords: ['Infantry'],
        leaderChips: [{ id: 'datasheet:cap', title: 'Test Captain' }],
      }
      render(<UnitCard data={data} context={makeContext()} />)
      const panel = screen.getByTestId('attachment-leaders')
      expect(panel).toBeInTheDocument()
      expect(panel.textContent).toMatch(/Leaders \(1\)/)
      expect(panel.textContent).not.toMatch(/Can lead/)
    })

    it('non-character datasheet — renders "Support models (N)" panel from supportChips', () => {
      const data: UnitCardData = {
        ...mockUnit,
        keywords: ['Vehicle'],
        supportChips: [{ id: 'datasheet:lt', title: 'Test Lieutenant' }],
      }
      render(<UnitCard data={data} context={makeContext()} />)
      const panel = screen.getByTestId('attachment-support')
      expect(panel).toBeInTheDocument()
      expect(panel.textContent).toMatch(/Support models \(1\)/)
    })

    it('panel chips render the title and call onContentClick(title) when clicked', () => {
      const onContentClick = vi.fn()
      const data: UnitCardData = {
        ...mockUnit,
        keywords: ['Character'],
        leaderChips: [{ id: 'datasheet:squad-x', title: 'Synthetic Squad X' }],
      }
      render(<UnitCard data={data} context={makeContext({ onContentClick })} />)
      const chip = screen.getByText('Synthetic Squad X')
      fireEvent.click(chip)
      expect(onContentClick).toHaveBeenCalledWith('Synthetic Squad X')
    })

    it('treats plural "characters" keyword the same as singular for label flip', () => {
      const data: UnitCardData = {
        ...mockUnit,
        keywords: ['Characters'],
        leaderChips: [{ id: 'a', title: 'A' }],
      }
      render(<UnitCard data={data} context={makeContext()} />)
      expect(screen.getByTestId('attachment-leaders').textContent).toMatch(/Can lead/)
    })

    it('does not render an empty panel when only one of the two chip arrays is populated', () => {
      const data: UnitCardData = {
        ...mockUnit,
        keywords: ['Character'],
        leaderChips: [{ id: 'a', title: 'Solo Lead Target' }],
        // supportChips intentionally omitted
      }
      render(<UnitCard data={data} context={makeContext()} />)
      expect(screen.getByTestId('attachment-leaders')).toBeInTheDocument()
      expect(screen.queryByTestId('attachment-support')).not.toBeInTheDocument()
    })
  })
})
