import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Admin } from './Admin'

let mockSession: unknown = null
let mockIsPending = false
const mockMutate = vi.fn()

vi.mock('../lib/auth', () => ({
  useSession: () => ({ data: mockSession }),
}))

vi.mock('../lib/trpc', () => ({
  trpc: {
    admin: {
      import: {
        useMutation: ({ onSuccess, onError }: { onSuccess: (d: unknown) => void; onError: (e: { message: string }) => void }) => ({
          mutate: (args: unknown) => mockMutate(args, { onSuccess, onError }),
          isPending: mockIsPending,
        }),
      },
    },
  },
}))

describe('Admin', () => {
  it('shows "must be logged in" when there is no session', () => {
    mockSession = null
    render(<Admin />)
    expect(screen.getByText(/must be logged in/i)).toBeInTheDocument()
  })

  it('shows the import form when logged in', () => {
    mockSession = { user: { id: 'u1', email: 'admin@example.com' } }
    render(<Admin />)
    expect(screen.getByPlaceholderText(/paste csv here/i)).toBeInTheDocument()
  })

  it('shows validation error when required fields are missing on submit', () => {
    mockSession = { user: { id: 'u1' } }
    render(<Admin />)
    fireEvent.click(screen.getByRole('button', { name: /import tournament/i }))
    expect(screen.getByText(/all fields are required/i)).toBeInTheDocument()
  })

  it('shows "Importing…" on the button while pending', () => {
    mockSession = { user: { id: 'u1' } }
    mockIsPending = true
    render(<Admin />)
    expect(screen.getByRole('button', { name: /importing/i })).toBeInTheDocument()
    mockIsPending = false
  })

  it('renders format, event name, date, meta window, and CSV fields', () => {
    mockSession = { user: { id: 'u1' } }
    mockIsPending = false
    render(<Admin />)
    expect(screen.getByText('CSV Format')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/london gt 2025/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/2025-Q2/i)).toBeInTheDocument()
  })
})
