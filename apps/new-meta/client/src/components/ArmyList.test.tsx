import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ArmyList, type ArmyPackage, type ArmyUnit } from './ArmyList'

function unit(over: Partial<ArmyUnit> = {}): ArmyUnit {
  return { name: 'Abominant', role: 'Character', models: 1, points: 75, wargear: [], ...over }
}

function pkg(units: ArmyUnit[], totalPoints = 2000): ArmyPackage {
  return {
    parseStatus: 'ok',
    meta: { name: 'Test List', totalPoints, battleSize: 'Strike Force' },
    list: { factionName: 'Genestealer Cults', units },
  }
}

describe('ArmyList', () => {
  it('collapses identical units into a single counted row', () => {
    render(<ArmyList pkg={pkg([unit(), unit(), unit()])} layout="roster" />)
    expect(screen.getByText('×3')).toBeInTheDocument()
    // Points are summed across the collapsed entry, not shown per copy. Appears
    // twice here — once as the row total, once as the section subtotal — because
    // this army has a single Character entry.
    expect(screen.getAllByText('225')).toHaveLength(2)
    // The three copies are one row, not three.
    expect(screen.getAllByText('Abominant')).toHaveLength(1)
  })

  it('keeps units apart when an enhancement makes them different', () => {
    render(
      <ArmyList
        pkg={pkg([unit(), unit({ enhancement: 'Predatory Instincts', points: 95 })])}
        layout="roster"
      />,
    )
    expect(screen.queryByText('×2')).not.toBeInTheDocument()
    expect(screen.getByText('Predatory Instincts')).toBeInTheDocument()
  })

  it('keeps units apart when their wargear differs', () => {
    render(
      <ArmyList
        pkg={pkg([unit({ wargear: ['Power sledgehammer'] }), unit({ wargear: ['Autopistol'] })])}
        layout="roster"
      />,
    )
    expect(screen.queryByText('×2')).not.toBeInTheDocument()
  })

  it('groups units under their battlefield role in printed-list order', () => {
    render(
      <ArmyList
        pkg={pkg([
          unit({ name: 'Aberrants', role: 'Other', points: 135 }),
          unit({ name: 'Patriarch', role: 'Character', points: 100 }),
          unit({ name: 'Acolytes', role: 'Battleline', points: 65 }),
        ])}
        layout="roster"
      />,
    )
    const headings = screen.getAllByText(/Characters|Battleline|Other Datasheets/)
    expect(headings.map((h) => h.textContent)).toEqual([
      'Characters',
      'Battleline',
      'Other Datasheets',
    ])
  })

  it('subtotals each role section', () => {
    render(
      <ArmyList
        pkg={pkg([
          unit({ points: 100 }),
          unit({ name: 'Acolytes', role: 'Battleline', points: 65 }),
          unit({ name: 'Acolytes B', role: 'Battleline', points: 70 }),
        ])}
        layout="roster"
      />,
    )
    // Battleline: 65 + 70
    expect(screen.getByText('135')).toBeInTheDocument()
  })

  it('totals the army in the ledger layout', () => {
    const { container } = render(
      <ArmyList
        pkg={pkg([unit({ points: 100 }), unit({ name: 'X', points: 65 })])}
        layout="ledger"
      />,
    )
    const totalRow = screen.getByText('Total').closest('tr')
    expect(totalRow).not.toBeNull()
    expect(totalRow!.textContent).toContain('165')
    // The foot total is the last row of the table, not a section subtotal.
    expect(container.querySelector('tbody')!.lastElementChild).toBe(totalRow)
  })

  it('flags a shortfall against the list’s declared total', () => {
    render(<ArmyList pkg={pkg([unit({ points: 100 })], 2000)} layout="ledger" />)
    // 100 spent against a declared 2000 — show both, not just the sum.
    expect(screen.getByText(/\/ 2000/)).toBeInTheDocument()
  })

  it('renders every unit in the tiles layout', () => {
    render(
      <ArmyList
        pkg={pkg([unit({ name: 'Patriarch' }), unit({ name: 'Biophagus', role: 'Character' })])}
        layout="tiles"
      />,
    )
    expect(screen.getByText('Patriarch')).toBeInTheDocument()
    expect(screen.getByText('Biophagus')).toBeInTheDocument()
  })

  it('falls back to a message when the parse produced no units', () => {
    render(<ArmyList pkg={pkg([])} layout="roster" />)
    expect(screen.getByText(/could not be read/i)).toBeInTheDocument()
  })
})
