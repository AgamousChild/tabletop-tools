import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeploymentZoneCard } from './DeploymentZoneCard'
import type { CardContext } from './types'

const mockContext: CardContext = { highlightTerms: [], onContentClick: () => {}, onDismiss: () => {} }

describe('DeploymentZoneCard', () => {
  it('renders zone name', () => {
    render(<DeploymentZoneCard data={{ id: '1', name: 'DAWN OF WAR', description: 'Standard deployment.' }} context={mockContext} />)
    expect(screen.getByText('DAWN OF WAR')).toBeInTheDocument()
  })

  it('renders battle size badge when provided', () => {
    render(<DeploymentZoneCard data={{ id: '1', name: 'Test', description: 'Desc', battleSize: 'Strike Force' }} context={mockContext} />)
    expect(screen.getByText('Strike Force')).toBeInTheDocument()
  })

  it('renders description when no pdfImages', () => {
    render(<DeploymentZoneCard data={{ id: '1', name: 'Test', description: 'Standard 12" deployment zones.' }} context={mockContext} />)
    expect(screen.getAllByText(/12" deployment/).length).toBeGreaterThan(0)
  })

  it('shows page tabs for multiple pages', () => {
    render(<DeploymentZoneCard data={{
      id: '1', name: 'CRUCIBLE', description: 'Desc',
      pdfImages: [
        { pdfName: 'chapter-approved-deployment-zones', page: 2 },
        { pdfName: 'chapter-approved-deployment-zones', page: 1 },
      ],
    }} context={mockContext} />)
    // Shows tab buttons for Strike Force and Incursion
    expect(screen.getByText(/Strike Force/)).toBeInTheDocument()
    expect(screen.getByText(/Incursion/)).toBeInTheDocument()
    // Only one image rendered at a time (the active tab)
    const { container } = render(<DeploymentZoneCard data={{
      id: '2', name: 'TEST', description: 'D',
      pdfImages: [
        { pdfName: 'x', page: 1 },
        { pdfName: 'x', page: 2 },
      ],
    }} context={mockContext} />)
    expect(container.querySelectorAll('img').length).toBe(1)
  })

  it('renders single image for asymmetric zones without tabs', () => {
    render(<DeploymentZoneCard data={{
      id: '1', name: 'TIP OF THE SPEAR', description: 'Desc',
      pdfImages: [{ pdfName: 'chapter-approved-deployment-zones', page: 13 }],
    }} context={mockContext} />)
    expect(screen.getByText(/Asymmetric War/)).toBeInTheDocument()
    expect(screen.queryByText(/Incursion/)).not.toBeInTheDocument()
  })

  it('shows quality flags', () => {
    render(<DeploymentZoneCard data={{ id: '1', name: 'Test', description: 'Desc', qualityFlags: ['content-inferred'] }} context={mockContext} />)
    expect(screen.getByText('content-inferred')).toBeInTheDocument()
  })
})
