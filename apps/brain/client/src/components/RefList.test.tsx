import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RefList } from './RefList'
import type { StoredRef } from '../lib/store'

const testRefs: StoredRef[] = [
  {
    sourceId: 'core:wound-roll',
    targetId: 'core:shooting-phase',
    rel: 'part_of',
    context: 'Wound roll is a step within the shooting sequence.',
  },
  {
    sourceId: 'core:wound-roll',
    targetId: 'core:fight-phase',
    rel: 'part_of',
    context: 'Wound roll also applies in the fight phase.',
  },
]

describe('RefList', () => {
  it('renders ref items', () => {
    render(<RefList refs={testRefs} onNodeClick={() => {}} />)
    expect(screen.getByText('core:shooting-phase')).toBeInTheDocument()
    expect(screen.getByText('core:fight-phase')).toBeInTheDocument()
  })

  it('displays context for each ref', () => {
    render(<RefList refs={testRefs} onNodeClick={() => {}} />)
    expect(screen.getByText(/Wound roll is a step/)).toBeInTheDocument()
  })

  it('displays the relationship type', () => {
    render(<RefList refs={testRefs} onNodeClick={() => {}} />)
    expect(screen.getAllByText('part_of')).toHaveLength(2)
  })

  it('renders empty state when no refs', () => {
    render(<RefList refs={[]} onNodeClick={() => {}} />)
    expect(screen.getByText(/No connections/i)).toBeInTheDocument()
  })

  it('calls onNodeClick when ref is clicked', () => {
    const onClick = vi.fn()
    render(<RefList refs={testRefs} onNodeClick={onClick} />)
    fireEvent.click(screen.getByText('core:shooting-phase'))
    expect(onClick).toHaveBeenCalledWith('core:shooting-phase')
  })
})
