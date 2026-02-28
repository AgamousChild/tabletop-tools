import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TournamentScreen } from './TournamentScreen'

const mockCreateTournament = vi.fn()
const mockAdvanceStatus = vi.fn()
const mockRegisterPlayer = vi.fn()
const mockCreateRound = vi.fn()
const mockGeneratePairings = vi.fn()

vi.mock('../lib/auth', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: 'to-1', name: 'Alice' } },
      isPending: false,
    }),
    signOut: vi.fn().mockResolvedValue({}),
  },
}))

const mockTournaments = [
  {
    id: 't1',
    name: 'Test GT 2025',
    status: 'REGISTRATION',
    totalRounds: 5,
    toUserId: 'to-1',
    eventDate: 1700000000000,
    format: '2000pts Matched Play',
    location: 'London',
    createdAt: 0,
    playerCount: 12,
    description: 'A great tournament',
    startTime: '10:00 AM',
    externalLink: 'https://example.com/event',
    maxPlayers: 32,
  },
  {
    id: 't2',
    name: 'Local League',
    status: 'IN_PROGRESS',
    totalRounds: 3,
    toUserId: 'other-user',
    eventDate: 1700000000000,
    format: '1000pts',
    location: null,
    createdAt: 0,
    playerCount: 6,
  },
]

