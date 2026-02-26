import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { StatsOverlay } from './StatsOverlay'

describe('StatsOverlay', () => {
  it('shows dashes when no data', () => {
    render(
      <StatsOverlay rollCount={0} zScore={null} chiSquared={null} distribution={new Map()} />,
    )
    expect(screen.getByText('Waiting...')).toBeInTheDocument()
    expect(screen.getByText('0 rolls recorded')).toBeInTheDocument()
  })

  it('shows FAIR verdict for low z-score', () => {
    render(
      <StatsOverlay
        rollCount={10}
        zScore={0.5}
        chiSquared={3.2}
        distribution={new Map([[1, 2], [2, 1], [3, 2], [4, 2], [5, 1], [6, 2]])}
      />,
    )
    expect(screen.getByText('FAIR')).toBeInTheDocument()
    expect(screen.getByText('0.50')).toBeInTheDocument()
    expect(screen.getByText('3.20')).toBeInTheDocument()
    expect(screen.getByText('10 rolls recorded')).toBeInTheDocument()
  })

  it('shows SUSPECT verdict for moderate z-score', () => {
    render(
      <StatsOverlay rollCount={20} zScore={2.0} chiSquared={8.5} distribution={new Map()} />,
    )
    expect(screen.getByText('SUSPECT')).toBeInTheDocument()
  })

  it('shows LOADED verdict for high z-score', () => {
    render(
      <StatsOverlay rollCount={50} zScore={3.5} chiSquared={15.2} distribution={new Map()} />,
    )
    expect(screen.getByText('LOADED')).toBeInTheDocument()
  })

  it('shows singular "roll" for count of 1', () => {
    render(
      <StatsOverlay rollCount={1} zScore={0.1} chiSquared={1.0} distribution={new Map()} />,
    )
    expect(screen.getByText('1 roll recorded')).toBeInTheDocument()
  })
})
