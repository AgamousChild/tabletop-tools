import type * as GameDataStore from '@tabletop-tools/game-data-store'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ImportScreen } from './ImportScreen'

// Mock the game-data-store module partially
vi.mock('@tabletop-tools/game-data-store', async () => {
  const actual = await vi.importActual<typeof GameDataStore>('@tabletop-tools/game-data-store')
  return {
    ...actual,
    getImportMeta: vi.fn(actual.getImportMeta),
    getRulesImportMeta: vi.fn(actual.getRulesImportMeta),
    listFactions: vi.fn(actual.listFactions),
    searchUnits: vi.fn(actual.searchUnits),
  }
})

import {
  getImportMeta,
  getRulesImportMeta,
  listFactions as listStoredFactions,
  searchUnits,
} from '@tabletop-tools/game-data-store'
const mockGetImportMeta = vi.mocked(getImportMeta)
const mockGetRulesImportMeta = vi.mocked(getRulesImportMeta)
const mockListStoredFactions = vi.mocked(listStoredFactions)
const mockSearchUnits = vi.mocked(searchUnits)

// Mock sync module
vi.mock('../lib/sync', () => ({
  checkForUpdates: vi.fn(),
  syncAllData: vi.fn(),
}))

import { checkForUpdates, syncAllData } from '../lib/sync'
const mockCheckForUpdates = vi.mocked(checkForUpdates)
const mockSyncAllData = vi.mocked(syncAllData)

beforeEach(() => {
  mockCheckForUpdates.mockReset()
  mockSyncAllData.mockReset()
  const dbs = indexedDB.databases ? indexedDB.databases() : Promise.resolve([])
  dbs.then((databases: IDBDatabaseInfo[]) => {
    for (const db of databases) {
      if (db.name) indexedDB.deleteDatabase(db.name)
    }
  })
})

