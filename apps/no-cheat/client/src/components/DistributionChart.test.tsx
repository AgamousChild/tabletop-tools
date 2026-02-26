import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { DistributionChart } from './DistributionChart'

describe('DistributionChart', () => {
  it('renders all 6 pip labels', () => {
    render(<DistributionChart distribution={new Map()} />)
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument()
    }
  })

  it('shows dash when no data', () => {
    render(<DistributionChart distribution={new Map()} />)
    const dashes = screen.getAllByText('—')
    expect(dashes).toHaveLength(6)
  })

  it('shows counts and percentages when data present', () => {
    const dist = new Map([
      [1, 5],
      [2, 3],
      [3, 4],
      [4, 6],
      [5, 2],
      [6, 4],
    ])
    const { container } = render(<DistributionChart distribution={dist} />)
    // Total = 24, pip 4 has 6 → 25.0%
    expect(screen.getByText('25.0%')).toBeInTheDocument()
    // Check that all 6 rows render (6 pip labels)
    const rows = container.querySelectorAll('.flex.items-center.gap-2')
    expect(rows).toHaveLength(6)
  })

  it('shows 0 count for pips with no rolls', () => {
    const dist = new Map([[1, 10]])
    render(<DistributionChart distribution={dist} />)
    // Pips 2-6 should show count 0
    const zeros = screen.getAllByText('0')
    expect(zeros).toHaveLength(5)
  })
})
