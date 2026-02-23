import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthScreen } from './AuthScreen'

const mockSignIn = vi.fn()
const mockSignUp = vi.fn()

vi.mock('../lib/auth', () => ({
  authClient: {
    signIn: { email: (...args: unknown[]) => mockSignIn(...args) },
    signUp: { email: (...args: unknown[]) => mockSignUp(...args) },
  },
}))

beforeEach(() => {
  mockSignIn.mockReset()
  mockSignUp.mockReset()
})

describe('AuthScreen', () => {
  it('renders the app title', () => {
    render(<AuthScreen onAuthenticated={vi.fn()} />)
    expect(screen.getByText('Game Tracker')).toBeInTheDocument()
  })

  it('shows login form by default', () => {
    render(<AuthScreen onAuthenticated={vi.fn()} />)
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('switches to register mode', () => {
    render(<AuthScreen onAuthenticated={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('calls onAuthenticated after successful login', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null })
    const onAuthenticated = vi.fn()
    render(<AuthScreen onAuthenticated={onAuthenticated} />)
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled())
  })

  it('shows error on failed login', async () => {
    mockSignIn.mockResolvedValueOnce({ error: { message: 'Bad credentials' } })
    render(<AuthScreen onAuthenticated={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() => expect(screen.getByText('Bad credentials')).toBeInTheDocument())
  })
})
