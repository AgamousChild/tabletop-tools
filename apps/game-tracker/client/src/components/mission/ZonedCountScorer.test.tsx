import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ZonedCountScorer } from './ZonedCountScorer'

const zones = [
  { id: 'home', label: 'Home objective', count: 0 },
  { id: 'nml1', label: "No Man's Land 1", count: 2 },
]

describe('ZonedCountScorer', () => {
  it('renders each zone with its label and count', () => {
    render(<ZonedCountScorer zones={zones} onChange={() => {}} />)
    expect(screen.getByText('Home objective')).toBeTruthy()
    expect(screen.getByText("No Man's Land 1")).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('calls onChange when a zone count changes', () => {
    const onChange = vi.fn()
    render(<ZonedCountScorer zones={zones} onChange={onChange} />)
    // Click increment on second zone
    const incrementBtns = screen.getAllByRole('button', { name: /increment/i })
    fireEvent.click(incrementBtns[1]!)
    expect(onChange).toHaveBeenCalledWith([
      { id: 'home', label: 'Home objective', count: 0 },
      { id: 'nml1', label: "No Man's Land 1", count: 3 },
    ])
  })
})
