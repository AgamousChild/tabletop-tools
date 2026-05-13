import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BalanceCard } from './BalanceCard'
import type { BalanceCardData, CardContext } from './types'

const mockContext: CardContext = {
  highlightTerms: [],
  onContentClick: vi.fn(),
  onDismiss: vi.fn(),
}

const mockData: BalanceCardData = {
  id: 'balance-001',
  name: 'Rapid Ingress Cost Increase',
  description: 'The CP cost of Rapid Ingress has been increased from 1 to 2.',
}

describe('BalanceCard', () => {
  it('renders name/title', () => {
    render(<BalanceCard data={mockData} context={mockContext} />)
    expect(screen.getByText('Rapid Ingress Cost Increase')).toBeInTheDocument()
  })

  it('renders body content (description)', () => {
    render(<BalanceCard data={mockData} context={mockContext} />)
    expect(screen.getByText(/CP cost of Rapid Ingress/)).toBeInTheDocument()
  })

  it('handles missing optional fields without crashing', () => {
    const minimalData: BalanceCardData = {
      id: 'balance-002',
      name: 'Minimal Balance',
      description: 'A balance update.',
    }
    render(<BalanceCard data={minimalData} context={mockContext} />)
    expect(screen.getByText('Minimal Balance')).toBeInTheDocument()
    expect(screen.getByText('A balance update.')).toBeInTheDocument()
  })

  it('shows quality flags when present', () => {
    const data: BalanceCardData = { ...mockData, qualityFlags: ['Dataslate', 'Season 3'] }
    render(<BalanceCard data={data} context={mockContext} />)
    expect(screen.getByText('Dataslate')).toBeInTheDocument()
    expect(screen.getByText('Season 3')).toBeInTheDocument()
  })

  it('renders effectiveDate in footer when present', () => {
    const data: BalanceCardData = { ...mockData, effectiveDate: '2024-06-15' }
    render(<BalanceCard data={data} context={mockContext} />)
    expect(screen.getByText('2024-06-15')).toBeInTheDocument()
  })

  it('does not render footer when effectiveDate is absent', () => {
    render(<BalanceCard data={mockData} context={mockContext} />)
    expect(screen.queryByText('2024-06-15')).not.toBeInTheDocument()
  })
})
