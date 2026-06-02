import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TierScorer } from './TierScorer'

const tiers = [
  { id: 't0', label: '0 VP — None', value: 0 },
  { id: 't1', label: '5 VP — Basic', value: 5 },
  { id: 't2', label: '10 VP — Advanced', value: 10 },
]

describe('TierScorer', () => {
  it('renders all tier options', () => {
    render(<TierScorer tiers={tiers} selected={null} onChange={() => {}} />)
    expect(screen.getByText('0 VP — None')).toBeTruthy()
    expect(screen.getByText('10 VP — Advanced')).toBeTruthy()
  })

  it('marks selected tier', () => {
    render(<TierScorer tiers={tiers} selected="t1" onChange={() => {}} />)
    const selected = screen.getByText('5 VP — Basic').closest('button')
    expect(selected?.className).toContain('amber')
  })

  it('calls onChange with selected tier id', () => {
    const onChange = vi.fn()
    render(<TierScorer tiers={tiers} selected={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('10 VP — Advanced'))
    expect(onChange).toHaveBeenCalledWith('t2')
  })
})
