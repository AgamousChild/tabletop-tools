import { describe, expect, it, vi } from 'vitest'

// Mock better-auth/react to avoid importing actual library in unit tests
vi.mock('better-auth/react', () => ({
  createAuthClient: vi.fn((opts: { baseURL: string }) => ({
    baseURL: opts.baseURL,
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    useSession: vi.fn(),
  })),
}))

import { createAuthClient } from './auth'

describe('createAuthClient', () => {
  it('creates a client with the provided baseURL', () => {
    const client = createAuthClient('https://example.com/auth')
    expect(client).toBeDefined()
    expect(client.baseURL).toBe('https://example.com/auth')
  })

  it('uses default baseURL when none provided', () => {
    const client = createAuthClient()
    expect(client).toBeDefined()
    expect(client.baseURL).toBe('http://localhost:3000/api/auth')
  })
})
