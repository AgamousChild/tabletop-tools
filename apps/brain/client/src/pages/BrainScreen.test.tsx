import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BrainScreen } from './BrainScreen'

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: any) => <div data-testid="react-flow">{props.children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
}))

// Mock fetch for Browse tab API calls
const mockFetch = vi.fn()
beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ layers: [{ id: 'core', label: 'Core Rules', count: 42 }] }),
  })
  global.fetch = mockFetch
  // Reset URL hash between tests so picker initial state is predictable.
  if (typeof window !== 'undefined') {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
})

/** Build a Response-shaped object that satisfies the brainFetch consumers. */
function mockJsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  const status = init.status ?? 200
  const headers = new Headers(init.headers ?? {})
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => body,
  } as unknown as Response
}

describe('BrainScreen', () => {
  it('renders the header', () => {
    render(<BrainScreen />)
    expect(screen.getByText('40K Brain')).toBeInTheDocument()
  })

  it('renders tab navigation with four tabs', () => {
    render(<BrainScreen />)
    expect(screen.getByTestId('tab-ask')).toBeInTheDocument()
    expect(screen.getByTestId('tab-search')).toBeInTheDocument()
    expect(screen.getByTestId('tab-browse')).toBeInTheDocument()
    expect(screen.getByTestId('tab-graph')).toBeInTheDocument()
  })

  it('shows Ask tab by default with prompt', () => {
    render(<BrainScreen />)
    expect(screen.getByPlaceholderText(/Ask a 40K rules question/)).toBeInTheDocument()
  })

  it('shows Search tab when clicked', () => {
    render(<BrainScreen />)
    fireEvent.click(screen.getByTestId('tab-search'))
    expect(screen.getByPlaceholderText(/Semantic search/)).toBeInTheDocument()
  })

  it('shows Graph tab with ForceGraph', () => {
    render(<BrainScreen />)
    fireEvent.click(screen.getByTestId('tab-graph'))
    expect(screen.getByPlaceholderText(/Search to visualize/i)).toBeInTheDocument()
  })

  it('shows Browse tab and fetches layers from API', async () => {
    render(<BrainScreen />)
    fireEvent.click(screen.getByTestId('tab-browse'))
    await waitFor(() => {
      expect(screen.getByText(/Core Rules/)).toBeInTheDocument()
    })
    // Should have called the browse/layers API
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/browse/layers'))
  })

  it('Browse tab shows "Select a layer" prompt before selection', async () => {
    render(<BrainScreen />)
    fireEvent.click(screen.getByTestId('tab-browse'))
    await waitFor(() => {
      expect(screen.getByText(/Select a layer/)).toBeInTheDocument()
    })
  })

  describe('edition picker', () => {
    it('renders the edition picker in the header with 11th selected by default', () => {
      render(<BrainScreen />)
      expect(screen.getByTestId('edition-picker')).toBeInTheDocument()
      expect(screen.getByTestId('edition-option-11th')).toHaveAttribute('aria-pressed', 'true')
    })

    it('writes the selection into the URL hash when changed', () => {
      render(<BrainScreen />)
      fireEvent.click(screen.getByTestId('edition-option-10th'))
      expect(window.location.hash).toContain('edition=10th')
    })

    it('threads edition into the browse/layers fetch', async () => {
      render(<BrainScreen />)
      fireEvent.click(screen.getByTestId('tab-browse'))
      await waitFor(() => {
        expect(screen.getByText(/Core Rules/)).toBeInTheDocument()
      })
      // browse/layers is global; subsequent /browse/nodes calls should carry edition.
      fireEvent.click(screen.getByText(/Core Rules/))
      await waitFor(() => {
        const editionCall = mockFetch.mock.calls.find((args) =>
          String(args[0]).includes('/browse/nodes'),
        )
        expect(editionCall).toBeDefined()
        expect(String(editionCall![0])).toContain('edition=11th')
      })
    })

    it('reads initial edition from URL hash', () => {
      window.history.replaceState(null, '', window.location.pathname + '#edition=9th')
      render(<BrainScreen />)
      expect(screen.getByTestId('edition-option-9th')).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('fallback banner', () => {
    it('shows the calm fallback banner when /ask returns fallback: true', async () => {
      mockFetch.mockReset()
      mockFetch.mockResolvedValue(
        mockJsonResponse({
          detected: { factions: [], keywords: [], strippedQuery: 'test' },
          answer: 'No 11e content found, here is some 10e info instead.',
          reference: [],
          sources: [],
          connectedCount: 0,
          fallback: true,
          fallbackFrom: '11th',
        }),
      )

      render(<BrainScreen />)
      fireEvent.change(screen.getByPlaceholderText(/Ask a 40K rules question/), {
        target: { value: 'what is a wound roll' },
      })
      // "Ask" appears twice (tab + submit button). Target the submit button by role.
      // Two "Ask" buttons exist (tab + submit). The submit button is the
      // one rendered inside the AskTab's flex row alongside the input.
      const askButtons = screen.getAllByRole('button', { name: 'Ask' })
      // The submit button is the last one in DOM order (rendered after the tabs).
      fireEvent.click(askButtons[askButtons.length - 1]!)

      await waitFor(() => {
        expect(screen.getByTestId('edition-fallback-banner')).toBeInTheDocument()
      })
      expect(
        screen.getByText(/No 11th edition results\. Showing all editions\./),
      ).toBeInTheDocument()
    })

    it('surfaces a one-tap switcher when /browse/unit returns 404 with X-Available-Editions', async () => {
      mockFetch.mockReset()
      // First call: search results — return one datasheet hit so we can click it.
      // Subsequent call: /browse/unit/:id — return 404 + X-Available-Editions: 10th.
      const searchHit = {
        id: 'wahapedia:datasheet:test-unit',
        score: 0.9,
        title: 'Test Unit',
        summary: 'A unit.',
        content: 'M6" T4 Sv3+ W2 Ld6+ OC1',
        layer: 'unit',
        category: 'datasheet',
        sources: [],
        keywords: [],
      }
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/search')) {
          return Promise.resolve(
            mockJsonResponse({
              detected: { factions: [], keywords: [], strippedQuery: '' },
              records: [
                {
                  type: 'unit',
                  primaryNode: searchHit,
                  childNodes: [],
                  crossRefs: [],
                  errata: [],
                  matchedChildIds: [],
                },
              ],
              total: 1,
              page: 1,
              pageSize: 10,
              totalPages: 1,
            }),
          )
        }
        if (url.includes('/browse/unit/')) {
          return Promise.resolve(
            mockJsonResponse({} as any, {
              status: 404,
              headers: { 'X-Available-Editions': '10th' },
            }),
          )
        }
        return Promise.resolve(mockJsonResponse({}))
      })

      render(<BrainScreen />)
      fireEvent.click(screen.getByTestId('tab-search'))
      fireEvent.change(screen.getByPlaceholderText(/Semantic search/), {
        target: { value: 'test unit' },
      })
      const searchButtons = screen.getAllByRole('button', { name: 'Search' })
      // last one is the submit button
      fireEvent.click(searchButtons[searchButtons.length - 1]!)

      await waitFor(() => {
        expect(screen.getByText('Test Unit')).toBeInTheDocument()
      })
      // Click the result row to open it
      fireEvent.click(screen.getByText('Test Unit'))

      await waitFor(() => {
        expect(screen.getByTestId('edition-not-available-notice')).toBeInTheDocument()
      })
      expect(screen.getByTestId('edition-switch-button')).toHaveTextContent(/Switch to 10th/)
    })

    it('does not show the fallback banner when /ask returns fallback: false', async () => {
      mockFetch.mockReset()
      mockFetch.mockResolvedValue(
        mockJsonResponse({
          detected: { factions: [], keywords: [], strippedQuery: 'test' },
          answer: 'Here is 11e info.',
          reference: [],
          sources: [],
          connectedCount: 0,
        }),
      )

      render(<BrainScreen />)
      fireEvent.change(screen.getByPlaceholderText(/Ask a 40K rules question/), {
        target: { value: 'what is a wound roll' },
      })
      // Two "Ask" buttons exist (tab + submit). The submit button is the
      // one rendered inside the AskTab's flex row alongside the input.
      const askButtons = screen.getAllByRole('button', { name: 'Ask' })
      // The submit button is the last one in DOM order (rendered after the tabs).
      fireEvent.click(askButtons[askButtons.length - 1]!)

      await waitFor(() => {
        expect(screen.getByText(/Here is 11e info/)).toBeInTheDocument()
      })
      expect(screen.queryByTestId('edition-fallback-banner')).not.toBeInTheDocument()
    })
  })

  describe('tab state persistence', () => {
    it('keeps all four tab panels mounted in the DOM regardless of active tab', () => {
      render(<BrainScreen />)
      // All four panels render at mount — three are hidden via the
      // `hidden` attribute, but their placeholder inputs are still in the DOM.
      expect(screen.getByPlaceholderText(/Ask a 40K rules question/)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Semantic search/)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Search to visualize/i)).toBeInTheDocument()
    })

    it('preserves Ask answer across a tab switch and back', async () => {
      mockFetch.mockReset()
      mockFetch.mockResolvedValue(
        mockJsonResponse({
          detected: { factions: [], keywords: [], strippedQuery: 'test' },
          answer: 'Persistent ask answer body.',
          reference: [],
          sources: [],
          connectedCount: 0,
        }),
      )

      render(<BrainScreen />)
      fireEvent.change(screen.getByPlaceholderText(/Ask a 40K rules question/), {
        target: { value: 'rule q' },
      })
      const askButtons = screen.getAllByRole('button', { name: 'Ask' })
      fireEvent.click(askButtons[askButtons.length - 1]!)

      await waitFor(() => {
        expect(screen.getByText(/Persistent ask answer body/)).toBeInTheDocument()
      })

      // Switch to Search then back to Ask — answer + input value must survive
      fireEvent.click(screen.getByTestId('tab-search'))
      fireEvent.click(screen.getByTestId('tab-ask'))

      expect(screen.getByText(/Persistent ask answer body/)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Ask a 40K rules question/)).toHaveValue('rule q')
    })

    it('preserves Search results across a tab switch and back', async () => {
      mockFetch.mockReset()
      mockFetch.mockResolvedValue(
        mockJsonResponse({
          detected: { factions: [], keywords: [], strippedQuery: '' },
          records: [
            {
              type: 'rule',
              primaryNode: {
                id: 'persistent-result',
                score: 0.9,
                title: 'Persistent Search Hit',
                summary: 'Summary text.',
                content: '',
                layer: 'core',
                category: 'rule',
                sources: [],
                keywords: [],
              },
              childNodes: [],
              crossRefs: [],
              errata: [],
              matchedChildIds: [],
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
      )

      render(<BrainScreen />)
      fireEvent.click(screen.getByTestId('tab-search'))
      fireEvent.change(screen.getByPlaceholderText(/Semantic search/), {
        target: { value: 'persistent' },
      })
      const searchButtons = screen.getAllByRole('button', { name: 'Search' })
      fireEvent.click(searchButtons[searchButtons.length - 1]!)

      await waitFor(() => {
        expect(screen.getByText('Persistent Search Hit')).toBeInTheDocument()
      })

      const searchCallCount = mockFetch.mock.calls.filter((args) =>
        String(args[0]).includes('/search'),
      ).length

      // Switch to Ask then back — results stay, no refetch fires
      fireEvent.click(screen.getByTestId('tab-ask'))
      fireEvent.click(screen.getByTestId('tab-search'))

      expect(screen.getByText('Persistent Search Hit')).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Semantic search/)).toHaveValue('persistent')

      const searchCallCountAfter = mockFetch.mock.calls.filter((args) =>
        String(args[0]).includes('/search'),
      ).length
      expect(searchCallCountAfter).toBe(searchCallCount)
    })

    it('Ask Clear results button wipes the answer', async () => {
      mockFetch.mockReset()
      mockFetch.mockResolvedValue(
        mockJsonResponse({
          detected: { factions: [], keywords: [], strippedQuery: 'test' },
          answer: 'Disposable ask answer.',
          reference: [],
          sources: [],
          connectedCount: 0,
        }),
      )

      render(<BrainScreen />)
      fireEvent.change(screen.getByPlaceholderText(/Ask a 40K rules question/), {
        target: { value: 'q' },
      })
      const askButtons = screen.getAllByRole('button', { name: 'Ask' })
      fireEvent.click(askButtons[askButtons.length - 1]!)

      await waitFor(() => {
        expect(screen.getByText(/Disposable ask answer/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('ask-clear-results'))
      expect(screen.queryByText(/Disposable ask answer/)).not.toBeInTheDocument()
    })

    it('Search Clear results button wipes the response', async () => {
      mockFetch.mockReset()
      mockFetch.mockResolvedValue(
        mockJsonResponse({
          detected: { factions: [], keywords: [], strippedQuery: '' },
          records: [
            {
              type: 'rule',
              primaryNode: {
                id: 'disposable',
                score: 0.5,
                title: 'Disposable Search Hit',
                summary: 's',
                content: '',
                layer: 'core',
                category: 'rule',
                sources: [],
                keywords: [],
              },
              childNodes: [],
              crossRefs: [],
              errata: [],
              matchedChildIds: [],
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
      )

      render(<BrainScreen />)
      fireEvent.click(screen.getByTestId('tab-search'))
      fireEvent.change(screen.getByPlaceholderText(/Semantic search/), {
        target: { value: 'disposable' },
      })
      const searchButtons = screen.getAllByRole('button', { name: 'Search' })
      fireEvent.click(searchButtons[searchButtons.length - 1]!)

      await waitFor(() => {
        expect(screen.getByText('Disposable Search Hit')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('search-clear-results'))
      expect(screen.queryByText('Disposable Search Hit')).not.toBeInTheDocument()
    })
  })
})
