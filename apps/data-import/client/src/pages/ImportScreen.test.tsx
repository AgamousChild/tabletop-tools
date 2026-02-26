import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ImportScreen } from './ImportScreen'

// Mock the game-data-store module partially
vi.mock('@tabletop-tools/game-data-store', async () => {
  const actual = await vi.importActual<typeof import('@tabletop-tools/game-data-store')>('@tabletop-tools/game-data-store')
  return {
    ...actual,
    getImportMeta: vi.fn(actual.getImportMeta),
    getRulesImportMeta: vi.fn(actual.getRulesImportMeta),
    listFactions: vi.fn(actual.listFactions),
    searchUnits: vi.fn(actual.searchUnits),
  }
})

import { getImportMeta, getRulesImportMeta, listFactions as listStoredFactions, searchUnits } from '@tabletop-tools/game-data-store'
const mockGetImportMeta = vi.mocked(getImportMeta)
const mockGetRulesImportMeta = vi.mocked(getRulesImportMeta)
const mockListStoredFactions = vi.mocked(listStoredFactions)
const mockSearchUnits = vi.mocked(searchUnits)

// Mock the github module
vi.mock('../lib/github', () => ({
  listCatalogFiles: vi.fn(),
  fetchCatalogXml: vi.fn(),
  RateLimitError: class RateLimitError extends Error {
    resetAt: Date
    constructor(resetAt: Date, message?: string) {
      super(message ?? `Rate limited. Try again at ${resetAt.toLocaleTimeString()}.`)
      this.name = 'RateLimitError'
      this.resetAt = resetAt
    }
  },
}))

// Mock wahapedia module
vi.mock('../lib/wahapedia', () => ({
  importWahapediaRules: vi.fn(),
  isWahapediaAvailable: vi.fn().mockResolvedValue(false),
}))

import { listCatalogFiles, fetchCatalogXml } from '../lib/github'

const mockListCatalogFiles = vi.mocked(listCatalogFiles)
const _mockFetchCatalogXml = vi.mocked(fetchCatalogXml)

beforeEach(() => {
  mockListCatalogFiles.mockReset()
  _mockFetchCatalogXml.mockReset()
  // Clear IndexedDB
  const dbs = indexedDB.databases ? indexedDB.databases() : Promise.resolve([])
  dbs.then((databases: IDBDatabaseInfo[]) => {
    for (const db of databases) {
      if (db.name) indexedDB.deleteDatabase(db.name)
    }
  })
})

function catalogResult(files: Array<{ name: string; faction: string; downloadUrl: string; size: number }>) {
  return { files, rateLimit: null }
}

