import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GranularitySelector } from './GranularitySelector'

let mockData: { granularities: Array<{ id: number; name: string }> } | undefined = undefined

vi.mock('../lib/trpc', () => ({
  trpc: {
    meta: {
      availableFilters: {
        useQuery: () => ({ data: mockData }),
      },
    },
  },
}))

describe('GranularitySelector', () => {
  it('renders nothing when only one granularity has data', () => {
    mockData = { granularities: [{ id: 1, name: 'Faction' }] }
    const { container } = render(<GranularitySelector value={undefined} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when data is undefined', () => {
    mockData = undefined
    const { container } = render(<GranularitySelector value={undefined} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a select with options when 2+ granularities have data', () => {
    mockData = {
      granularities: [
        { id: 1, name: 'Faction' },
        { id: 3, name: 'Detachment' },
      ],
    }
    render(<GranularitySelector value={undefined} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Granularity' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Faction' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Detachment' })).toBeInTheDocument()
  })

  it('calls onChange with the numeric id when selected', () => {
    mockData = {
      granularities: [
        { id: 1, name: 'Faction' },
        { id: 3, name: 'Detachment' },
      ],
    }
    const onChange = vi.fn()
    render(<GranularitySelector value={undefined} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Granularity' }), {
      target: { value: '3' },
    })
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('calls onChange with undefined when "Default" is selected', () => {
    mockData = {
      granularities: [
        { id: 1, name: 'Faction' },
        { id: 3, name: 'Detachment' },
      ],
    }
    const onChange = vi.fn()
    render(<GranularitySelector value={3} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Granularity' }), {
      target: { value: '' },
    })
    expect(onChange).toHaveBeenCalledWith(undefined)
  })
})
