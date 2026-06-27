import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MetaWindowSelector } from './MetaWindowSelector'

type FrameRow = {
  id: string
  typeId: number
  typeName: string
  date: number
  endDate: number | null
  month: number | null
  quarter: number | null
  year: number
  label: string
  hasData: boolean
}

type AvailableFilters = {
  granularityId: number
  types: Array<{ id: number; name: string; framesWithData: number }>
  granularities: Array<{ id: number; name: string }>
  framesByType: Record<number, FrameRow[]>
}

let mockData: AvailableFilters | undefined = undefined

vi.mock('../lib/trpc', () => ({
  trpc: {
    meta: {
      availableFilters: {
        useQuery: () => ({ data: mockData }),
      },
    },
  },
}))

describe('MetaWindowSelector', () => {
  it('always shows "Latest Quarter" option', () => {
    mockData = undefined
    render(<MetaWindowSelector value={undefined} onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'Latest Quarter' })).toBeInTheDocument()
  })

  it('renders an optgroup per populated type, labeled with the type name', () => {
    mockData = {
      granularityId: 1,
      types: [
        { id: 3, name: 'Month', framesWithData: 1 },
        { id: 4, name: 'Quarter', framesWithData: 2 },
        { id: 5, name: 'Year', framesWithData: 0 }, // no data — should be hidden
      ],
      granularities: [{ id: 1, name: 'Faction' }],
      framesByType: {
        3: [
          {
            id: 'month:2025-03',
            typeId: 3,
            typeName: 'Month',
            date: 0,
            endDate: null,
            month: 3,
            quarter: null,
            year: 2025,
            label: '2025-03',
            hasData: true,
          },
        ],
        4: [
          {
            id: 'quarter:2025:1',
            typeId: 4,
            typeName: 'Quarter',
            date: 0,
            endDate: null,
            month: null,
            quarter: 1,
            year: 2025,
            label: '2025 Q1',
            hasData: true,
          },
        ],
      },
    }
    render(<MetaWindowSelector value={undefined} onChange={() => {}} />)

    // Optgroup labels follow the dim type name (pluralised), not a hardcoded list.
    const quartersGroup = document.querySelector("optgroup[label='Quarters']")
    const monthsGroup = document.querySelector("optgroup[label='Months']")
    const yearsGroup = document.querySelector("optgroup[label='Years']")
    expect(quartersGroup).not.toBeNull()
    expect(monthsGroup).not.toBeNull()
    expect(yearsGroup).toBeNull()
  })

  it('appends the end date to each option label when present', () => {
    const endDate = Date.UTC(2025, 2, 31) // 2025-03-31
    mockData = {
      granularityId: 1,
      types: [{ id: 4, name: 'Quarter', framesWithData: 1 }],
      granularities: [{ id: 1, name: 'Faction' }],
      framesByType: {
        4: [
          {
            id: 'quarter:2025:1',
            typeId: 4,
            typeName: 'Quarter',
            date: 0,
            endDate,
            month: null,
            quarter: 1,
            year: 2025,
            label: '2025 Q1',
            hasData: true,
          },
        ],
      },
    }
    render(<MetaWindowSelector value={undefined} onChange={() => {}} />)
    expect(
      screen.getByRole('option', { name: /2025 Q1 \(through 2025-03-31\)/ }),
    ).toBeInTheDocument()
  })

  it('drops options where hasData is false even if the type is populated', () => {
    mockData = {
      granularityId: 1,
      types: [{ id: 4, name: 'Quarter', framesWithData: 1 }],
      granularities: [{ id: 1, name: 'Faction' }],
      framesByType: {
        4: [
          {
            id: 'quarter:2025:1',
            typeId: 4,
            typeName: 'Quarter',
            date: 0,
            endDate: null,
            month: null,
            quarter: 1,
            year: 2025,
            label: '2025 Q1',
            hasData: true,
          },
          {
            id: 'quarter:2025:2',
            typeId: 4,
            typeName: 'Quarter',
            date: 0,
            endDate: null,
            month: null,
            quarter: 2,
            year: 2025,
            label: '2025 Q2',
            hasData: false,
          },
        ],
      },
    }
    render(<MetaWindowSelector value={undefined} onChange={() => {}} />)
    expect(screen.getByRole('option', { name: '2025 Q1' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '2025 Q2' })).toBeNull()
  })

  it('calls onChange with the selected frame id', () => {
    mockData = {
      granularityId: 1,
      types: [{ id: 4, name: 'Quarter', framesWithData: 1 }],
      granularities: [{ id: 1, name: 'Faction' }],
      framesByType: {
        4: [
          {
            id: 'quarter:2025:1',
            typeId: 4,
            typeName: 'Quarter',
            date: 0,
            endDate: null,
            month: null,
            quarter: 1,
            year: 2025,
            label: '2025 Q1',
            hasData: true,
          },
        ],
      },
    }
    const onChange = vi.fn()
    render(<MetaWindowSelector value={undefined} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'quarter:2025:1' } })
    expect(onChange).toHaveBeenCalledWith('quarter:2025:1')
  })

  it('calls onChange with undefined when "Latest Quarter" is selected', () => {
    mockData = {
      granularityId: 1,
      types: [{ id: 4, name: 'Quarter', framesWithData: 1 }],
      granularities: [{ id: 1, name: 'Faction' }],
      framesByType: {
        4: [
          {
            id: 'quarter:2025:1',
            typeId: 4,
            typeName: 'Quarter',
            date: 0,
            endDate: null,
            month: null,
            quarter: 1,
            year: 2025,
            label: '2025 Q1',
            hasData: true,
          },
        ],
      },
    }
    const onChange = vi.fn()
    render(<MetaWindowSelector value="quarter:2025:1" onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(undefined)
  })
})