describe('ImportScreen', () => {
  it('renders the import screen with title', () => {
    render(<ImportScreen />)
    expect(screen.getByText('Import')).toBeInTheDocument()
    expect(screen.getByText('Data')).toBeInTheDocument()
  })

  it('shows tab bar with three tabs', () => {
    render(<ImportScreen />)
    expect(screen.getByText('Unit Profiles')).toBeInTheDocument()
    expect(screen.getByText('Game Rules')).toBeInTheDocument()
    expect(screen.getByText('Stored Data')).toBeInTheDocument()
  })

  it('shows source input with default repo on unit profiles tab', () => {
    render(<ImportScreen />)
    const input = screen.getByDisplayValue('BSData/wh40k-10e')
    expect(input).toBeInTheDocument()
  })

  it('shows Load Catalog List button', () => {
    render(<ImportScreen />)
    expect(screen.getByText('Load Catalog List')).toBeInTheDocument()
  })

  it('loads catalog files when Load button clicked', async () => {
    mockListCatalogFiles.mockResolvedValueOnce(
      catalogResult([
        { name: 'Orks.cat', faction: 'Orks', downloadUrl: 'https://example.com/orks.cat', size: 200000 },
        { name: 'Aeldari.cat', faction: 'Aeldari', downloadUrl: 'https://example.com/aeldari.cat', size: 150000 },
      ]),
    )

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Load Catalog List'))

    await waitFor(() => {
      expect(screen.getByText('Orks')).toBeInTheDocument()
      expect(screen.getByText('Aeldari')).toBeInTheDocument()
    })
  })

  it('shows error when catalog loading fails', async () => {
    mockListCatalogFiles.mockRejectedValueOnce(new Error('GitHub API error: 403 Forbidden'))

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Load Catalog List'))

    await waitFor(() => {
      expect(screen.getByText('GitHub API error: 403 Forbidden')).toBeInTheDocument()
    })
  })

  it('shows faction count in select header', async () => {
    mockListCatalogFiles.mockResolvedValueOnce(
      catalogResult([
        { name: 'Orks.cat', faction: 'Orks', downloadUrl: 'https://example.com/orks.cat', size: 200000 },
      ]),
    )

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Load Catalog List'))

    await waitFor(() => {
      expect(screen.getByText('Select Factions (1/1)')).toBeInTheDocument()
    })
  })

  it('shows file sizes', async () => {
    mockListCatalogFiles.mockResolvedValueOnce(
      catalogResult([
        { name: 'Orks.cat', faction: 'Orks', downloadUrl: 'https://example.com/orks.cat', size: 200000 },
      ]),
    )

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Load Catalog List'))

    await waitFor(() => {
      expect(screen.getByText('195.3 KB')).toBeInTheDocument()
    })
  })

  it('toggles faction selection with All/None', async () => {
    mockListCatalogFiles.mockResolvedValueOnce(
      catalogResult([
        { name: 'Orks.cat', faction: 'Orks', downloadUrl: 'https://example.com/orks.cat', size: 200000 },
        { name: 'Aeldari.cat', faction: 'Aeldari', downloadUrl: 'https://example.com/aeldari.cat', size: 150000 },
      ]),
    )

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Load Catalog List'))

    await waitFor(() => {
      expect(screen.getByText('Select Factions (2/2)')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('None'))
    expect(screen.getByText('Select Factions (0/2)')).toBeInTheDocument()

    fireEvent.click(screen.getByText('All'))
    expect(screen.getByText('Select Factions (2/2)')).toBeInTheDocument()
  })

  it('shows BSData disclaimer in footer', () => {
    render(<ImportScreen />)
    expect(
      screen.getByText(/Data sourced from BSData.*Not affiliated with Games Workshop/),
    ).toBeInTheDocument()
  })

  it('toggles individual faction checkbox', async () => {
    mockListCatalogFiles.mockResolvedValueOnce(
      catalogResult([
        { name: 'Orks.cat', faction: 'Orks', downloadUrl: 'https://example.com/orks.cat', size: 200000 },
        { name: 'Aeldari.cat', faction: 'Aeldari', downloadUrl: 'https://example.com/aeldari.cat', size: 150000 },
      ]),
    )

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Load Catalog List'))

    await waitFor(() => {
      expect(screen.getByText('Select Factions (2/2)')).toBeInTheDocument()
    })

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(screen.getByText('Select Factions (1/2)')).toBeInTheDocument()
  })

  it('shows previously imported data info', async () => {
    mockGetImportMeta.mockResolvedValue({ lastImport: 1700000000000, factions: ['Orks', 'Aeldari'], totalUnits: 42, parserVersion: 999 })
    mockListStoredFactions.mockResolvedValue(['Orks', 'Aeldari'])
    mockSearchUnits.mockResolvedValue([])

    render(<ImportScreen />)

    await waitFor(() => {
      expect(screen.getByText(/42 units/)).toBeInTheDocument()
    })
  })

  it('shows rate limit info when returned', async () => {
    mockListCatalogFiles.mockResolvedValueOnce({
      files: [{ name: 'Orks.cat', faction: 'Orks', downloadUrl: 'https://example.com/orks.cat', size: 200000 }],
      rateLimit: { remaining: 5, limit: 60, resetAt: new Date(Date.now() + 3600000) },
    })

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Load Catalog List'))

    await waitFor(() => {
      expect(screen.getByText(/5.*remaining/i)).toBeInTheDocument()
    })
  })

  // ── Game Rules tab tests ──────────────────────────────────────────────────

  it('shows game rules content when Game Rules tab clicked', () => {
    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Game Rules'))
    expect(screen.getByText('Game Rules Data')).toBeInTheDocument()
  })

  it('shows warning when wahapedia data not available', () => {
    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Game Rules'))
    expect(screen.getByText(/Game rules data not found/)).toBeInTheDocument()
  })

  // ── Stored Data tab tests ─────────────────────────────────────────────────

  it('shows stored data tab with empty state', () => {
    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Stored Data'))
    expect(screen.getByText('No unit profiles imported yet.')).toBeInTheDocument()
    expect(screen.getByText('No game rules imported yet.')).toBeInTheDocument()
  })

  it('shows stored data summary when data exists', async () => {
    mockGetImportMeta.mockResolvedValue({ lastImport: 1700000000000, factions: ['Orks'], totalUnits: 42, parserVersion: 999 })
    mockGetRulesImportMeta.mockResolvedValue({
      lastImport: 1700000000000,
      counts: { detachments: 10, stratagems: 20, enhancements: 5, leaderAttachments: 15, unitCompositions: 30, unitCosts: 25, wargearOptions: 40, unitKeywords: 100, unitAbilities: 50 },
    })
    mockListStoredFactions.mockResolvedValue(['Orks'])
    mockSearchUnits.mockResolvedValue([])

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Stored Data'))

    await waitFor(() => {
      expect(screen.getByText(/42 units/)).toBeInTheDocument()
      expect(screen.getByText(/295 total items/)).toBeInTheDocument()
    })
  })
})
