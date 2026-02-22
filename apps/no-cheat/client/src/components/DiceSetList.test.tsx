import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DiceSetList } from './DiceSetList'

const fakeSets = [
  { id: '1', name: 'Red Dragons', userId: 'u1', createdAt: 2000 },
  { id: '2', name: 'Blue Crystals', userId: 'u1', createdAt: 1000 },
]

describe('DiceSetList', () => {
  it('shows empty state when there are no dice sets', () => {
    render(<DiceSetList diceSets={[]} onSelect={() => {}} />)
    expect(screen.getByText(/no dice sets yet/i)).toBeInTheDocument()
  })

  it('renders each dice set name', () => {
    render(<DiceSetList diceSets={fakeSets} onSelect={() => {}} />)
    expect(screen.getByText('Red Dragons')).toBeInTheDocument()
    expect(screen.getByText('Blue Crystals')).toBeInTheDocument()
  })

  it('calls onSelect with the dice set when clicked', async () => {
    const onSelect = vi.fn()
    render(<DiceSetList diceSets={fakeSets} onSelect={onSelect} />)
    screen.getByText('Red Dragons').click()
    expect(onSelect).toHaveBeenCalledWith(fakeSets[0])
  })
})
