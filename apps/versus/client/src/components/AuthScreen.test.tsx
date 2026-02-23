import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AuthScreen } from './AuthScreen'

vi.mock('../lib/auth', () => ({
  authClient: {
    signIn: {
      email: vi.fn().mockResolvedValue({ error: null }),
    },
    signUp: {
      email: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

describe('AuthScreen', () => {
  it('shows login form by default', () => {
    render(<AuthScreen onAuthenticated={() => {}} />)
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('switches to register mode', async () => {
    render(<AuthScreen onAuthenticated={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument(),
    )
  })

  it('calls onAuthenticated after successful login', async () => {
    const onAuthenticated = vi.fn()
    render(<AuthScreen onAuthenticated={onAuthenticated} />)
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'test@test.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: 'password123' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /log in/i }).closest('form')!)
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled())
  })

  it('shows error on login failure', async () => {
    const { authClient } = await import('../lib/auth')
    vi.mocked(authClient.signIn.email).mockResolvedValueOnce({
      error: { message: 'Invalid credentials' },
    } as never)
    render(<AuthScreen onAuthenticated={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'test@test.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: 'wrong' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /log in/i }).closest('form')!)
    await waitFor(() =>
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument(),
    )
  })
})
