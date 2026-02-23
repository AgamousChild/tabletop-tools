import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SimulatorScreen } from './SimulatorScreen'

const mockListFactions = vi.fn()
const mockSearch = vi.fn()
const mockRun = vi.fn()
const mockSave = vi.fn()

vi.mock('../lib/auth', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u1', name: 'Alice' } }, isPending: false }),
    signOut: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('../lib/trpc', () => ({
  trpc: {
    unit: {
      listFactions: {
        useQuery: () => ({ data: ['Space Marines', 'Orks'], isLoading: false }),
      },
      search: {
        useQuery: (_input: unknown, opts: { enabled: boolean }) =>
          opts.enabled
            ? {
                data: [
                  { id: 'u1', name: 'Intercessor Squad', faction: 'Space Marines', points: 100 },
                ],
                isLoading: false,
              }
            : { data: [], isLoading: false },
      },
    },
    simulate: {
      run: {
        useQuery: (_input: unknown, opts: { enabled: boolean }) =>
          opts.enabled
            ? {
                data: {
                  expectedWounds: 2.5,
                  expectedModelsRemoved: 1.2,
                  survivors: 3.8,
                  worstCase: { wounds: 0, modelsRemoved: 0 },
                  bestCase: { wounds: 8, modelsRemoved: 4 },
                },
                isLoading: false,
              }
            : { data: undefined, isLoading: false },
      },
      save: {
        useMutation: () => ({ mutate: mockSave }),
      },
    },
  },
}))

beforeEach(() => {
  mockListFactions.mockReset()
  mockSearch.mockReset()
  mockRun.mockReset()
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
    // Both selectors have the faction dropdown
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
