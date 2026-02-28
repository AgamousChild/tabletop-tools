import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RoundEditor } from './RoundEditor'

const baseTurn = {
  id: 't1',
  turnNumber: 2,
  yourPrimary: 5,
  theirPrimary: 3,
  yourCpGained: 1,
  theirCpGained: 1,
  notes: 'Good round',
}

describe('RoundEditor', () => {
  it('shows editing header with round number', () => {
    render(<RoundEditor turn={baseTurn} onSave={vi.fn()} onCancel={vi.fn()} isSaving={false} />)
    expect(screen.getByText('Editing Round 2')).toBeInTheDocument()
  })

  it('pre-populates fields from turn data', () => {
    render(<RoundEditor turn={baseTurn} onSave={vi.fn()} onCancel={vi.fn()} isSaving={false} />)
    const yourVp = screen.getByLabelText('Your Primary VP') as HTMLInputElement
    expect(yourVp.value).toBe('5')
    const theirVp = screen.getByLabelText('Their Primary VP') as HTMLInputElement
    expect(theirVp.value).toBe('3')
  })

  it('calls onSave with updated values', () => {
    const onSave = vi.fn()
    render(<RoundEditor turn={baseTurn} onSave={onSave} onCancel={vi.fn()} isSaving={false} />)
    fireEvent.change(screen.getByLabelText('Your Primary VP'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ yourPrimary: 8, theirPrimary: 3 }),
    )
  })

  it('calls onCancel when cancel clicked', () => {
    const onCancel = vi.fn()
    render(<RoundEditor turn={baseTurn} onSave={vi.fn()} onCancel={onCancel} isSaving={false} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('disables save button when saving', () => {
    render(<RoundEditor turn={baseTurn} onSave={vi.fn()} onCancel={vi.fn()} isSaving={true} />)
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
  })

  it('falls back to primaryScored for legacy data', () => {
    const legacyTurn = { id: 't2', turnNumber: 1, primaryScored: 4 }
    render(<RoundEditor turn={legacyTurn} onSave={vi.fn()} onCancel={vi.fn()} isSaving={false} />)
    const yourVp = screen.getByLabelText('Your Primary VP') as HTMLInputElement
    expect(yourVp.value).toBe('4')
  })
})
