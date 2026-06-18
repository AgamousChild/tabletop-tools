import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { GameStateRow, ScorerMission, ScorerState } from './MissionScorer'
import { MissionScorer } from './MissionScorer'

vi.mock('./CountScorer', () => ({
  CountScorer: ({ label }: { label: string }) => <div data-testid="count-scorer">{label}</div>,
}))
vi.mock('./ChecklistScorer', () => ({
  ChecklistScorer: () => <div data-testid="checklist-scorer" />,
}))
vi.mock('./TierScorer', () => ({
  TierScorer: () => <div data-testid="tier-scorer" />,
}))
vi.mock('./ActionScorer', () => ({
  ActionScorer: ({ label }: { label: string }) => <div data-testid="action-scorer">{label}</div>,
}))
vi.mock('./ZonedCountScorer', () => ({
  ZonedCountScorer: () => <div data-testid="zoned-count-scorer" />,
}))

const noop = () => {}

const countMission: ScorerMission = { id: 'm1', name: 'Take and Hold', uiPattern: 'count' }
const checklistMission: ScorerMission = { id: 'm2', name: 'Purge the Foe', uiPattern: 'checklist' }
const unknownMission: ScorerMission = { id: 'm3', name: 'Mystery', uiPattern: 'unknown_pattern' }

const gameStates: GameStateRow[] = [
  {
    id: 'gs1',
    gameStateId: 'gs1',
    label: 'Objective A',
    points: 3,
    countMode: 'add',
    sortOrder: 0,
  },
]

const emptyState: ScorerState = {}

describe('MissionScorer', () => {
  it('renders the count scorer for count pattern', () => {
    render(
      <MissionScorer
        mission={countMission}
        gameStates={gameStates}
        state={emptyState}
        onChange={noop}
      />,
    )
    expect(screen.getByTestId('count-scorer')).toBeTruthy()
    expect(screen.getByText('Take and Hold')).toBeTruthy()
  })

  it('renders the checklist scorer for checklist pattern', () => {
    render(
      <MissionScorer
        mission={checklistMission}
        gameStates={gameStates}
        state={emptyState}
        onChange={noop}
      />,
    )
    expect(screen.getByTestId('checklist-scorer')).toBeTruthy()
    expect(screen.getByText('Purge the Foe')).toBeTruthy()
  })

  it('renders unsupported pattern gracefully', () => {
    render(
      <MissionScorer
        mission={unknownMission}
        gameStates={gameStates}
        state={emptyState}
        onChange={noop}
      />,
    )
    expect(screen.getByText(/Unsupported scoring pattern/i)).toBeTruthy()
    expect(screen.getByText('unknown_pattern')).toBeTruthy()
  })
})
