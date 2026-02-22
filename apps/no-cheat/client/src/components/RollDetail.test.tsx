import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RollDetail } from './RollDetail'

const rolls = [
  { id: 'r1', sessionId: 's1', pipValues: JSON.stringify([3, 5, 2]), createdAt: 1000 },
  { id: 'r2', sessionId: 's1', pipValues: JSON.stringify([6, 1, 4]), createdAt: 2000 },
]

describe('RollDetail', () => {
  it('renders a row for each roll', () => {
    render(<RollDetail rolls={rolls} />)
    expect(screen.getByText(/roll 1/i)).toBeInTheDocument()
    expect(screen.getByText(/roll 2/i)).toBeInTheDocument()
  })

  it('displays pip values for each roll', () => {
    render(<RollDetail rolls={rolls} />)
    expect(screen.getByText('3, 5, 2')).toBeInTheDocument()
    expect(screen.getByText('6, 1, 4')).toBeInTheDocument()
  })

  it('shows empty state when there are no rolls', () => {
    render(<RollDetail rolls={[]} />)
    expect(screen.getByText(/no rolls recorded/i)).toBeInTheDocument()
  })
})
