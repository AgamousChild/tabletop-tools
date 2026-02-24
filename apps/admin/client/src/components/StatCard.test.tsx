import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from './StatCard'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Total Users" value={42} />)
    expect(screen.getByText('Total Users')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(<StatCard label="Active" value={5} sub="3 this week" />)
    expect(screen.getByText('3 this week')).toBeInTheDocument()
  })

  it('does not render subtitle when not provided', () => {
    const { container } = render(<StatCard label="Test" value={0} />)
    const sub = container.querySelector('.text-xs')
    expect(sub).toBeNull()
  })

  it('renders string values', () => {
    render(<StatCard label="Status" value="Healthy" />)
    expect(screen.getByText('Healthy')).toBeInTheDocument()
  })
})
