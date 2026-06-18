import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let statusReturn: any
let historyReturn: any
const mockScrapeMutate = vi.fn()
const mockPipelineMutate = vi.fn()

vi.mock('../lib/trpc', () => ({
  trpc: {
    stats: {
      bcpScraperStatus: { useQuery: vi.fn(() => statusReturn) },
      bcpScraperHistory: { useQuery: vi.fn(() => historyReturn) },
      triggerBcpScrape: {
        useMutation: vi.fn(() => ({ mutate: mockScrapeMutate, isPending: false })),
      },
      triggerMetaPipeline: {
        useMutation: vi.fn(() => ({ mutate: mockPipelineMutate, isPending: false })),
      },
    },
  },
}))

import { ScraperPage } from './ScraperPage'

beforeEach(() => {
  statusReturn = { data: null, isLoading: true, error: null }
  historyReturn = { data: null, isLoading: true, error: null }
  mockScrapeMutate.mockReset()
  mockPipelineMutate.mockReset()
})

describe('ScraperPage', () => {
  it('shows loading state', () => {
    render(<ScraperPage />)
    expect(screen.getByText('Loading scraper status...')).toBeInTheDocument()
  })

  it('shows error message on failure', () => {
    statusReturn = { data: null, isLoading: false, error: { message: 'DB connection failed' } }
    render(<ScraperPage />)
    expect(screen.getByText('DB connection failed')).toBeInTheDocument()
  })

  it('shows empty state when no jobs exist', () => {
    statusReturn = { data: { latestJob: null, totalEvents: 0 }, isLoading: false, error: null }
    historyReturn = { data: [], isLoading: false, error: null }
    render(<ScraperPage />)
    expect(screen.getByText('No jobs')).toBeInTheDocument()
    expect(screen.getByText('No scrape jobs recorded yet.')).toBeInTheDocument()
  })

  it('renders status card with latest job data', () => {
    statusReturn = {
      data: {
        latestJob: {
          id: 'j1',
          startedAt: new Date('2026-05-10T12:00:00Z'),
          completedAt: new Date('2026-05-10T12:05:00Z'),
          status: 'completed',
          eventsFound: 10,
          eventsScraped: 8,
          pairingsScraped: 50,
          listsScraped: 0,
          errors: null,
          triggeredBy: 'cron',
        },
        totalEvents: 42,
      },
      isLoading: false,
      error: null,
    }
    historyReturn = { data: [], isLoading: false, error: null }
    render(<ScraperPage />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getAllByText('completed').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('cron').length).toBeGreaterThanOrEqual(1)
  })

  it('renders history table with job rows', () => {
    statusReturn = {
      data: { latestJob: null, totalEvents: 0 },
      isLoading: false,
      error: null,
    }
    historyReturn = {
      data: [
        {
          id: 'j1',
          startedAt: new Date('2026-05-10T12:00:00Z'),
          completedAt: new Date('2026-05-10T12:05:00Z'),
          status: 'completed',
          eventsFound: 10,
          eventsScraped: 8,
          pairingsScraped: 50,
          listsScraped: 0,
          errors: null,
          triggeredBy: 'cron',
        },
        {
          id: 'j2',
          startedAt: new Date('2026-05-09T10:00:00Z'),
          completedAt: null,
          status: 'failed',
          eventsFound: 5,
          eventsScraped: 2,
          pairingsScraped: 10,
          listsScraped: 0,
          errors: 'Timeout after 30s',
          triggeredBy: 'manual',
        },
      ],
      isLoading: false,
      error: null,
    }
    render(<ScraperPage />)
    expect(screen.getByText('(2)')).toBeInTheDocument()
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Found')).toBeInTheDocument()
    expect(screen.getByText('Timeout after 30s')).toBeInTheDocument()
  })

  it('calls triggerBcpScrape on Run Now button click', () => {
    statusReturn = {
      data: { latestJob: null, totalEvents: 0 },
      isLoading: false,
      error: null,
    }
    historyReturn = { data: [], isLoading: false, error: null }
    render(<ScraperPage />)
    fireEvent.click(screen.getByText('Run Scraper Now'))
    expect(mockScrapeMutate).toHaveBeenCalledTimes(1)
  })

  it('calls triggerMetaPipeline on Rebuild Cube button click', () => {
    statusReturn = {
      data: { latestJob: null, totalEvents: 0 },
      isLoading: false,
      error: null,
    }
    historyReturn = { data: [], isLoading: false, error: null }
    render(<ScraperPage />)
    fireEvent.click(screen.getByText('Rebuild Cube'))
    expect(mockPipelineMutate).toHaveBeenCalledTimes(1)
  })
})
