import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MetaWindowSelector } from './MetaWindowSelector'

let mockFrames: Array<{
  id: string
  typeId: number
  typeName: string
  date: string
  endDate: string
  month: number
  quarter: number
  year: number
  label: string
}> = []

vi.mock('../lib/trpc', () => ({
  trpc: {
    meta: {
      frames: {
        useQuery: () => ({ data: mockFrames }),
      },
    },
  },
}))

describe('MetaWindowSelector', () => {
  it('always shows "Latest Quarter" option', () => {
    mockFrames = []
    render(<MetaWindowSelector value={undefined} onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'Latest Quarter' })).toBeInTheDocument()
  })

  it('renders quarter frame options in the Quarters optgroup', () => {
    mockFrames = [
      {
        id: 'quarter:2025:1',
        typeId: 4,
        typeName: 'Quarter',
        date: '2025-01-01',
        endDate: '2025-03-31',
        month: 0,
        quarter: 1,
        year: 2025,
        label: 'Q1 2025',
      },
      {
        id: 'quarter:2025:2',
        typeId: 4,
        typeName: 'Quarter',
        date: '2025-04-01',
        endDate: '2025-06-30',
        month: 0,
        quarter: 2,
        year: 2025,
        label: 'Q2 2025',
      },
    ]
    render(<MetaWindowSelector value={undefined} onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'Q1 2025' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Q2 2025' })).toBeInTheDocument()
  })

  it('calls onChange with the selected frame id', () => {
    mockFrames = [
      {
        id: 'quarter:2025:1',
        typeId: 4,
        typeName: 'Quarter',
        date: '2025-01-01',
        endDate: '2025-03-31',
        month: 0,
        quarter: 1,
        year: 2025,
        label: 'Q1 2025',
      },
    ]
    const onChange = vi.fn()
    render(<MetaWindowSelector value={undefined} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'quarter:2025:1' } })
    expect(onChange).toHaveBeenCalledWith('quarter:2025:1')
  })

  it('calls onChange with undefined when "Latest Quarter" is selected', () => {
    mockFrames = [
      {
        id: 'quarter:2025:1',
        typeId: 4,
        typeName: 'Quarter',
        date: '2025-01-01',
        endDate: '2025-03-31',
        month: 0,
        quarter: 1,
        year: 2025,
        label: 'Q1 2025',
      },
    ]
    const onChange = vi.fn()
    render(<MetaWindowSelector value="quarter:2025:1" onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('renders month frames in the Months optgroup', () => {
    mockFrames = [
      {
        id: 'month:2025:3',
        typeId: 3,
        typeName: 'Month',
        date: '2025-03-01',
        endDate: '2025-03-31',
        month: 3,
        quarter: 0,
        year: 2025,
        label: 'Mar 2025',
      },
    ]
    render(<MetaWindowSelector value={undefined} onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'Mar 2025' })).toBeInTheDocument()
  })
})
