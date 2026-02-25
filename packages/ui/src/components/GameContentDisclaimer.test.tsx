import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { GameContentDisclaimer } from './GameContentDisclaimer'

describe('GameContentDisclaimer', () => {
  it('renders BSData link with correct href', () => {
    render(<GameContentDisclaimer />)
    const link = screen.getByRole('link', { name: /bsdata/i })
    expect(link).toHaveAttribute('href', 'https://github.com/BSData')
  })

  it('contains Games Workshop attribution text', () => {
    render(<GameContentDisclaimer />)
    expect(screen.getByText(/copyright Games Workshop/)).toBeInTheDocument()
  })

  it('contains "not affiliated" disclaimer', () => {
    render(<GameContentDisclaimer />)
    expect(screen.getByText(/not affiliated with or endorsed by Games Workshop/)).toBeInTheDocument()
  })
})
