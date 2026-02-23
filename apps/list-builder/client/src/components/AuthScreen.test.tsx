import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthScreen } from './AuthScreen'

const mockSignIn = vi.fn()
const mockSignUp = vi.fn()

vi.mock('../lib/auth', () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => mockSignIn(...args),
    },
    signUp: {
      email: (...args: unknown[]) => mockSignUp(...args),
    },
  },
}))

beforeEach(() => {
  mockSignIn.mockReset()
  mockSignUp.mockReset()
})

describe('AuthScreen', () => {
  it('renders the app title', () => {
    render(<AuthScreen onAuthenticated={vi.fn()} />)
    expect(screen.getByText('List Builder')).toBeInTheDocument()
  })

  it('shows the login form by default', () => {
    render(<AuthScreen onAuthenticated={vi.fn()} />)
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('switches to register mode', () => {
    render(<AuthScreen onAuthenticated={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('calls onAuthenticated after successful login', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null })
    const onAuthenticated = vi.fn()
    render(<AuthScreen onAuthenticated={onAuthenticated} />)

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'alice@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled())
  })

  it('shows error message on failed login', async () => {
    mockSignIn.mockResolvedValueOnce({ error: { message: 'Invalid credentials' } })
    render(<AuthScreen onAuthenticated={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'wrong@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'wrongpass' },
    })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument())
  })
})
