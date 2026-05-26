import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Pagination } from './Pagination'

describe('Pagination', () => {
  it('renders page info text', () => {
    render(<Pagination page={1} totalPages={5} total={50} pageSize={10} onPageChange={() => {}} />)
    expect(screen.getByText(/page 1 of 5/i)).toBeDefined()
    expect(screen.getByText(/50 results/i)).toBeDefined()
  })

  it('disables prev on first page', () => {
    render(<Pagination page={1} totalPages={5} total={50} pageSize={10} onPageChange={() => {}} />)
    expect((screen.getByLabelText('Previous page') as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables next on last page', () => {
    render(<Pagination page={5} totalPages={5} total={50} pageSize={10} onPageChange={() => {}} />)
    expect((screen.getByLabelText('Next page') as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls onPageChange with correct page on next', () => {
    const onChange = vi.fn()
    render(<Pagination page={3} totalPages={5} total={50} pageSize={10} onPageChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('calls onPageChange with correct page on prev', () => {
    const onChange = vi.fn()
    render(<Pagination page={3} totalPages={5} total={50} pageSize={10} onPageChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Previous page'))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('returns null when only 1 page', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} total={5} pageSize={10} onPageChange={() => {}} />,
    )
    expect(container.innerHTML).toBe('')
  })
})
