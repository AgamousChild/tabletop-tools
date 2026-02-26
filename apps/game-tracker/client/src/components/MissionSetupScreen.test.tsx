import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MissionSetupScreen } from './MissionSetupScreen'

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

  it('calls onBack when back is clicked', () => {
    const onBack = vi.fn()
    render(<MissionSetupScreen onNext={vi.fn()} onBack={onBack} />)
    fireEvent.click(screen.getByText('Back'))
    expect(onBack).toHaveBeenCalled()
  })
})
