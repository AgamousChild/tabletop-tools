import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MetaWindowSelector } from './MetaWindowSelector'

let mockWindows: string[] = []

vi.mock('../lib/trpc', () => ({
  trpc: {
    meta: {
      windows: {
        useQuery: () => ({ data: mockWindows }),
      },
    },
  },
}))

describe('MetaWindowSelector', () => {
  it('always shows "All periods" option', () => {
    mockWindows = []
    render(<MetaWindowSelector value={undefined} onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'All periods' })).toBeInTheDocument()
  })

  it('renders a window option for each window returned by the query', () => {
    mockWindows = ['2025-Q1', '2025-Q2']
    render(<MetaWindowSelector value={undefined} onChange={() => {}} />)
    expect(screen.getByRole('option', { name: '2025-Q1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '2025-Q2' })).toBeInTheDocument()
  })

  it('calls onChange with the selected window value', () => {
    mockWindows = ['2025-Q1', '2025-Q2']
    const onChange = vi.fn()
    render(<MetaWindowSelector value={undefined} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2025-Q1' } })
    expect(onChange).toHaveBeenCalledWith('2025-Q1')
  })

  it('calls onChange with undefined when "All periods" is selected', () => {
    mockWindows = ['2025-Q1']
    const onChange = vi.fn()
    render(<MetaWindowSelector value="2025-Q1" onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(undefined)
  })
})
