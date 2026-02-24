import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ImportScreen } from './ImportScreen'

// Mock the github module
vi.mock('../lib/github', () => ({
  listCatalogFiles: vi.fn(),
  fetchCatalogXml: vi.fn(),
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

describe('ImportScreen', () => {
  it('renders the import screen with title', () => {
    render(<ImportScreen />)
    expect(screen.getByText('Import')).toBeInTheDocument()
    expect(screen.getByText('Data')).toBeInTheDocument()
  })

  it('shows source input with default repo', () => {
    render(<ImportScreen />)
    const input = screen.getByDisplayValue('BSData/wh40k-10e')
    expect(input).toBeInTheDocument()
  })

  it('shows Load Catalog List button', () => {
    render(<ImportScreen />)
    expect(screen.getByText('Load Catalog List')).toBeInTheDocument()
  })

  it('loads catalog files when Load button clicked', async () => {
    mockListCatalogFiles.mockResolvedValueOnce([
      { name: 'Orks.cat', faction: 'Orks', downloadUrl: 'https://example.com/orks.cat', size: 200000 },
      { name: 'Aeldari.cat', faction: 'Aeldari', downloadUrl: 'https://example.com/aeldari.cat', size: 150000 },
    ])

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
    mockListCatalogFiles.mockResolvedValueOnce([
      { name: 'Orks.cat', faction: 'Orks', downloadUrl: 'https://example.com/orks.cat', size: 200000 },
    ])

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Load Catalog List'))

    await waitFor(() => {
      expect(screen.getByText('Select Factions (1/1)')).toBeInTheDocument()
    })
  })

  it('shows file sizes', async () => {
    mockListCatalogFiles.mockResolvedValueOnce([
      { name: 'Orks.cat', faction: 'Orks', downloadUrl: 'https://example.com/orks.cat', size: 200000 },
    ])

    render(<ImportScreen />)
    fireEvent.click(screen.getByText('Load Catalog List'))

    await waitFor(() => {
      expect(screen.getByText('195.3 KB')).toBeInTheDocument()
    })
  })

  it('toggles faction selection with All/None', async () => {
    mockListCatalogFiles.mockResolvedValueOnce([
      { name: 'Orks.cat', faction: 'Orks', downloadUrl: 'https://example.com/orks.cat', size: 200000 },
      { name: 'Aeldari.cat', faction: 'Aeldari', downloadUrl: 'https://example.com/aeldari.cat', size: 150000 },
    ])

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
})
