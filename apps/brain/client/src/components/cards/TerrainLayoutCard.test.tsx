import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TerrainLayoutCard } from './TerrainLayoutCard'
import type { CardContext } from './types'

const mockContext: CardContext = {
  highlightTerms: [],
  onContentClick: () => {},
  onDismiss: () => {},
}

describe('TerrainLayoutCard', () => {
  it('renders layout name', () => {
    render(
      <TerrainLayoutCard
        data={{ id: '1', name: 'BALANCED LAYOUT', description: 'Standard terrain placement.' }}
        context={mockContext}
      />,
    )
    expect(screen.getByText('BALANCED LAYOUT')).toBeInTheDocument()
  })

  it('renders description when no pdfImage', () => {
    render(
      <TerrainLayoutCard
        data={{ id: '1', name: 'Test', description: 'Terrain placed symmetrically.' }}
        context={mockContext}
      />,
    )
    expect(screen.getByText(/Terrain placed symmetrically/)).toBeInTheDocument()
  })

  it('renders image tag when pdfImage provided', () => {
    const { container } = render(
      <TerrainLayoutCard
        data={{
          id: '1',
          name: 'Test',
          description: 'Desc',
          pdfImage: { pdfName: 'chapter-approved-terrain', page: 3 },
        }}
        context={mockContext}
      />,
    )
    expect(container.querySelector('img')).toBeTruthy()
  })

  it('sets image src from pdfImage data', () => {
    const { container } = render(
      <TerrainLayoutCard
        data={{
          id: '1',
          name: 'Test',
          description: 'Desc',
          pdfImage: { pdfName: 'terrain-pdf', page: 7 },
        }}
        context={mockContext}
      />,
    )
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toContain('/pages/terrain-pdf/page-7.png')
  })

  it('shows quality flags', () => {
    render(
      <TerrainLayoutCard
        data={{ id: '1', name: 'Test', description: 'Desc', qualityFlags: ['content-inferred'] }}
        context={mockContext}
      />,
    )
    expect(screen.getByText('content-inferred')).toBeInTheDocument()
  })

  it('renders multiple quality flags', () => {
    render(
      <TerrainLayoutCard
        data={{
          id: '1',
          name: 'Test',
          description: 'Desc',
          qualityFlags: ['content-inferred', 'needs-review'],
        }}
        context={mockContext}
      />,
    )
    expect(screen.getByText('content-inferred')).toBeInTheDocument()
    expect(screen.getByText('needs-review')).toBeInTheDocument()
  })

  it('renders no quality flags section when qualityFlags is absent', () => {
    const { container } = render(
      <TerrainLayoutCard
        data={{ id: '1', name: 'Test', description: 'Desc' }}
        context={mockContext}
      />,
    )
    expect(container.querySelectorAll('.bg-amber-500\\/20').length).toBe(0)
  })

  it('does not render battle size badge (TerrainLayoutCard has no battleSize)', () => {
    render(
      <TerrainLayoutCard
        data={{ id: '1', name: 'Test', description: 'Desc' }}
        context={mockContext}
      />,
    )
    // Verify only one child in the header row (no badge)
    expect(screen.queryByText('Strike Force')).not.toBeInTheDocument()
  })

  it('shows Loading... placeholder when pdfImage is set', () => {
    render(
      <TerrainLayoutCard
        data={{
          id: '1',
          name: 'Test',
          description: 'Desc',
          pdfImage: { pdfName: 'terrain-pdf', page: 1 },
        }}
        context={mockContext}
      />,
    )
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
