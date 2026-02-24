import { useState, useEffect, useCallback } from 'react'
import { parseBSDataXml } from '@tabletop-tools/game-content/src/adapters/bsdata/parser'
import {
  saveUnits,
  setImportMeta,
  getImportMeta,
  listFactions as listStoredFactions,
  searchUnits,
  clearFaction,
  clearAll,
} from '@tabletop-tools/game-data-store'
import type { ImportMeta } from '@tabletop-tools/game-data-store'
import { listCatalogFiles, fetchCatalogXml, RateLimitError } from '../lib/github'
import type { CatalogFile, RateLimitInfo } from '../lib/github'

interface ImportProgress {
  current: number
  total: number
  currentFaction: string
}

interface ImportResult {
  totalUnits: number
  factions: number
  errors: string[]
}

type FactionStatus = 'pending' | 'importing' | 'success' | 'failed'

export function ImportScreen() {
  const [repo, setRepo] = useState('BSData/wh40k-10e')
  const [branch, setBranch] = useState('main')
  const [catalogs, setCatalogs] = useState<CatalogFile[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [factionStatuses, setFactionStatuses] = useState<Record<string, FactionStatus>>({})
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null)

  // Current data state
  const [currentMeta, setCurrentMeta] = useState<ImportMeta | null>(null)
  const [storedFactions, setStoredFactions] = useState<string[]>([])
  const [factionCounts, setFactionCounts] = useState<Record<string, number>>({})

  const refreshStoredData = useCallback(async () => {
    const [meta, factions] = await Promise.all([
      getImportMeta(),
      listStoredFactions(),
    ])
    setCurrentMeta(meta)
    setStoredFactions(factions)

    const counts: Record<string, number> = {}
    for (const f of factions) {
      const units = await searchUnits({ faction: f })
      counts[f] = units.length
    }
    setFactionCounts(counts)
  }, [])

  useEffect(() => {
    refreshStoredData()
  }, [refreshStoredData])

  const handleLoadCatalogs = async () => {
    setLoading(true)
    setLoadError(null)
    setCatalogs([])
    setSelected(new Set())
    setResult(null)
    setFactionStatuses({})
    setRateLimit(null)

    try {
      const { files, rateLimit: rl } = await listCatalogFiles(repo, branch)
      setCatalogs(files)
      setSelected(new Set(files.map((f) => f.name)))
      setRateLimit(rl)
    } catch (err) {
      if (err instanceof RateLimitError) {
        setLoadError(`Rate limited. Try again at ${err.resetAt.toLocaleTimeString()}.`)
      } else {
        setLoadError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setLoading(false)
    }
  }

  const toggleFaction = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const selectAll = () => setSelected(new Set(catalogs.map((f) => f.name)))
  const selectNone = () => setSelected(new Set())

  const importFactions = async (toImport: CatalogFile[]) => {
    if (toImport.length === 0) return

    setImporting(true)
    setResult(null)
    const allErrors: string[] = []
    let totalUnits = 0
    const successfulFactions: string[] = []

    // Initialize statuses for this batch
    setFactionStatuses((prev) => {
      const next = { ...prev }
      for (const file of toImport) {
        next[file.faction] = 'pending'
      }
      return next
    })

    for (let i = 0; i < toImport.length; i++) {
      const file = toImport[i]!
      setProgress({ current: i + 1, total: toImport.length, currentFaction: file.faction })
      setFactionStatuses((prev) => ({ ...prev, [file.faction]: 'importing' }))

      try {
        const xml = await fetchCatalogXml(file)
        const { units, errors } = parseBSDataXml(xml, file.faction)
        if (units.length > 0) {
          await saveUnits(units)
        }
        totalUnits += units.length
        allErrors.push(...errors)
        successfulFactions.push(file.faction)
        setFactionStatuses((prev) => ({ ...prev, [file.faction]: 'success' }))
      } catch (err) {
        allErrors.push(`${file.faction}: ${err instanceof Error ? err.message : String(err)}`)
        setFactionStatuses((prev) => ({ ...prev, [file.faction]: 'failed' }))
      }
    }

    // Only record successfully imported factions in metadata
    if (successfulFactions.length > 0) {
      await setImportMeta({
        lastImport: Date.now(),
        factions: successfulFactions,
        totalUnits,
      })
    }

    setResult({ totalUnits, factions: successfulFactions.length, errors: allErrors })
    setImporting(false)
    setProgress(null)
    await refreshStoredData()
  }

  const handleImport = () => {
    const toImport = catalogs.filter((c) => selected.has(c.name))
    return importFactions(toImport)
  }

  const handleRetryFailed = () => {
    const failedFactions = Object.entries(factionStatuses)
      .filter(([, status]) => status === 'failed')
      .map(([faction]) => faction)
    const toRetry = catalogs.filter((c) => failedFactions.includes(c.faction))
    return importFactions(toRetry)
  }

  const hasFailedFactions = Object.values(factionStatuses).some((s) => s === 'failed')

  const handleClearFaction = async (faction: string) => {
    await clearFaction(faction)
    await refreshStoredData()
  }

  const handleClearAll = async () => {
    await clearAll()
    await refreshStoredData()
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const statusIcon = (status: FactionStatus) => {
    switch (status) {
      case 'success':
        return <span className="text-emerald-400">✓</span>
      case 'failed':
        return <span className="text-red-400">✕</span>
      case 'importing':
        return <span className="text-amber-400 animate-pulse">●</span>
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100">
            Data <span className="text-amber-400">Import</span>
          </h1>
          <p className="mt-1 text-slate-400">
            Load unit data from BSData into your browser. No server needed.
          </p>
        </header>

        {/* Rate limit warning */}
        {rateLimit && rateLimit.remaining < 10 && (
          <div className="mb-4 rounded-lg border border-amber-800 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
            GitHub API: {rateLimit.remaining}/{rateLimit.limit} requests remaining.
            {rateLimit.remaining === 0 && (
              <> Resets at {rateLimit.resetAt.toLocaleTimeString()}.</>
            )}
          </div>
        )}

        {/* Current data state */}
        {storedFactions.length > 0 && (
          <section className="mb-8 rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Stored Data</h2>
              <button
                onClick={handleClearAll}
                className="rounded px-3 py-1 text-sm text-red-400 hover:bg-red-400/10"
              >
                Clear All
              </button>
            </div>
            {currentMeta && (
              <p className="mb-3 text-sm text-slate-400">
                Last import: {new Date(currentMeta.lastImport).toLocaleDateString()} —{' '}
                {currentMeta.totalUnits} units across {storedFactions.length} factions
              </p>
            )}
            <div className="space-y-1">
              {storedFactions.map((faction) => (
                <div
                  key={faction}
                  className="flex items-center justify-between rounded px-3 py-2 hover:bg-slate-800"
                >
                  <span className="text-sm text-slate-200">
                    {faction}{' '}
                    <span className="text-slate-500">({factionCounts[faction] ?? 0} units)</span>
                  </span>
                  <button
                    onClick={() => handleClearFaction(faction)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Source configuration */}
        <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-100">Source</h2>
          <div className="mb-3 flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-slate-400">Repository</label>
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                placeholder="BSData/wh40k-10e"
              />
            </div>
            <div className="w-32">
              <label className="mb-1 block text-sm text-slate-400">Branch</label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                placeholder="main"
              />
            </div>
          </div>
          <button
            onClick={handleLoadCatalogs}
            disabled={loading || importing}
            className="rounded bg-amber-400 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-300 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load Catalog List'}
          </button>
          {loadError && <p className="mt-2 text-sm text-red-400">{loadError}</p>}
        </section>

        {/* Faction selection */}
        {catalogs.length > 0 && (
          <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">
                Select Factions ({selected.size}/{catalogs.length})
              </h2>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-sm text-amber-400 hover:text-amber-300">
                  All
                </button>
                <button onClick={selectNone} className="text-sm text-slate-400 hover:text-slate-300">
                  None
                </button>
              </div>
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {catalogs.map((cat) => (
                <label
                  key={cat.name}
                  className="flex cursor-pointer items-center gap-3 rounded px-3 py-2 hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(cat.name)}
                    onChange={() => toggleFaction(cat.name)}
                    className="accent-amber-400"
                  />
                  <span className="flex-1 text-sm text-slate-200">
                    {cat.faction}
                    {factionStatuses[cat.faction] && (
                      <span className="ml-2">{statusIcon(factionStatuses[cat.faction]!)}</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500">{formatSize(cat.size)}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleImport}
                disabled={importing || selected.size === 0}
                className="flex-1 rounded bg-amber-400 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-300 disabled:opacity-50"
              >
                {importing ? 'Importing...' : `Import ${selected.size} Faction${selected.size !== 1 ? 's' : ''}`}
              </button>
              {hasFailedFactions && !importing && (
                <button
                  onClick={handleRetryFailed}
                  className="rounded border border-amber-400 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-400/10"
                >
                  Retry Failed
                </button>
              )}
            </div>
          </section>
        )}

        {/* Progress */}
        {progress && (
          <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
            <p className="mb-2 text-sm text-slate-200">
              Loading {progress.currentFaction}... ({progress.current}/{progress.total})
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </section>
        )}

        {/* Result */}
        {result && (
          <section className="mb-6 rounded-lg border border-emerald-800 bg-emerald-900/20 p-4">
            <h2 className="mb-2 text-lg font-semibold text-emerald-400">Import Complete</h2>
            <p className="text-sm text-slate-200">
              Imported {result.totalUnits} units from {result.factions} faction{result.factions !== 1 ? 's' : ''}.
              {result.errors.length > 0 && ` ${result.errors.length} parse warning${result.errors.length !== 1 ? 's' : ''}.`}
            </p>
            {result.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-slate-400">Show warnings</summary>
                <ul className="mt-1 space-y-1 text-xs text-slate-500">
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        <footer className="mt-8 text-center text-sm text-slate-600">
          Data sourced from BSData (community-maintained). Not affiliated with Games Workshop.
        </footer>
      </div>
    </div>
  )
}
