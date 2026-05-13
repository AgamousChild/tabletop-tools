import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

let jobsReturn: any
const mockYoutubeMutate = vi.fn()
const mockWebMutate = vi.fn()

vi.mock('../lib/trpc', () => ({
  trpc: {
    stats: {
      ingestJobs: { useQuery: vi.fn(() => jobsReturn) },
      triggerYoutubeIngest: { useMutation: vi.fn(() => ({ mutate: mockYoutubeMutate, isPending: false })) },
      triggerWebIngest: { useMutation: vi.fn(() => ({ mutate: mockWebMutate, isPending: false })) },
    },
  },
}))

import { IngestPage } from './IngestPage'

beforeEach(() => {
  jobsReturn = { data: null, isLoading: true, error: null, refetch: vi.fn() }
  mockYoutubeMutate.mockReset()
  mockWebMutate.mockReset()
})

describe('IngestPage', () => {
  it('shows loading state', () => {
    render(<IngestPage />)
    expect(screen.getByText('Loading ingest jobs...')).toBeInTheDocument()
  })

  it('shows error message on failure', () => {
    jobsReturn = { data: null, isLoading: false, error: { message: 'DB connection failed' }, refetch: vi.fn() }
    render(<IngestPage />)
    expect(screen.getByText('DB connection failed')).toBeInTheDocument()
  })

  it('shows empty state when no jobs', () => {
    jobsReturn = { data: [], isLoading: false, error: null, refetch: vi.fn() }
    render(<IngestPage />)
    expect(screen.getByText('No ingest jobs recorded yet.')).toBeInTheDocument()
  })

  it('renders job history table with rows', () => {
    jobsReturn = {
      data: [
        {
          id: 'ij1',
          url: 'https://youtube.com/watch?v=abc123',
          sourceType: 'youtube',
          sourceName: 'Auspex Tactics',
          title: 'New Balance Dataslate Review',
          status: 'completed',
          nodesExtracted: 5,
          createdAt: new Date('2026-05-10T12:00:00Z'),
          completedAt: new Date('2026-05-10T12:05:00Z'),
          error: null,
        },
        {
          id: 'ij2',
          url: 'https://example.com/article',
          sourceType: 'web',
          sourceName: 'WHC',
          title: null,
          status: 'failed',
          nodesExtracted: 0,
          createdAt: new Date('2026-05-09T10:00:00Z'),
          completedAt: null,
          error: 'Extraction failed',
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }
    render(<IngestPage />)
    expect(screen.getByText('(2)')).toBeInTheDocument()
    expect(screen.getAllByText('URL').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Nodes')).toBeInTheDocument()
    expect(screen.getByText('New Balance Dataslate Review')).toBeInTheDocument()
    expect(screen.getByText('youtube')).toBeInTheDocument()
    expect(screen.getByText('web')).toBeInTheDocument()
  })

  it('submits YouTube ingest on button click', () => {
    jobsReturn = { data: [], isLoading: false, error: null, refetch: vi.fn() }
    render(<IngestPage />)

    const urlInput = screen.getByPlaceholderText('https://youtube.com/watch?v=... or https://...')
    fireEvent.change(urlInput, { target: { value: 'https://youtube.com/watch?v=test' } })
    fireEvent.click(screen.getByText('Submit'))
    expect(mockYoutubeMutate).toHaveBeenCalledTimes(1)
    expect(mockYoutubeMutate).toHaveBeenCalledWith(
      { url: 'https://youtube.com/watch?v=test', sourceName: 'Auspex Tactics' },
      expect.any(Object),
    )
  })

  it('submits Web ingest when web type selected', () => {
    jobsReturn = { data: [], isLoading: false, error: null, refetch: vi.fn() }
    render(<IngestPage />)

    fireEvent.click(screen.getByText('Web'))
    const urlInput = screen.getByPlaceholderText('https://youtube.com/watch?v=... or https://...')
    fireEvent.change(urlInput, { target: { value: 'https://example.com/article' } })
    fireEvent.click(screen.getByText('Submit'))
    expect(mockWebMutate).toHaveBeenCalledTimes(1)
  })

  it('disables submit when URL is empty', () => {
    jobsReturn = { data: [], isLoading: false, error: null, refetch: vi.fn() }
    render(<IngestPage />)
    const submitBtn = screen.getByText('Submit')
    expect(submitBtn).toBeDisabled()
  })
})