vi.mock('../lib/trpc', () => ({
  trpc: {
    tournament: {
      listMine: {
        useQuery: () => ({ data: mockTournaments, refetch: vi.fn(), isPending: false }),
      },
      get: {
        useQuery: (_id: unknown, _opts: unknown) => ({
          data: mockTournaments[0],
          refetch: vi.fn(),
        }),
      },
      standings: {
        useQuery: (_id: unknown, _opts: unknown) => ({
          data: {
            round: 2,
            players: [
              { rank: 1, id: 'p1', displayName: 'Bob', faction: 'Orks', wins: 2, losses: 0, draws: 0, margin: 40, totalVP: 150, strengthOfSchedule: 0.5 },
              { rank: 2, id: 'p2', displayName: 'Carol', faction: 'Necrons', wins: 1, losses: 1, draws: 0, margin: 10, totalVP: 120, strengthOfSchedule: 0.4 },
            ],
          },
          refetch: vi.fn(),
        }),
      },
      create: {
        useMutation: (opts?: { onSuccess?: (t: unknown) => void }) => ({
          mutate: (args: unknown) => {
            mockCreateTournament(args)
            opts?.onSuccess?.({ id: 'new-t', name: 'New GT', status: 'DRAFT', toUserId: 'to-1' })
          },
          isPending: false,
        }),
      },
      advanceStatus: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (id: unknown) => {
            mockAdvanceStatus(id)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
      delete: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      search: {
        useQuery: () => ({
          data: [
            {
              id: 'search-1',
              name: 'Open GT 2025',
              status: 'REGISTRATION',
              format: '2000pts',
              location: 'Denver',
              eventDate: 1700000000000,
              playerCount: 8,
              maxPlayers: 32,
              startTime: '10:00 AM',
            },
          ],
          isPending: false,
        }),
      },
    },
    player: {
      register: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockRegisterPlayer(args)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
      checkIn: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      drop: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      list: {
        useQuery: () => ({ data: [], refetch: vi.fn() }),
      },
      lockLists: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      myProfile: {
        useQuery: () => ({
          data: {
            userId: 'to-1',
            tournamentsPlayed: 3,
            tournaments: [
              { id: 't1', name: 'Test GT 2025', status: 'COMPLETE', eventDate: 1700000000000, format: '2000pts', faction: 'Orks' },
            ],
            wins: 5,
            losses: 2,
            draws: 1,
            gamesPlayed: 8,
            totalVP: 580,
            cards: [
              { id: 'c1', cardType: 'YELLOW', reason: 'Slow play', issuedAt: 1700000000000, tournamentId: 't1' },
            ],
            bans: [],
          },
          isPending: false,
        }),
      },
      searchLists: {
        useQuery: () => ({
          data: [
            {
              playerName: 'Bob',
              faction: 'Death Guard',
              detachment: 'Plague Company',
              listText: 'Plague Marines x10\nBlightlord Terminators x5',
              tournamentName: 'Test GT',
              tournamentId: 't1',
              eventDate: 1700000000000,
            },
          ],
          isPending: false,
        }),
      },
      searchPlayers: {
        useQuery: () => ({
          data: [
            {
              userId: 'p1',
              displayName: 'Bob',
              tournamentsPlayed: 5,
              factions: ['Orks', 'Death Guard'],
              yellowCards: 1,
              redCards: 0,
              recentTournaments: [
                { name: 'Test GT', faction: 'Orks', eventDate: 1700000000000 },
              ],
            },
          ],
          isPending: false,
        }),
      },
    },
    round: {
      create: {
        useMutation: (opts?: { onSuccess?: (r: unknown) => void }) => ({
          mutate: (args: unknown) => {
            mockCreateRound(args)
            opts?.onSuccess?.({ id: 'round-1', roundNumber: 1, status: 'PENDING', tournamentId: 't1', createdAt: 0 })
          },
          isPending: false,
        }),
      },
      generatePairings: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockGeneratePairings(args)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
      get: {
        useQuery: (_id: unknown, _opts: unknown) => ({
          data: { id: 'round-1', roundNumber: 1, status: 'ACTIVE', startTime: '10:00 AM', pairings: [] },
          refetch: vi.fn(),
        }),
      },
      close: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    result: {
      report: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      confirm: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      dispute: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    elo: {
      get: {
        useQuery: () => ({ data: { rating: 1200, gamesPlayed: 5 } }),
      },
      leaderboard: {
        useQuery: () => ({
          data: [
            { userId: 'to-1', displayName: 'Alice', rating: 1350, gamesPlayed: 10 },
            { userId: 'p1', displayName: 'Bob', rating: 1200, gamesPlayed: 5 },
          ],
        }),
      },
    },
    award: {
      list: {
        useQuery: () => ({ data: [], refetch: vi.fn() }),
      },
    },
  },
}))

beforeEach(() => {
  window.location.hash = ''
  mockCreateTournament.mockReset()
  mockAdvanceStatus.mockReset()
  mockRegisterPlayer.mockReset()
  mockCreateRound.mockReset()
  mockGeneratePairings.mockReset()
})

describe('TournamentScreen', () => {
  it('renders the app title', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('Tournament')).toBeInTheDocument()
  })

  it('shows sign out button', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('calls onSignOut when sign out is clicked', async () => {
    const onSignOut = vi.fn()
    render(<TournamentScreen onSignOut={onSignOut} />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(onSignOut).toHaveBeenCalled())
  })

  it('shows list of tournaments', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('Test GT 2025')).toBeInTheDocument()
    expect(screen.getByText('Local League')).toBeInTheDocument()
  })

  it('shows tournament status badges', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('REGISTRATION')).toBeInTheDocument()
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument()
  })

  it('shows + New Tournament link', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    expect(screen.getByRole('link', { name: /\+ new tournament/i })).toBeInTheDocument()
  })

  it('navigates to create tournament form', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/create'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Create Tournament' })).toBeInTheDocument()
    })
    expect(screen.getByPlaceholderText(/tournament name/i)).toBeInTheDocument()
  })

  it('creates a tournament when form is submitted', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/create'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/tournament name/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/tournament name/i), {
      target: { value: 'Summer GT' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }))

    await waitFor(() =>
      expect(mockCreateTournament).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Summer GT' }),
      ),
    )
  })

  it('navigates to tournament detail via hash', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByText(/2000pts Matched Play/)).toBeInTheDocument()
    })
  })

  it('shows standings when on tournament detail', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })
    expect(screen.getByText('Carol')).toBeInTheDocument()
  })

  // ─── Registration ───────────────────────────────────────────────

  it('navigates to registration form', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1/register'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByText('Register for Tournament')).toBeInTheDocument()
    })
    expect(screen.getByPlaceholderText(/display name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/faction/i)).toBeInTheDocument()
  })

  it('submits registration with name and faction', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1/register'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/display name/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/display name/i), {
      target: { value: 'Bob' },
    })
    fireEvent.change(screen.getByPlaceholderText(/faction/i), {
      target: { value: 'Orks' },
    })
    fireEvent.click(screen.getByRole('button', { name: /register/i }))

    await waitFor(() =>
      expect(mockRegisterPlayer).toHaveBeenCalledWith(
        expect.objectContaining({ tournamentId: 't1', displayName: 'Bob', faction: 'Orks' }),
      ),
    )
  })

  // ─── Tournament Detail ──────────────────────────────────────────

  it('shows Advance button for TO when status is not COMPLETE', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /advance/i })).toBeInTheDocument()
    })
  })

  it('advances status when Advance button is clicked', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /advance/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /advance/i }))
    expect(mockAdvanceStatus).toHaveBeenCalledWith('t1')
  })

  it('shows player count on tournament detail', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByText(/12 \/ 32 players registered/)).toBeInTheDocument()
    })
  })

  it('shows Standings link on tournament detail', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /standings/i })).toBeInTheDocument()
    })
  })

  // ─── Round View ─────────────────────────────────────────────────

  it('navigates to round view', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1/round/round-1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByText(/Round 1/)).toBeInTheDocument()
    })
  })

  it('shows no pairings message on empty round', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1/round/round-1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByText(/no pairings yet/i)).toBeInTheDocument()
    })
  })

  it('shows round start time on round detail', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1/round/round-1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByText(/start: 10:00 am/i)).toBeInTheDocument()
    })
  })


  // ─── Tournament Detail — new display fields ───────────────────

  it('shows external link on tournament detail', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /event link/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', 'https://example.com/event')
    })
  })

  it('shows event date on tournament detail', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      // eventDate 1700000000000 = Nov 14, 2023 (locale-dependent)
      const dateEl = screen.getByText(/2023/)
      expect(dateEl).toBeInTheDocument()
    })
  })

  it('shows description on tournament detail', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/tournament/t1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByText('A great tournament')).toBeInTheDocument()
    })
  })

  // ─── Navigation tabs ─────────────────────────────────────────

  it('shows navigation tabs on main page', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    expect(screen.getByRole('link', { name: /my tournaments/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^play$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my info/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^lists$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^players$/i })).toBeInTheDocument()
  })

  // ─── Play screen ─────────────────────────────────────────────

  it('shows Play screen with tournament search', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/play'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search tournaments/i)).toBeInTheDocument()
    })
    expect(screen.getByText('Open GT 2025')).toBeInTheDocument()
    expect(screen.getByText(/8 \/ 32 players/)).toBeInTheDocument()
  })

  it('shows Register button on open tournaments in Play screen', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/play'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /register/i })).toBeInTheDocument()
    })
  })

  it('shows status filter buttons on Play screen', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/play'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /registration/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /complete/i })).toBeInTheDocument()
    })
  })

  // ─── My Info screen ──────────────────────────────────────────

  it('shows My Info screen with profile data', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/my-info'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByText('ELO Rating')).toBeInTheDocument()
    })
    expect(screen.getByText('1200')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument() // Rank
  })

  it('shows W-L-D record on My Info', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/my-info'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByText('Record')).toBeInTheDocument()
    })
    expect(screen.getByText('5')).toBeInTheDocument() // wins
    expect(screen.getByText('Wins')).toBeInTheDocument()
    expect(screen.getByText('Losses')).toBeInTheDocument()
    expect(screen.getByText('Draws')).toBeInTheDocument()
  })

  it('shows tournament history on My Info', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/my-info'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByText('Tournament History')).toBeInTheDocument()
    })
    expect(screen.getByText('Test GT 2025')).toBeInTheDocument()
  })

  it('shows card history on My Info', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/my-info'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByText('Card History')).toBeInTheDocument()
    })
    expect(screen.getByText('Slow play')).toBeInTheDocument()
  })

  // ─── List Search screen ──────────────────────────────────────

  it('shows List Search screen with results', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/search/lists'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/filter by faction/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Death Guard/)).toBeInTheDocument()
    expect(screen.getByText(/Plague Marines/)).toBeInTheDocument()
  })

  // ─── Player Search screen ────────────────────────────────────

  it('shows Player Search screen with results', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    act(() => {
      window.location.hash = '#/search/players'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search players/i)).toBeInTheDocument()
    })
    // The mock returns data when query >= 1 char, but initial state has empty query
    // so we should see the "Enter a player name" prompt
    expect(screen.getByText(/enter a player name/i)).toBeInTheDocument()
  })
})
