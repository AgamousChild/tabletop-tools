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

  it('does not render battle size badge when absent', () => {
    render(<DeploymentZoneCard data={{ id: '1', name: 'Test', description: 'Desc' }} context={mockContext} />)
    expect(screen.queryByText('Strike Force')).not.toBeInTheDocument()
  })

  it('renders description when no pdfImage', () => {
    render(<DeploymentZoneCard data={{ id: '1', name: 'Test', description: 'Standard 12" deployment zones.' }} context={mockContext} />)
    expect(screen.getByText(/12" deployment/)).toBeInTheDocument()
  })

  it('renders image tag when pdfImage provided', () => {
    const { container } = render(<DeploymentZoneCard data={{ id: '1', name: 'Test', description: 'Desc', pdfImage: { pdfName: 'chapter-approved-deployment-zones', page: 1 } }} context={mockContext} />)
    expect(container.querySelector('img')).toBeTruthy()
  })

  it('sets image src from pdfImage data', () => {
    const { container } = render(<DeploymentZoneCard data={{ id: '1', name: 'Test', description: 'Desc', pdfImage: { pdfName: 'my-pdf', page: 5 } }} context={mockContext} />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toContain('/pages/my-pdf/page-5.png')
  })

  it('shows quality flags', () => {
    render(<DeploymentZoneCard data={{ id: '1', name: 'Test', description: 'Desc', qualityFlags: ['content-inferred'] }} context={mockContext} />)
    expect(screen.getByText('content-inferred')).toBeInTheDocument()
  })

  it('renders multiple quality flags', () => {
    render(<DeploymentZoneCard data={{ id: '1', name: 'Test', description: 'Desc', qualityFlags: ['content-inferred', 'needs-review'] }} context={mockContext} />)
    expect(screen.getByText('content-inferred')).toBeInTheDocument()
    expect(screen.getByText('needs-review')).toBeInTheDocument()
  })

  it('renders no quality flags section when qualityFlags is absent', () => {
    const { container } = render(<DeploymentZoneCard data={{ id: '1', name: 'Test', description: 'Desc' }} context={mockContext} />)
    expect(container.querySelectorAll('.bg-amber-500\\/20').length).toBe(0)
  })

  it('shows Loading... placeholder when pdfImage is set', () => {
    render(<DeploymentZoneCard data={{ id: '1', name: 'Test', description: 'Desc', pdfImage: { pdfName: 'my-pdf', page: 1 } }} context={mockContext} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
