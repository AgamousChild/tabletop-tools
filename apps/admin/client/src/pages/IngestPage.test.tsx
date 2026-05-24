import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let sourcesReturn: any
let jobsReturn: any
const mockAddSource = vi.fn()
const mockToggleSource = vi.fn()
const mockDiscover = vi.fn()
const mockProcess = vi.fn()
const mockYoutubeMutate = vi.fn()
const mockWebMutate = vi.fn()

vi.mock('../lib/trpc', () => ({
  trpc: {
    stats: {
      ingestSourcesList: { useQuery: vi.fn(() => sourcesReturn) },
      ingestJobs: { useQuery: vi.fn(() => jobsReturn) },
      addIngestSource: { useMutation: vi.fn(() => ({ mutate: mockAddSource, isPending: false })) },
      toggleIngestSource: {
        useMutation: vi.fn(() => ({ mutate: mockToggleSource, isPending: false })),
      },
      triggerDiscover: { useMutation: vi.fn(() => ({ mutate: mockDiscover, isPending: false })) },
      triggerProcess: { useMutation: vi.fn(() => ({ mutate: mockProcess, isPending: false })) },
      triggerYoutubeIngest: {
        useMutation: vi.fn(() => ({ mutate: mockYoutubeMutate, isPending: false })),
      },
      triggerWebIngest: { useMutation: vi.fn(() => ({ mutate: mockWebMutate, isPending: false })) },
    },
  },
}))

import { IngestPage } from './IngestPage'

beforeEach(() => {
  sourcesReturn = { data: [], isLoading: false, error: null, refetch: vi.fn() }
  jobsReturn = { data: [], isLoading: false, error: null, refetch: vi.fn() }
  mockAddSource.mockReset()
  mockToggleSource.mockReset()
  mockDiscover.mockReset()
  mockProcess.mockReset()
  mockYoutubeMutate.mockReset()
  mockWebMutate.mockReset()
})

describe('IngestPage', () => {
  it('shows loading state', () => {
    sourcesReturn = { data: null, isLoading: true, error: null, refetch: vi.fn() }
    jobsReturn = { data: null, isLoading: true, error: null, refetch: vi.fn() }
    render(<IngestPage />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows empty state when no content', () => {
    render(<IngestPage />)
    expect(
      screen.getByText('No content discovered yet. Add sources and run discovery.'),
    ).toBeInTheDocument()
  })

  it('renders sources section with active/paused toggles', () => {
    sourcesReturn = {
      data: [
        {
          id: 'auspex-tactics',
          name: 'Auspex Tactics',
          url: 'https://youtube.com/@AuspexTactics',
          type: 'youtube',
          active: 1,
        },
        {
          id: 'goonhammer',
          name: 'Goonhammer',
          url: 'https://goonhammer.com/',
          type: 'web',
          active: 0,
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }
    render(<IngestPage />)
    // Sources appear in both the list and filter tabs — check for the toggle buttons
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.getByText('youtube')).toBeInTheDocument()
    expect(screen.getByText('web')).toBeInTheDocument()
  })

  it('renders content table with titles', () => {
    sourcesReturn = {
      data: [
        {
          id: 'auspex',
          name: 'Auspex Tactics',
          url: 'https://youtube.com/@AuspexTactics',
          type: 'youtube',
          active: 1,
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }
    jobsReturn = {
      data: [
        {
          id: 'ic1',
          url: 'https://youtube.com/watch?v=abc',
          title: '11th Edition Reveals',
          sourceId: 'auspex',
          sourceType: 'youtube',
          sourceName: 'Auspex Tactics',
          status: 'completed',
          nodesExtracted: 5,
          createdAt: Date.now() - 3600000,
        },
        {
          id: 'ic2',
          url: 'https://goonhammer.com/article',
          title: 'Faction Focus Review',
          sourceId: 'goonhammer',
          sourceType: 'web',
          sourceName: 'Goonhammer',
          status: 'discovered',
          nodesExtracted: 0,
          createdAt: Date.now(),
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }
    render(<IngestPage />)
    expect(screen.getByText('11th Edition Reveals')).toBeInTheDocument()
    expect(screen.getByText('Faction Focus Review')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })

  it('shows discover and process buttons', () => {
    render(<IngestPage />)
    expect(screen.getByText('Discover New Content')).toBeInTheDocument()
    expect(screen.getByText('Process Discovered')).toBeInTheDocument()
  })

  it('submits manual YouTube ingest', () => {
    render(<IngestPage />)
    const urlInput = screen.getByPlaceholderText('Paste a single URL to ingest')
    fireEvent.change(urlInput, { target: { value: 'https://youtube.com/watch?v=test' } })
    fireEvent.click(screen.getByText('Ingest'))
    expect(mockYoutubeMutate).toHaveBeenCalledTimes(1)
    expect(mockYoutubeMutate).toHaveBeenCalledWith(
      { url: 'https://youtube.com/watch?v=test' },
      expect.any(Object),
    )
  })

  it('submits manual Web ingest', () => {
    render(<IngestPage />)
    // The manual type toggle has "Web" as a button — find it by role to avoid the <option> conflict
    const webButtons = screen.getAllByText('Web')
    const webToggle = webButtons.find((el) => el.tagName === 'BUTTON')!
    fireEvent.click(webToggle)
    const urlInput = screen.getByPlaceholderText('Paste a single URL to ingest')
    fireEvent.change(urlInput, { target: { value: 'https://example.com/article' } })
    fireEvent.click(screen.getByText('Ingest'))
    expect(mockWebMutate).toHaveBeenCalledTimes(1)
  })

  it('disables ingest when URL is empty', () => {
    render(<IngestPage />)
    const ingestBtn = screen.getByText('Ingest')
    expect(ingestBtn).toBeDisabled()
  })
})
