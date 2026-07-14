import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AuthScreen } from './AuthScreen'

describe('AuthScreen', () => {
  it('renders the title', () => {
    render(<AuthScreen title="TestApp" onAuthenticated={vi.fn()} authClient={null as any} />)
    expect(screen.getByText('TestApp')).toBeInTheDocument()
  })

  it('renders the subtitle when provided', () => {
    render(
      <AuthScreen
        title="TestApp"
        subtitle="A test subtitle"
        onAuthenticated={vi.fn()}
        authClient={null as any}
      />,
    )
    expect(screen.getByText('A test subtitle')).toBeInTheDocument()
  })

  it('starts in login mode with email and password fields', () => {
    render(<AuthScreen title="TestApp" onAuthenticated={vi.fn()} authClient={null as any} />)
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument()
  })

  it('switches to register mode and shows name field', () => {
    render(<AuthScreen title="TestApp" onAuthenticated={vi.fn()} authClient={null as any} />)
    fireEvent.click(screen.getByText('Register'))
    expect(screen.getByPlaceholderText('Name')).toBeInTheDocument()
  })

  it('switches back to login mode', () => {
    render(<AuthScreen title="TestApp" onAuthenticated={vi.fn()} authClient={null as any} />)
    fireEvent.click(screen.getByText('Register'))
    expect(screen.getByPlaceholderText('Name')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Sign in'))
    expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument()
  })

  it('calls onAuthenticated after successful login', async () => {
    const onAuthenticated = vi.fn()
    const authClient = {
      signIn: { email: vi.fn().mockResolvedValue({ error: null }) },
      signUp: { email: vi.fn() },
    }

    render(
      <AuthScreen
        title="TestApp"
        onAuthenticated={onAuthenticated}
        authClient={authClient as any}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass123' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }))

    await vi.waitFor(() => expect(onAuthenticated).toHaveBeenCalled())
  })

  it('shows error message on login failure', async () => {
    const authClient = {
      signIn: { email: vi.fn().mockResolvedValue({ error: { message: 'Bad creds' } }) },
      signUp: { email: vi.fn() },
    }

    render(<AuthScreen title="TestApp" onAuthenticated={vi.fn()} authClient={authClient as any} />)

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }))

    await vi.waitFor(() => expect(screen.getByText('Bad creds')).toBeInTheDocument())
  })

  it('shows network error on exception', async () => {
    const authClient = {
      signIn: { email: vi.fn().mockRejectedValue(new Error('fetch failed')) },
      signUp: { email: vi.fn() },
    }

    render(<AuthScreen title="TestApp" onAuthenticated={vi.fn()} authClient={authClient as any} />)

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }))

    await vi.waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument())
  })

  it('calls onAuthenticated after successful registration', async () => {
    const onAuthenticated = vi.fn()
    const authClient = {
      signIn: { email: vi.fn() },
      signUp: { email: vi.fn().mockResolvedValue({ error: null }) },
    }

    render(
      <AuthScreen
        title="TestApp"
        onAuthenticated={onAuthenticated}
        authClient={authClient as any}
      />,
    )

    fireEvent.click(screen.getByText('Register'))
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Tester' } })
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass123' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }))

    await vi.waitFor(() => expect(onAuthenticated).toHaveBeenCalled())
  })

  it('shows "check your inbox" after signup when verification is required', async () => {
    const onAuthenticated = vi.fn()
    const authClient = {
      signIn: { email: vi.fn() },
      signUp: { email: vi.fn().mockResolvedValue({ error: null }) },
      // Presence of this method signals verification is enabled on the server.
      sendVerificationEmail: vi.fn().mockResolvedValue({ error: null }),
    }

    render(
      <AuthScreen
        title="TestApp"
        onAuthenticated={onAuthenticated}
        authClient={authClient as any}
      />,
    )

    fireEvent.click(screen.getByText('Register'))
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Tester' } })
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass123' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }))

    await vi.waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeInTheDocument())
    expect(screen.getByText('a@b.com')).toBeInTheDocument()
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('shows "check your inbox" when login is rejected because email is unverified', async () => {
    const authClient = {
      signIn: {
        email: vi.fn().mockResolvedValue({
          error: { message: 'Please verify your email before signing in', status: 403 },
        }),
      },
      signUp: { email: vi.fn() },
      sendVerificationEmail: vi.fn().mockResolvedValue({ error: null }),
    }

    render(<AuthScreen title="TestApp" onAuthenticated={vi.fn()} authClient={authClient as any} />)

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass123' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }))

    await vi.waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeInTheDocument())
  })

  it('resend button triggers sendVerificationEmail', async () => {
    const sendVerificationEmail = vi.fn().mockResolvedValue({ error: null })
    const authClient = {
      signIn: {
        email: vi.fn().mockResolvedValue({
          error: { message: 'Please verify your email', status: 403 },
        }),
      },
      signUp: { email: vi.fn() },
      sendVerificationEmail,
    }

    render(<AuthScreen title="TestApp" onAuthenticated={vi.fn()} authClient={authClient as any} />)

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass123' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }))

    await vi.waitFor(() => expect(screen.getByText(/Didn't get it\? Resend/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Didn't get it\? Resend/))
    await vi.waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledWith({ email: 'a@b.com' }))
  })
})