describe('ImportScreen', () => {
  it('renders the import screen with title', () => {
    render(<ImportScreen />)
    expect(screen.getByText('Import')).toBeInTheDocument()
    expect(screen.getByText('Data')).toBeInTheDocument()
  })

  it('shows tab bar with two tabs', () => {
    render(<ImportScreen />)
    expect(screen.getByText('Sync')).toBeInTheDocument()
    expect(screen.getByText('Stored Data')).toBeInTheDocument()
  })

  it('shows Check for Updates button on sync tab', () => {
    render(<ImportScreen />)
    expect(screen.getByText('Check for Updates')).toBeInTheDocument()
  })

  it('shows BSData disclaimer in footer', () => {
    render(<ImportScreen />)
    expect(
      screen.getByText(/Data sourced from BSData.*Not affiliated with Games Workshop/),
    ).toBeInTheDocument()
  })

  // ── Sync tab tests ──────────────────────────────────────────────────────

  it('checks for updates and shows availability', async () => {
    mockCheckForUpdates.mockResolvedValueOnce({
      available: true,
      manifest: {
        version: 2,
        updatedAt: '2024-01-15T03:00:00Z',
        bsdata: { commitSha: 'abc', unitCount: 500, factionCount: 20 },
        wahapedia: { lastUpdate: '2024-01-15', recordCounts: { datasheets: 300 } },
        files: [],
      },
    })

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Check for Updates'))

    await waitFor(() => {
      expect(screen.getByText(/Update available/)).toBeInTheDocument()
      expect(screen.getByText(/500 units/)).toBeInTheDocument()
    })
  })

  it('shows up-to-date message when no updates', async () => {
    mockCheckForUpdates.mockResolvedValueOnce({
      available: false,
      manifest: {
        version: 1,
        updatedAt: '2024-01-15T03:00:00Z',
        files: [],
      },
    })

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Check for Updates'))

    await waitFor(() => {
      expect(screen.getByText(/Data is up to date/)).toBeInTheDocument()
    })
  })

  it('shows error when check fails', async () => {
    mockCheckForUpdates.mockResolvedValueOnce({
      available: false,
      manifest: null,
    })

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Check for Updates'))

    await waitFor(() => {
      expect(screen.getByText(/Could not reach the data server/)).toBeInTheDocument()
    })
  })

  it('syncs data when Sync button clicked', async () => {
    const manifest = {
      version: 2,
      updatedAt: '2024-01-15T03:00:00Z',
      files: ['bsdata-units.json', 'datasheets.json'],
    }
    mockCheckForUpdates.mockResolvedValueOnce({
      available: true,
      manifest,
    })
    mockSyncAllData.mockResolvedValueOnce({
      unitCount: 500,
      rulesCount: 1200,
      errors: [],
    })

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Check for Updates'))

    await waitFor(() => {
      expect(screen.getByText(/Sync All Data/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Sync All Data'))

    await waitFor(() => {
      expect(screen.getByText('Sync Complete')).toBeInTheDocument()
      expect(screen.getByText(/500 unit profiles/)).toBeInTheDocument()
      expect(screen.getByText(/1,200 rules items/)).toBeInTheDocument()
    })
  })

  it('shows sync errors in collapsible details', async () => {
    const manifest = { version: 1, updatedAt: '2024-01-15T03:00:00Z', files: [] }
    mockCheckForUpdates.mockResolvedValueOnce({ available: true, manifest })
    mockSyncAllData.mockResolvedValueOnce({
      unitCount: 0,
      rulesCount: 0,
      errors: ['Failed to fetch datasheets.json'],
    })

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Check for Updates'))

    await waitFor(() => expect(screen.getByText(/Sync All Data/)).toBeInTheDocument())
    fireEvent.click(screen.getByText('Sync All Data'))

    await waitFor(() => {
      expect(screen.getByText('1 error')).toBeInTheDocument()
    })
  })

  it('shows current data status when meta exists', async () => {
    mockGetImportMeta.mockResolvedValue({
      lastImport: 1700000000000,
      factions: ['Orks'],
      totalUnits: 42,
      parserVersion: 999,
    })
    mockListStoredFactions.mockResolvedValue(['Orks'])
    mockSearchUnits.mockResolvedValue([])

    render(<ImportScreen />)

    await waitFor(() => {
      expect(screen.getByText(/42 units/)).toBeInTheDocument()
    })
  })

  // ── Stored Data tab tests ───────────────────────────────────────────────

  it('shows stored data tab with empty state', () => {
    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Stored Data'))
    expect(screen.getByText('No unit profiles imported yet.')).toBeInTheDocument()
    expect(screen.getByText('No game rules imported yet.')).toBeInTheDocument()
  })

  it('shows stored data summary when data exists', async () => {
    mockGetImportMeta.mockResolvedValue({
      lastImport: 1700000000000,
      factions: ['Orks'],
      totalUnits: 42,
      parserVersion: 999,
    })
    mockGetRulesImportMeta.mockResolvedValue({
      lastImport: 1700000000000,
      counts: {
        detachments: 10,
        stratagems: 20,
        enhancements: 5,
        leaderAttachments: 15,
        unitCompositions: 30,
        unitCosts: 25,
        wargearOptions: 40,
        unitKeywords: 100,
        unitAbilities: 50,
      },
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

  it('shows weapon counts in stored data tab', async () => {
    mockGetImportMeta.mockResolvedValue({
      lastImport: 1700000000000,
      factions: ['Orks'],
      totalUnits: 10,
      parserVersion: 999,
    })
    mockListStoredFactions.mockResolvedValue(['Orks'])
    mockSearchUnits.mockResolvedValue([
      {
        id: '1',
        faction: 'Orks',
        name: 'U1',
        move: 6,
        toughness: 4,
        save: 3,
        wounds: 2,
        leadership: 6,
        oc: 1,
        weapons: [
          {
            name: 'Gun',
            range: 24,
            attacks: 2,
            skill: 3,
            strength: 4,
            ap: 0,
            damage: 1,
            abilities: [],
          },
          {
            name: 'Blade',
            range: 'melee' as const,
            attacks: 3,
            skill: 3,
            strength: 4,
            ap: 0,
            damage: 1,
            abilities: [],
          },
        ],
        abilities: [],
        points: 50,
      },
    ])

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Stored Data'))

    await waitFor(() => {
      expect(screen.getByText(/2 weapons/)).toBeInTheDocument()
    })
  })

  it('shows legends toggle in settings', () => {
    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Stored Data'))
    expect(screen.getByText('Include Legends units')).toBeInTheDocument()
  })
})
