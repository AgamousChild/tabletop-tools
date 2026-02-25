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
            toughness: 4,
            save: 3,
            wounds: 2,
            weapons: [
              { name: 'Bolter', range: 24, attacks: 2, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
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
})
