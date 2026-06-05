import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CardLayout } from '../../../../shared/card-layout-types'
import { LayoutRenderer } from './Renderer'

// ── Helper ────────────────────────────────────────────────────────────────────

function makeLayout(...nodes: CardLayout['nodes']): CardLayout {
  return { version: 1, nodes }
}

// ── Primitive rendering ───────────────────────────────────────────────────────

describe('LayoutRenderer', () => {
  describe('header node', () => {
    it('renders unit title', () => {
      render(<LayoutRenderer layout={makeLayout({ type: 'header', title: 'Warboss' })} />)
      expect(screen.getByText('Warboss')).toBeInTheDocument()
    })

    it('renders subtitle when present', () => {
      render(
        <LayoutRenderer
          layout={makeLayout({ type: 'header', title: 'Warboss', subtitle: 'ORKS' })}
        />,
      )
      expect(screen.getByText('ORKS')).toBeInTheDocument()
    })

    it('renders badge when present', () => {
      render(
        <LayoutRenderer
          layout={makeLayout({
            type: 'header',
            title: 'Warboss',
            badge: '1 model: 75pts',
            badgeColor: 'amber',
          })}
        />,
      )
      expect(screen.getByText('1 model: 75pts')).toBeInTheDocument()
    })

    it('does not render badge when absent', () => {
      render(<LayoutRenderer layout={makeLayout({ type: 'header', title: 'Warboss' })} />)
      expect(screen.queryByText('pts')).not.toBeInTheDocument()
    })
  })

  describe('stat-bar node', () => {
    const statLayout = makeLayout({
      type: 'stat-bar',
      stats: [
        { label: 'M', value: '6"' },
        { label: 'T', value: '5' },
        { label: 'SV', value: '4+' },
        { label: 'W', value: '6' },
        { label: 'LD', value: '6+' },
        { label: 'OC', value: '1' },
        { label: 'INV', value: '5+' },
      ],
    })

    it('renders all stat labels', () => {
      render(<LayoutRenderer layout={statLayout} />)
      expect(screen.getByTestId('stat-bar')).toBeInTheDocument()
      expect(screen.getByText('M')).toBeInTheDocument()
      expect(screen.getByText('T')).toBeInTheDocument()
      expect(screen.getByText('SV')).toBeInTheDocument()
      expect(screen.getByText('W')).toBeInTheDocument()
      expect(screen.getByText('LD')).toBeInTheDocument()
      expect(screen.getByText('OC')).toBeInTheDocument()
      expect(screen.getByText('INV')).toBeInTheDocument()
    })

    it('renders all stat values', () => {
      render(<LayoutRenderer layout={statLayout} />)
      expect(screen.getByText('6"')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
      expect(screen.getAllByText('4+').length).toBeGreaterThan(0)
    })
  })

  describe('table node', () => {
    const tableLayout = makeLayout({
      type: 'table',
      label: 'RANGED WEAPONS',
      accentColor: 'amber',
      columns: ['Weapon', 'Range', 'A', 'BS/WS', 'S', 'AP', 'D'],
      rows: [
        {
          cells: ['Kombi-weapon', '24"', '1', '5+', '4', '0', '1'],
          tags: ['RAPID FIRE 1'],
        },
      ],
    })

    it('renders the table label', () => {
      render(<LayoutRenderer layout={tableLayout} />)
      expect(screen.getByText('RANGED WEAPONS')).toBeInTheDocument()
    })

    it('renders column headers', () => {
      render(<LayoutRenderer layout={tableLayout} />)
      expect(screen.getByText('Weapon')).toBeInTheDocument()
      expect(screen.getByText('Range')).toBeInTheDocument()
    })

    it('renders weapon name in first cell', () => {
      render(<LayoutRenderer layout={tableLayout} />)
      expect(screen.getByText('Kombi-weapon')).toBeInTheDocument()
    })

    it('renders ability tags in first cell', () => {
      render(<LayoutRenderer layout={tableLayout} />)
      expect(screen.getByText('RAPID FIRE 1')).toBeInTheDocument()
    })

    it('renders empty table as nothing when no rows', () => {
      render(
        <LayoutRenderer
          layout={makeLayout({
            type: 'table',
            label: 'MELEE WEAPONS',
            columns: ['Weapon'],
            rows: [],
          })}
        />,
      )
      expect(screen.queryByText('MELEE WEAPONS')).not.toBeInTheDocument()
    })
  })

  describe('heading node', () => {
    it('renders heading text', () => {
      render(<LayoutRenderer layout={makeLayout({ type: 'heading', text: 'ABILITIES' })} />)
      expect(screen.getByText('ABILITIES')).toBeInTheDocument()
    })
  })

  describe('key-value node', () => {
    it('renders label and value', () => {
      render(
        <LayoutRenderer
          layout={makeLayout({ type: 'key-value', label: 'Composition', value: '1 Warboss' })}
        />,
      )
      expect(screen.getByText(/Composition/)).toBeInTheDocument()
      expect(screen.getByText('1 Warboss')).toBeInTheDocument()
    })
  })

  describe('pill-list node', () => {
    it('renders label and pills', () => {
      render(
        <LayoutRenderer
          layout={makeLayout({
            type: 'pill-list',
            label: 'Keywords',
            pills: [
              { text: 'Infantry', variant: 'default' },
              { text: 'ORKS', variant: 'faction' },
            ],
          })}
        />,
      )
      expect(screen.getByText('Keywords:')).toBeInTheDocument()
      expect(screen.getByText('Infantry')).toBeInTheDocument()
      expect(screen.getByText('ORKS')).toBeInTheDocument()
    })

    it('renders nothing when pills array is empty', () => {
      render(<LayoutRenderer layout={makeLayout({ type: 'pill-list', pills: [] })} />)
      // No pill elements rendered — no spans with pill classes
      expect(document.querySelectorAll('span.rounded').length).toBe(0)
    })
  })

  describe('ability node', () => {
    it('renders name and description', () => {
      render(
        <LayoutRenderer
          layout={makeLayout({
            type: 'ability',
            name: 'Waaagh!',
            description: 'Add 1 to Attacks.',
          })}
        />,
      )
      expect(screen.getByText('Waaagh!')).toBeInTheDocument()
      expect(screen.getByText('Add 1 to Attacks.')).toBeInTheDocument()
    })
  })

  describe('divider node', () => {
    it('renders an <hr> element', () => {
      const { container } = render(<LayoutRenderer layout={makeLayout({ type: 'divider' })} />)
      expect(container.querySelector('hr')).toBeInTheDocument()
    })
  })

  describe('text node', () => {
    it('renders text value', () => {
      render(<LayoutRenderer layout={makeLayout({ type: 'text', value: 'Some ability text' })} />)
      expect(screen.getByText('Some ability text')).toBeInTheDocument()
    })
  })

  describe('box node', () => {
    it('renders children recursively', () => {
      render(
        <LayoutRenderer
          layout={makeLayout({
            type: 'box',
            direction: 'column',
            children: [
              { type: 'heading', text: 'INNER HEADING' },
              { type: 'text', value: 'Inner text' },
            ],
          })}
        />,
      )
      expect(screen.getByText('INNER HEADING')).toBeInTheDocument()
      expect(screen.getByText('Inner text')).toBeInTheDocument()
    })

    it('renders row direction with flex-row class', () => {
      const { container } = render(
        <LayoutRenderer
          layout={makeLayout({
            type: 'box',
            direction: 'row',
            children: [{ type: 'text', value: 'A' }],
          })}
        />,
      )
      // The box div should have flex-row
      const rowDiv = container.querySelector('.flex-row')
      expect(rowDiv).toBeInTheDocument()
    })
  })

  describe('full datasheet layout', () => {
    const fullLayout: CardLayout = {
      version: 1,
      nodes: [
        {
          type: 'header',
          title: 'Warboss',
          subtitle: 'ORKS',
          badge: '1 model: 75pts',
          badgeColor: 'amber',
        },
        {
          type: 'stat-bar',
          stats: [
            { label: 'M', value: '6"' },
            { label: 'T', value: '5' },
            { label: 'SV', value: '4+' },
            { label: 'W', value: '6' },
            { label: 'LD', value: '6+' },
            { label: 'OC', value: '1' },
            { label: 'INV', value: '5+' },
          ],
        },
        {
          type: 'box',
          direction: 'row',
          children: [
            {
              type: 'box',
              direction: 'column',
              children: [
                {
                  type: 'table',
                  label: 'RANGED WEAPONS',
                  accentColor: 'amber',
                  columns: ['Weapon', 'Range', 'A', 'BS/WS', 'S', 'AP', 'D'],
                  rows: [
                    {
                      cells: ['Kombi-weapon', '24"', '1', '5+', '4', '0', '1'],
                      tags: ['RAPID FIRE 1'],
                    },
                  ],
                },
                {
                  type: 'table',
                  label: 'MELEE WEAPONS',
                  accentColor: 'red',
                  columns: ['Weapon', 'Range', 'A', 'BS/WS', 'S', 'AP', 'D'],
                  rows: [{ cells: ['Big choppa', 'Melee', '4', '3+', '7', '-2', '2'] }],
                },
              ],
            },
            {
              type: 'box',
              direction: 'column',
              children: [
                { type: 'heading', text: 'ABILITIES', accentColor: 'green' },
                { type: 'pill-list', pills: [{ text: 'Grenades', variant: 'green' }] },
                { type: 'ability', name: 'Waaagh!', description: 'Add 1 to Attacks.' },
              ],
            },
          ],
        },
        {
          type: 'pill-list',
          label: 'Keywords',
          pills: [
            { text: 'Infantry', variant: 'default' },
            { text: 'ORKS', variant: 'faction' },
          ],
        },
        { type: 'divider' },
        {
          type: 'box',
          direction: 'column',
          children: [
            { type: 'key-value', label: 'Composition', value: '1 Warboss' },
            { type: 'key-value', label: 'Loadout', value: 'kombi-weapon; big choppa' },
          ],
        },
      ],
    }

    it('renders header, stat bar, weapons tables, abilities, keywords, and footer', () => {
      render(<LayoutRenderer layout={fullLayout} />)

      // Header
      expect(screen.getByText('Warboss')).toBeInTheDocument()
      expect(screen.getByText('1 model: 75pts')).toBeInTheDocument()

      // Stats
      expect(screen.getByTestId('stat-bar')).toBeInTheDocument()
      expect(screen.getByText('INV')).toBeInTheDocument()

      // Weapons
      expect(screen.getByText('RANGED WEAPONS')).toBeInTheDocument()
      expect(screen.getByText('Kombi-weapon')).toBeInTheDocument()
      expect(screen.getByText('RAPID FIRE 1')).toBeInTheDocument()
      expect(screen.getByText('MELEE WEAPONS')).toBeInTheDocument()
      expect(screen.getByText('Big choppa')).toBeInTheDocument()

      // Abilities
      expect(screen.getByText('ABILITIES')).toBeInTheDocument()
      expect(screen.getByText('Waaagh!')).toBeInTheDocument()

      // Keywords
      expect(screen.getByText('Keywords:')).toBeInTheDocument()
      expect(screen.getByText('Infantry')).toBeInTheDocument()
      // 'ORKS' appears in the header subtitle AND the faction keyword pill
      expect(screen.getAllByText('ORKS').length).toBeGreaterThanOrEqual(2)

      // Footer
      expect(screen.getByText(/Composition/)).toBeInTheDocument()
      expect(screen.getByText('1 Warboss')).toBeInTheDocument()
      expect(screen.getByText(/Loadout/)).toBeInTheDocument()
    })
  })
})
