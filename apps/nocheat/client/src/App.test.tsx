import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

// The App depends on authClient.useSession and tRPC providers.
// We test the loading state here by mocking the auth client.
vi.mock('./lib/auth', () => ({
  authClient: {
    useSession: () => ({ data: undefined, isPending: true, refetch: vi.fn() }),
    signOut: vi.fn(),
  },
}))

// Stub tRPC hooks — App delegates to child components that use them
vi.mock('./lib/trpc', () => ({
  trpc: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    diceSet: {
      list: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), error: null }) },
    },
  },
  createTRPCClient: vi.fn(),
}))

describe('App', () => {
  it('shows a loading indicator while session is pending', () => {
    render(<App />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
})
