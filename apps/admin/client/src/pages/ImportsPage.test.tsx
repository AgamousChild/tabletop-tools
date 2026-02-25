import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let queryReturn: any

vi.mock('../lib/trpc', () => ({
  trpc: {
    stats: {
      importHistory: { useQuery: vi.fn(() => queryReturn) },
    },
  },
}))

import { ImportsPage } from './ImportsPage'

beforeEach(() => {
  queryReturn = { data: null, isLoading: true, error: null }
})

describe('ImportsPage', () => {
  it('shows loading state', () => {
    render(<ImportsPage />)
    expect(screen.getByText('Loading imports...')).toBeInTheDocument()
  })

  it('shows error message on failure', () => {
    queryReturn = { data: null, isLoading: false, error: { message: 'DB error' } }
    render(<ImportsPage />)
    expect(screen.getByText('DB error')).toBeInTheDocument()
  })

  it('shows empty state when no imports', () => {
    queryReturn = { data: [], isLoading: false, error: null }
    render(<ImportsPage />)
    expect(screen.getByText('No tournament data imported yet.')).toBeInTheDocument()
  })

  it('renders import count in header', () => {
    queryReturn = {
      data: [
        { id: 'i1', eventName: 'GT Alpha', format: 'bcp-csv', metaWindow: '2026-W04', playerCount: 32, importedAt: 1706745600000 },
        { id: 'i2', eventName: 'GT Beta', format: 'tabletop-admiral-csv', metaWindow: '2026-W05', playerCount: 48, importedAt: 1707350400000 },
      ],
      isLoading: false,
      error: null,
    }
    render(<ImportsPage />)
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })

  it('renders table with correct columns', () => {
    queryReturn = {
      data: [
        { id: 'i1', eventName: 'GT Alpha', format: 'bcp-csv', metaWindow: '2026-W04', playerCount: 32, importedAt: 1706745600000 },
      ],
      isLoading: false,
      error: null,
    }
    render(<ImportsPage />)
    expect(screen.getByText('Event')).toBeInTheDocument()
    expect(screen.getByText('Format')).toBeInTheDocument()
    expect(screen.getByText('Meta Window')).toBeInTheDocument()
    expect(screen.getByText('Players')).toBeInTheDocument()
    expect(screen.getByText('Imported')).toBeInTheDocument()
  })

  it('shows format labels correctly', () => {
    queryReturn = {
      data: [
        { id: 'i1', eventName: 'GT Alpha', format: 'bcp-csv', metaWindow: '2026-W04', playerCount: 32, importedAt: 1706745600000 },
        { id: 'i2', eventName: 'GT Beta', format: 'tabletop-admiral-csv', metaWindow: '2026-W05', playerCount: 48, importedAt: 1707350400000 },
      ],
      isLoading: false,
      error: null,
    }
    render(<ImportsPage />)
    expect(screen.getByText('BCP')).toBeInTheDocument()
    expect(screen.getByText('TA')).toBeInTheDocument()
  })

  it('renders event names and meta windows', () => {
    queryReturn = {
      data: [
        { id: 'i1', eventName: 'GT Alpha', format: 'bcp-csv', metaWindow: '2026-W04', playerCount: 32, importedAt: 1706745600000 },
      ],
      isLoading: false,
      error: null,
    }
    render(<ImportsPage />)
    expect(screen.getByText('GT Alpha')).toBeInTheDocument()
    expect(screen.getByText('2026-W04')).toBeInTheDocument()
  })

  it('renders player counts', () => {
    queryReturn = {
      data: [
        { id: 'i1', eventName: 'GT Alpha', format: 'bcp-csv', metaWindow: '2026-W04', playerCount: 32, importedAt: 1706745600000 },
      ],
      isLoading: false,
      error: null,
    }
    render(<ImportsPage />)
    expect(screen.getByText('32')).toBeInTheDocument()
  })
})
