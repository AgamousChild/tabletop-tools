import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CommunityCard } from './CommunityCard'
import type { CommunityCardData, CardContext } from './types'

const mockContext: CardContext = {
  highlightTerms: [],
  onContentClick: vi.fn(),
  onDismiss: vi.fn(),
}

const mockData: CommunityCardData = {
  id: 'community-001',
  name: 'Advance and Shoot Timing',
  description: 'You must declare Advance before shooting, not after resolving the move.',
}

describe('CommunityCard', () => {
  it('renders name/title', () => {
    render(<CommunityCard data={mockData} context={mockContext} />)
    expect(screen.getByText('Advance and Shoot Timing')).toBeInTheDocument()
  })

  it('renders body content (description)', () => {
    render(<CommunityCard data={mockData} context={mockContext} />)
    expect(screen.getByText(/declare Advance before shooting/)).toBeInTheDocument()
  })

  it('handles missing optional fields without crashing', () => {
    const minimalData: CommunityCardData = {
      id: 'community-002',
      name: 'Minimal Community',
      description: 'A community ruling.',
    }
    render(<CommunityCard data={minimalData} context={mockContext} />)
    expect(screen.getByText('Minimal Community')).toBeInTheDocument()
    expect(screen.getByText('A community ruling.')).toBeInTheDocument()
  })

  it('shows quality flags when present', () => {
    const data: CommunityCardData = { ...mockData, qualityFlags: ['Community Consensus', 'Disputed'] }
    render(<CommunityCard data={data} context={mockContext} />)
    expect(screen.getByText('Community Consensus')).toBeInTheDocument()
    expect(screen.getByText('Disputed')).toBeInTheDocument()
  })

  it('renders sourceAttribution in footer when present', () => {
    const data: CommunityCardData = { ...mockData, sourceAttribution: 'r/WarhammerCompetitive — 2024' }
    render(<CommunityCard data={data} context={mockContext} />)
    expect(screen.getByText('r/WarhammerCompetitive — 2024')).toBeInTheDocument()
  })

  it('does not render footer when sourceAttribution is absent', () => {
    render(<CommunityCard data={mockData} context={mockContext} />)
    expect(screen.queryByText('r/WarhammerCompetitive')).not.toBeInTheDocument()
  })
})
