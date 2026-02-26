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
  useGameDataAvailable: () => false,
}))

vi.mock('../lib/useGameData', () => ({
  useGameFactions: () => ({ data: [], isLoading: false }),
  useUnits: () => ({ data: [], isLoading: false }),
  useGameUnit: () => ({ data: null, isLoading: false }),
}))

beforeEach(() => {
  mockSave.mockReset()
})

describe('SimulatorScreen', () => {
  it('renders the app title', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('Versus')).toBeInTheDocument()
  })

  it('shows attacker and defender sections', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    expect(screen.getByText(/Attacker/)).toBeInTheDocument()
    expect(screen.getByText(/Defender/)).toBeInTheDocument()
  })

  it('shows Add Weapon form', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('Add Weapon')).toBeInTheDocument()
    expect(screen.getByText('+ Add Weapon')).toBeInTheDocument()
  })

  it('shows defender stat fields', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('Toughness')).toBeInTheDocument()
    expect(screen.getByText('Save')).toBeInTheDocument()
    expect(screen.getByText('Wounds')).toBeInTheDocument()
    expect(screen.getByText('Models')).toBeInTheDocument()
  })

  it('button disabled when no weapons added', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /add a weapon to simulate/i })
    expect(btn).toBeDisabled()
  })

  it('button enables after adding a weapon', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    // Add a weapon
    fireEvent.click(screen.getByText('+ Add Weapon'))
    // Button should now be enabled
    const btn = screen.getByRole('button', { name: /run simulation/i })
    expect(btn).not.toBeDisabled()
  })

  it('shows simulation results after adding a weapon', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('+ Add Weapon'))
    // Results should appear reactively
    expect(screen.getByText(/Expected Wounds/i)).toBeInTheDocument()
  })

  it('can remove a weapon', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('+ Add Weapon'))
    // Should show the weapon
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
    // Remove it
    fireEvent.click(screen.getByText('X'))
    expect(screen.queryByText('Weapon 1')).not.toBeInTheDocument()
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

  it('does not show unit picker when no game data', () => {
    render(<SimulatorScreen onSignOut={vi.fn()} />)
    expect(screen.queryByText('Load from imported data')).not.toBeInTheDocument()
  })
})
