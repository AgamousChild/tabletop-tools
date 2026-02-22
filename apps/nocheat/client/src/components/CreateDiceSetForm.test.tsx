import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CreateDiceSetForm } from './CreateDiceSetForm'

describe('CreateDiceSetForm', () => {
  it('renders a name input and submit button', () => {
    render(<CreateDiceSetForm onCreate={() => {}} />)
    expect(screen.getByPlaceholderText(/dice set name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
  })

  it('calls onCreate with the typed name on submit', () => {
    const onCreate = vi.fn()
    render(<CreateDiceSetForm onCreate={onCreate} />)
    fireEvent.change(screen.getByPlaceholderText(/dice set name/i), {
      target: { value: 'Red Dragons' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(onCreate).toHaveBeenCalledWith('Red Dragons')
  })

  it('does not call onCreate when the name is empty', () => {
    const onCreate = vi.fn()
    render(<CreateDiceSetForm onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('clears the input after successful submit', () => {
    render(<CreateDiceSetForm onCreate={() => {}} />)
    const input = screen.getByPlaceholderText(/dice set name/i)
    fireEvent.change(input, { target: { value: 'Red Dragons' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(input).toHaveValue('')
  })
})
