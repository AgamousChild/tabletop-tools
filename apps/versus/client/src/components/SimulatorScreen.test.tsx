import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SimulatorScreen } from './SimulatorScreen'

const mockSave = vi.fn()

vi.mock('../lib/auth', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u1', name: 'Alice' } }, isPending: false }),
    signOut: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('../lib/trpc', () => ({
  trpc: {
    simulate: {
      save: {
        useMutation: () => ({ mutate: mockSave }),
      },
    },
  },
}))

vi.mock('@tabletop-tools/game-data-store', () => ({
  useGameDataAvailable: () => true,
}))

vi.mock('../lib/useGameData', () => ({
  useGameFactions: () => ({ data: ['Space Marines', 'Orks'], isLoading: false }),
  useUnits: () => ({
    data: [
      { id: 'u1', name: 'Intercessor Squad', faction: 'Space Marines', points: 100 },
    ],
    isLoading: false,
  }),
  useGameUnit: (id: string | null) =>
    id
      ? {
          data: {
            id,
            name: 'Intercessor Squad',
            faction: 'Space Marines',
            move: 6,
            toughness: 4,
            save: 3,
            wounds: 2,
            leadership: 6,
            oc: 2,
            weapons: [
              { name: 'Bolt Rifle', range: 30, attacks: 2, skill: 3, strength: 4, ap: -1, damage: 1, abilities: [] },
              { name: 'Bolt Pistol', range: 12, attacks: 1, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
              { name: 'Close Combat Weapon', range: 'melee', attacks: 3, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
            ],
            abilities: [],
            points: 100,
          },
          isLoading: false,
        }
      : { data: null, isLoading: false },
}))

beforeEach(() => {
  mockSave.mockReset()
})

describe('SimulatorScreen', () => {
  it('renders the app title', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('Versus')).toBeInTheDocument()
  })

  it('shows attacker and defender selector panels', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('Attacker')).toBeInTheDocument()
    expect(screen.getByText('Defender')).toBeInTheDocument()
  })

  it('shows faction options from the query', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThanOrEqual(2)
  })

  it('shows Run Simulation button disabled when no units selected', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /run simulation/i })
    expect(btn).toBeDisabled()
  })

  it('shows sign out button', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('calls onSignOut when sign out is clicked', async () => {
    const onSignOut = vi.fn()
    render(<SimulatorScreen onSignOut={onSignOut} />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(onSignOut).toHaveBeenCalled())
  })

  it('shows special rules editor', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('Special Rules')).toBeInTheDocument()
  })

  it('shows weapon selector after selecting attacker unit', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    // Click the first unit button to select it as attacker
    const unitButtons = screen.getAllByRole('button', { name: /intercessor squad/i })
    fireEvent.click(unitButtons[0])
    // Should show ranged/melee toggle and weapon list
    expect(screen.getByRole('button', { name: /ranged/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /melee/i })).toBeInTheDocument()
  })

  it('shows unit profile card after selecting a unit', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    const unitButtons = screen.getAllByRole('button', { name: /intercessor squad/i })
    fireEvent.click(unitButtons[0])
    // UnitProfileCard shows stat labels
    expect(screen.getAllByText('T').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Sv').length).toBeGreaterThanOrEqual(1)
  })
})
