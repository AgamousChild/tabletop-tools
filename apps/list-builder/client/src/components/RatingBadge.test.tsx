import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { RatingBadge } from './RatingBadge'

describe('RatingBadge', () => {
  it('shows dash for null rating', () => {
    render(<RatingBadge rating={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows dash for undefined rating', () => {
    render(<RatingBadge rating={undefined} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows S with green background', () => {
    const { container } = render(<RatingBadge rating="S" />)
    expect(screen.getByText('S')).toBeInTheDocument()
    expect(container.querySelector('.bg-emerald-500')).not.toBeNull()
  })

  it('shows B with amber background', () => {
    const { container } = render(<RatingBadge rating="B" />)
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(container.querySelector('.bg-amber-400')).not.toBeNull()
  })

  it('shows D with red background', () => {
    const { container } = render(<RatingBadge rating="D" />)
    expect(screen.getByText('D')).toBeInTheDocument()
    expect(container.querySelector('.bg-red-500')).not.toBeNull()
  })
})
