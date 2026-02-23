import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GlickoBar } from './GlickoBar'

describe('GlickoBar', () => {
  it('shows the player name', () => {
    render(
      <GlickoBar playerName="Alice" rating={1600} ratingDeviation={80} gamesPlayed={25} />,
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows the rounded rating', () => {
    render(
      <GlickoBar playerName="Alice" rating={1623.7} ratingDeviation={80} gamesPlayed={25} />,
    )
    expect(screen.getByText('1624')).toBeInTheDocument()
  })

  it('shows ±2×RD uncertainty band', () => {
    render(
      <GlickoBar playerName="Alice" rating={1600} ratingDeviation={75} gamesPlayed={25} />,
    )
    expect(screen.getByText('±150')).toBeInTheDocument()
  })

  it('shows games played', () => {
    render(
      <GlickoBar playerName="Alice" rating={1600} ratingDeviation={80} gamesPlayed={42} />,
    )
    expect(screen.getByText('42g')).toBeInTheDocument()
  })

  it('shows rank when provided', () => {
    render(
      <GlickoBar
        playerName="Alice"
        rating={1600}
        ratingDeviation={80}
        gamesPlayed={25}
        rank={3}
      />,
    )
    expect(screen.getByText('#3')).toBeInTheDocument()
  })

  it('omits rank element when rank is not provided', () => {
    render(
      <GlickoBar playerName="Alice" rating={1600} ratingDeviation={80} gamesPlayed={25} />,
    )
    expect(screen.queryByText(/#\d/)).toBeNull()
  })

  it('colors narrow band (< 50) in emerald', () => {
    render(
      <GlickoBar playerName="Alice" rating={1600} ratingDeviation={20} gamesPlayed={50} />,
    )
    // 2 × 20 = 40 — narrow band
    const band = screen.getByText('±40')
    expect(band.className).toMatch(/emerald/)
  })

  it('colors medium band (50–150) in amber', () => {
    render(
      <GlickoBar playerName="Alice" rating={1600} ratingDeviation={60} gamesPlayed={15} />,
    )
    // 2 × 60 = 120 — medium band
    const band = screen.getByText('±120')
    expect(band.className).toMatch(/amber/)
  })

  it('colors wide band (> 150) in slate', () => {
    render(
      <GlickoBar playerName="Alice" rating={1500} ratingDeviation={200} gamesPlayed={2} />,
    )
    // 2 × 200 = 400 — wide band
    const band = screen.getByText('±400')
    expect(band.className).toMatch(/slate/)
  })
})
