import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChecklistScorer } from './ChecklistScorer'

const items = [
  { id: 'a', label: 'Destroyed >=1 enemy unit', checked: false },
  { id: 'b', label: 'Destroyed more than opponent', checked: true },
]

describe('ChecklistScorer', () => {
  it('renders all checklist items', () => {
    render(<ChecklistScorer items={items} onChange={() => {}} />)
    expect(screen.getByText('Destroyed >=1 enemy unit')).toBeTruthy()
    expect(screen.getByText('Destroyed more than opponent')).toBeTruthy()
  })

  it('shows checked state correctly', () => {
    render(<ChecklistScorer items={items} onChange={() => {}} />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false)
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true)
  })

  it('calls onChange with toggled items', () => {
    const onChange = vi.fn()
    render(<ChecklistScorer items={items} onChange={onChange} />)
    fireEvent.click(screen.getAllByRole('checkbox')[0]!)
    expect(onChange).toHaveBeenCalledWith([
      { id: 'a', label: 'Destroyed >=1 enemy unit', checked: true },
      { id: 'b', label: 'Destroyed more than opponent', checked: true },
    ])
  })
})
