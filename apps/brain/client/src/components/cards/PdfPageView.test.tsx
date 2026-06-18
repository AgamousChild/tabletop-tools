import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PdfPageView } from './PdfPageView'

const defaultProps = {
  pdfName: 'core-rules',
  pageNumber: 25,
  highlightText: 'Devastating Wounds',
  title: 'DEVASTATING WOUNDS',
  onDismiss: vi.fn(),
}

describe('PdfPageView', () => {
  it('renders image with correct src URL', () => {
    render(<PdfPageView {...defaultProps} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', '/brain/api/pages/core-rules/page-25.png')
  })

  it('renders the rule title', () => {
    render(<PdfPageView {...defaultProps} />)
    expect(screen.getByText('DEVASTATING WOUNDS')).toBeInTheDocument()
  })

  it('renders PDF name in the page info', () => {
    render(<PdfPageView {...defaultProps} />)
    expect(screen.getByText(/core-rules/i)).toBeInTheDocument()
  })

  it('renders page number in the page info', () => {
    render(<PdfPageView {...defaultProps} />)
    expect(screen.getByText(/page 25/i)).toBeInTheDocument()
  })

  it('has a close button', () => {
    render(<PdfPageView {...defaultProps} />)
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })

  it('calls onDismiss when close button is clicked', () => {
    const onDismiss = vi.fn()
    render(<PdfPageView {...defaultProps} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows loading state initially', () => {
    render(<PdfPageView {...defaultProps} />)
    expect(screen.getByTestId('pdf-loading')).toBeInTheDocument()
  })

  it('hides loading state after image loads', () => {
    render(<PdfPageView {...defaultProps} />)
    const img = screen.getByRole('img')
    fireEvent.load(img)
    expect(screen.queryByTestId('pdf-loading')).not.toBeInTheDocument()
  })

  it('shows error state on image load failure', () => {
    render(<PdfPageView {...defaultProps} />)
    const img = screen.getByRole('img')
    fireEvent.error(img)
    expect(screen.getByTestId('pdf-error')).toBeInTheDocument()
  })

  it('hides the image on error', () => {
    render(<PdfPageView {...defaultProps} />)
    const img = screen.getByRole('img')
    fireEvent.error(img)
    expect(img).toHaveStyle({ display: 'none' })
  })

  it('uses VITE_BRAIN_API_URL env var for image src when set', () => {
    // @ts-expect-error setting env var for test
    import.meta.env.VITE_BRAIN_API_URL = 'https://brain.example.com'
    render(<PdfPageView {...defaultProps} />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toContain('pages/core-rules/page-25.png')
    // @ts-expect-error cleanup
    import.meta.env.VITE_BRAIN_API_URL = undefined
  })

  it('does not show errata section when errata prop is absent', () => {
    render(<PdfPageView {...defaultProps} />)
    expect(screen.queryByText(/Errata & FAQ/i)).not.toBeInTheDocument()
  })

  it('shows errata section when errata entries are provided', () => {
    const errata = [
      {
        nodeId: 'e1',
        title: 'FAQ Q1',
        content: 'Yes, it works.',
        source: { type: 'pdf', title: 'Chapter Approved', page: 12 },
      },
    ]
    render(<PdfPageView {...defaultProps} errata={errata} />)
    expect(screen.getByText('Errata & FAQ')).toBeInTheDocument()
  })

  it('reveals errata entry content when section is expanded', () => {
    const errata = [
      {
        nodeId: 'e1',
        title: 'FAQ Q1',
        content: 'Yes, it works.',
        source: { type: 'pdf', title: 'Chapter Approved', page: 12 },
      },
    ]
    render(<PdfPageView {...defaultProps} errata={errata} />)
    fireEvent.click(screen.getByText('Errata & FAQ'))
    expect(screen.getByText('FAQ Q1')).toBeInTheDocument()
    expect(screen.getByText('Yes, it works.')).toBeInTheDocument()
  })
})
