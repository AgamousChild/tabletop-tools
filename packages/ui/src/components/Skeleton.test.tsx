import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Skeleton, SkeletonTable, SkeletonText } from './Skeleton'

describe('Skeleton', () => {
  it('exposes a loading status to assistive tech', () => {
    render(<Skeleton />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading')
  })

  it('animates so it reads as pending rather than empty', () => {
    render(<Skeleton />)
    expect(screen.getByRole('status').className).toContain('animate-pulse')
  })

  it('applies the requested dimensions', () => {
    render(<Skeleton height="h-8" width="w-1/2" />)
    const el = screen.getByRole('status')
    expect(el.className).toContain('h-8')
    expect(el.className).toContain('w-1/2')
  })
})

describe('SkeletonTable', () => {
  it('renders a placeholder cell for every row and column, plus a header row', () => {
    render(<SkeletonTable rows={3} columns={4} />)
    // 1 wrapper + 1 header row of 4 + 3 body rows of 4 = 17 status nodes.
    expect(screen.getAllByRole('status')).toHaveLength(1 + 4 + 3 * 4)
  })

  it('defaults to a table-sized block', () => {
    render(<SkeletonTable />)
    expect(screen.getAllByRole('status')).toHaveLength(1 + 5 + 8 * 5)
  })
})

describe('SkeletonText', () => {
  it('renders one placeholder per line', () => {
    render(<SkeletonText lines={4} />)
    expect(screen.getAllByRole('status')).toHaveLength(1 + 4)
  })

  it('shortens the last line so it reads as prose', () => {
    render(<SkeletonText lines={3} />)
    const lines = screen.getAllByRole('status').slice(1)
    expect(lines[lines.length - 1].className).toContain('w-2/3')
    expect(lines[0].className).toContain('w-full')
  })
})
