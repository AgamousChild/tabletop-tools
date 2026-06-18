import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock tRPC hooks used by AttachmentPicker
vi.mock('../lib/trpc', () => ({
  trpc: {
    listV2: {
      eligibleBodyguards: {
        useQuery: vi.fn(),
      },
      canDeploySolo: {
        useQuery: vi.fn(),
      },
    },
  },
  trpcClient: {},
}))

// Import after mocking
import { trpc } from '../lib/trpc'
import { AttachmentPicker } from './UnitSelectionScreen'

const makeUnit = (overrides: Partial<ReturnType<typeof makeUnit>> = {}) => ({
  id: 'lu-captain',
  listId: 'list-1',
  datasheetId: 'ds-captain',
  enhancementId: null,
  isWarlord: false,
  points: 90,
  attachedToUnitId: null,
  attachRole: null as 'leader' | 'support' | null,
  loadouts: [],
  ...overrides,
})

const bgUnit = {
  id: 'lu-bg',
  listId: 'list-1',
  datasheetId: 'ds-intercessors',
  enhancementId: null,
  isWarlord: false,
  points: 90,
  attachedToUnitId: null,
  attachRole: null as 'leader' | 'support' | null,
  loadouts: [],
}

afterEach(() => cleanup())

describe('AttachmentPicker', () => {
  it('renders a role selector and bodyguard dropdown for a character unit', () => {
    vi.mocked(trpc.listV2.eligibleBodyguards.useQuery).mockReturnValue({
      data: [bgUnit],
      isLoading: false,
    } as ReturnType<typeof trpc.listV2.eligibleBodyguards.useQuery>)
    vi.mocked(trpc.listV2.canDeploySolo.useQuery).mockReturnValue({
      data: { canDeploySolo: true },
      isLoading: false,
    } as ReturnType<typeof trpc.listV2.canDeploySolo.useQuery>)

    render(
      <AttachmentPicker
        listId="list-1"
        unit={makeUnit()}
        getBodyguardName={(id) => id ?? 'unknown'}
        onAttach={vi.fn()}
      />,
    )

    // Role selector visible
    expect(screen.getByRole('combobox', { name: /role/i })).toBeDefined()
    // "Deploy solo" option present (canDeploySolo=true)
    expect(screen.getByText(/deploy solo/i)).toBeDefined()
  })

  it('does not show "Deploy solo" option when can_deploy_solo is false', () => {
    vi.mocked(trpc.listV2.eligibleBodyguards.useQuery).mockReturnValue({
      data: [bgUnit],
      isLoading: false,
    } as ReturnType<typeof trpc.listV2.eligibleBodyguards.useQuery>)
    vi.mocked(trpc.listV2.canDeploySolo.useQuery).mockReturnValue({
      data: { canDeploySolo: false },
      isLoading: false,
    } as ReturnType<typeof trpc.listV2.canDeploySolo.useQuery>)

    render(
      <AttachmentPicker
        listId="list-1"
        unit={makeUnit({ datasheetId: 'ds-support-only' })}
        getBodyguardName={(id) => id ?? 'unknown'}
        onAttach={vi.fn()}
      />,
    )

    expect(screen.queryByText(/deploy solo/i)).toBeNull()
  })

  it('shows currently attached unit as selected in bodyguard dropdown', () => {
    vi.mocked(trpc.listV2.eligibleBodyguards.useQuery).mockReturnValue({
      data: [bgUnit],
      isLoading: false,
    } as ReturnType<typeof trpc.listV2.eligibleBodyguards.useQuery>)
    vi.mocked(trpc.listV2.canDeploySolo.useQuery).mockReturnValue({
      data: { canDeploySolo: true },
      isLoading: false,
    } as ReturnType<typeof trpc.listV2.canDeploySolo.useQuery>)

    render(
      <AttachmentPicker
        listId="list-1"
        unit={makeUnit({ attachedToUnitId: 'lu-bg', attachRole: 'leader' })}
        getBodyguardName={(id) => (id === 'ds-intercessors' ? 'Intercessors' : 'unknown')}
        onAttach={vi.fn()}
      />,
    )

    // The "Attach to" select should have the attached bodyguard selected
    const select = screen.getByRole('combobox', { name: /attach to/i }) as HTMLSelectElement
    expect(select.value).toBe('lu-bg')
  })
})
