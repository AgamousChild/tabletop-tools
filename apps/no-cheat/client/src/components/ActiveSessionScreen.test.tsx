import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

let startResult: any = null
let startError: any = null

vi.mock('../lib/trpc', () => ({
  trpc: {
    session: {
      start: {
        useMutation: () => ({
          mutate: (_args: unknown, opts?: { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void }) => {
            if (startError) {
              opts?.onError?.(startError)
            } else if (startResult) {
              opts?.onSuccess?.(startResult)
            }
          },
          isPending: false,
        }),
      },
      addRoll: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      close: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      savePhoto: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}))

vi.mock('./Camera', () => ({
  Camera: () => <div data-testid="camera-mock">Camera</div>,
}))

vi.mock('./ResultScreen', () => ({
  ResultScreen: () => <div data-testid="result-mock">Result</div>,
}))

import { ActiveSessionScreen } from './ActiveSessionScreen'

beforeEach(() => {
  startResult = null
  startError = null
})

describe('ActiveSessionScreen', () => {
  it('shows starting phase initially', () => {
    render(<ActiveSessionScreen diceSet={{ id: 'd1', name: 'Red Dice' }} onDone={vi.fn()} />)
    expect(screen.getByText(/starting session/i)).toBeInTheDocument()
  })

  it('shows dice set name and hint after session starts', async () => {
    startResult = { id: 'sess-1' }
    render(<ActiveSessionScreen diceSet={{ id: 'd1', name: 'Red Dice' }} onDone={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Red Dice')).toBeInTheDocument()
    })
    expect(screen.getByText(/point at a die/i)).toBeInTheDocument()
  })

  it('shows Done button disabled when no rolls', async () => {
    startResult = { id: 'sess-1' }
    render(<ActiveSessionScreen diceSet={{ id: 'd1', name: 'Red Dice' }} onDone={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Red Dice')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /done/i })).toBeDisabled()
  })

  it('shows error state with Back button', async () => {
    startError = { message: 'Session limit reached' }
    render(<ActiveSessionScreen diceSet={{ id: 'd1', name: 'Red Dice' }} onDone={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Session limit reached')).toBeInTheDocument()
    })
    expect(screen.getByText('← Back')).toBeInTheDocument()
  })

  it('renders camera after session starts', async () => {
    startResult = { id: 'sess-1' }
    render(<ActiveSessionScreen diceSet={{ id: 'd1', name: 'Red Dice' }} onDone={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('camera-mock')).toBeInTheDocument()
    })
  })
})
