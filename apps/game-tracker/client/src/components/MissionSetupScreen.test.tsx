import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let mockMissions: Array<{ id: string; name: string; type: string; description: string }> = []

vi.mock('@tabletop-tools/game-data-store', () => ({
  useMissions: () => ({ data: mockMissions, error: null, isLoading: false }),
}))

import { MissionSetupScreen } from './MissionSetupScreen'

beforeEach(() => {
  mockMissions = []
})

describe('MissionSetupScreen', () => {
  it('shows Mission Setup title', () => {
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Mission Setup')).toBeInTheDocument()
  })

  it('shows mission selector', () => {
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByLabelText('Select mission')).toBeInTheDocument()
  })

  it('shows deployment zone selector', () => {
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByLabelText('Select deployment zone')).toBeInTheDocument()
  })

  it('shows terrain layout selector', () => {
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByLabelText('Select terrain layout')).toBeInTheDocument()
  })

  it('Next button disabled when no mission selected', () => {
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('calls onNext with data when mission selected and submitted', () => {
    const onNext = vi.fn()
    render(<MissionSetupScreen onNext={onNext} onBack={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Select mission'), {
      target: { value: 'Take and Hold' },
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ mission: 'Take and Hold' }),
    )
  })

  it('shows twist cards checkbox', () => {
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByLabelText('Include Twist Cards')).toBeInTheDocument()
  })

  it('shows challenger cards checkbox', () => {
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByLabelText('Include Challenger Cards')).toBeInTheDocument()
  })

  it('shows require photos checkbox', () => {
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByLabelText('Require Photos')).toBeInTheDocument()
  })

  it('includes checkbox state in onNext data', () => {
    const onNext = vi.fn()
    render(<MissionSetupScreen onNext={onNext} onBack={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Select mission'), {
      target: { value: 'Take and Hold' },
    })
    fireEvent.click(screen.getByLabelText('Include Twist Cards'))
    fireEvent.click(screen.getByLabelText('Require Photos'))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        mission: 'Take and Hold',
        includeTwists: true,
        twistCards: [],
        includeChallenger: false,
        challengerCards: [],
        requirePhotos: true,
      }),
    )
  })

  it('calls onBack when back is clicked', () => {
    const onBack = vi.fn()
    render(<MissionSetupScreen onNext={vi.fn()} onBack={onBack} />)
    fireEvent.click(screen.getByText('Back'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows twist card input when checkbox is checked', () => {
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Include Twist Cards'))
    expect(screen.getByLabelText('Twist card name')).toBeInTheDocument()
  })

  it('shows challenger card input when checkbox is checked', () => {
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Include Challenger Cards'))
    expect(screen.getByLabelText('Challenger card name')).toBeInTheDocument()
  })

  it('adds twist card and includes in onNext data', () => {
    const onNext = vi.fn()
    render(<MissionSetupScreen onNext={onNext} onBack={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Select mission'), { target: { value: 'Take and Hold' } })
    fireEvent.click(screen.getByLabelText('Include Twist Cards'))
    fireEvent.change(screen.getByLabelText('Twist card name'), { target: { value: 'Chilling Rain' } })
    // Click the Add button next to the twist input
    const addButtons = screen.getAllByRole('button', { name: /add/i })
    fireEvent.click(addButtons[0]!)

    expect(screen.getByText('Chilling Rain')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        twistCards: ['Chilling Rain'],
      }),
    )
  })

  it('removes twist card when x clicked', () => {
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Include Twist Cards'))
    fireEvent.change(screen.getByLabelText('Twist card name'), { target: { value: 'Chilling Rain' } })
    const addButtons = screen.getAllByRole('button', { name: /add/i })
    fireEvent.click(addButtons[0]!)

    expect(screen.getByText('Chilling Rain')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Remove Chilling Rain'))
    expect(screen.queryByText('Chilling Rain')).not.toBeInTheDocument()
  })

  it('adds challenger card and includes in onNext data', () => {
    const onNext = vi.fn()
    render(<MissionSetupScreen onNext={onNext} onBack={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Select mission'), { target: { value: 'Take and Hold' } })
    fireEvent.click(screen.getByLabelText('Include Challenger Cards'))
    fireEvent.change(screen.getByLabelText('Challenger card name'), { target: { value: 'Double Down' } })
    const addButtons = screen.getAllByRole('button', { name: /add/i })
    fireEvent.click(addButtons[0]!)

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        challengerCards: ['Double Down'],
      }),
    )
  })

  it('uses data-driven missions instead of fallbacks when available', () => {
    mockMissions = [
      { id: 'm1', name: 'Scorched Earth', type: 'primary', description: 'Burn objectives' },
      { id: 'm2', name: 'Supply Drop', type: 'primary', description: 'Secure supplies' },
      { id: 'd1', name: 'Dawn of War', type: 'deployment_zone', description: 'Long edges' },
    ]
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    const missionSelect = screen.getByLabelText('Select mission')
    const options = missionSelect.querySelectorAll('option')
    // Placeholder + 2 data-driven missions (not 7 fallbacks)
    expect(options).toHaveLength(3)
    expect(options[1]!.textContent).toBe('Scorched Earth')
    expect(options[2]!.textContent).toBe('Supply Drop')
  })

  it('uses data-driven deployment zones instead of fallbacks when available', () => {
    mockMissions = [
      { id: 'd1', name: 'Dawn of War', type: 'deployment_zone', description: 'Long edges' },
      { id: 'd2', name: 'Hammer and Anvil', type: 'deployment_zone', description: 'Short edges' },
    ]
    render(<MissionSetupScreen onNext={vi.fn()} onBack={vi.fn()} />)
    const deploymentSelect = screen.getByLabelText('Select deployment zone')
    const options = deploymentSelect.querySelectorAll('option')
    // Placeholder + 2 data-driven zones (not 6 fallbacks)
    expect(options).toHaveLength(3)
    expect(options[1]!.textContent).toBe('Dawn of War')
    expect(options[2]!.textContent).toBe('Hammer and Anvil')
  })

  it('selects a data-driven mission and includes in onNext', () => {
    mockMissions = [
      { id: 'm1', name: 'Scorched Earth', type: 'primary', description: 'Burn objectives' },
      { id: 'd1', name: 'Dawn of War', type: 'deployment_zone', description: 'Long edges' },
    ]
    const onNext = vi.fn()
    render(<MissionSetupScreen onNext={onNext} onBack={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Select mission'), { target: { value: 'Scorched Earth' } })
    fireEvent.change(screen.getByLabelText('Select deployment zone'), { target: { value: 'Dawn of War' } })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        mission: 'Scorched Earth',
        deploymentZone: 'Dawn of War',
      }),
    )
  })
})
