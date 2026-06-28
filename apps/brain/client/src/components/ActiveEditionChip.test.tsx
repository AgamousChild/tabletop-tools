import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ActiveEditionChip } from './ActiveEditionChip'

describe('ActiveEditionChip', () => {
  it('renders the current edition value for 11th', () => {
    render(<ActiveEditionChip edition="11th" />)
    const chip = screen.getByTestId('active-edition-chip')
    expect(chip).toBeInTheDocument()
    expect(chip.textContent).toBe('Edition: 11th')
  })

  it('renders the current edition value for 10th', () => {
    render(<ActiveEditionChip edition="10th" />)
    expect(screen.getByTestId('active-edition-chip').textContent).toBe('Edition: 10th')
  })

  it('renders the current edition value for 9th', () => {
    render(<ActiveEditionChip edition="9th" />)
    expect(screen.getByTestId('active-edition-chip').textContent).toBe('Edition: 9th')
  })

  it('renders nothing when edition is "any"', () => {
    const { container } = render(<ActiveEditionChip edition="any" />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('active-edition-chip')).not.toBeInTheDocument()
  })
})
