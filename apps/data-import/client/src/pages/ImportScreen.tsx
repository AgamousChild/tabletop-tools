import { useState, useEffect, useCallback } from 'react'
import { parseBSDataXml, PARSER_VERSION } from '@tabletop-tools/game-content/src/adapters/bsdata/parser'
import {
  saveUnits,
  setImportMeta,
  getImportMeta,
  listFactions as listStoredFactions,
  searchUnits,
  clearFaction,
  clearAll,
  clearGameRules,
  getRulesImportMeta,
} from '@tabletop-tools/game-data-store'
import type { ImportMeta, RulesImportMeta } from '@tabletop-tools/game-data-store'
import { listCatalogFiles, fetchCatalogXml, RateLimitError } from '../lib/github'
import type { CatalogFile, RateLimitInfo } from '../lib/github'
import { importWahapediaRules, isWahapediaAvailable } from '../lib/wahapedia'
import type { RulesImportProgress, RulesImportResult } from '../lib/wahapedia'

interface ImportProgress {
  current: number
  total: number
  currentFaction: string
}

interface FactionImportDetail {
  faction: string
  unitCount: number
  weaponCount: number
  warnings: string[]
}

interface ImportResult {
  totalUnits: number
  factions: number
  errors: string[]
  details: FactionImportDetail[]
}

type FactionStatus = 'pending' | 'importing' | 'success' | 'failed'
type Tab = 'units' | 'rules' | 'stored'

export function ImportScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('units')

  // Unit import state
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

  // Rules import state
  const [rulesAvailable, setRulesAvailable] = useState(false)
  const [importingRules, setImportingRules] = useState(false)
  const [rulesProgress, setRulesProgress] = useState<RulesImportProgress | null>(null)
  const [rulesResult, setRulesResult] = useState<RulesImportResult | null>(null)

  // Stored data state
  const [currentMeta, setCurrentMeta] = useState<ImportMeta | null>(null)
  const [rulesMeta, setRulesMeta] = useState<RulesImportMeta | null>(null)
  const [storedFactions, setStoredFactions] = useState<string[]>([])
  const [factionCounts, setFactionCounts] = useState<Record<string, number>>({})
  const [factionWeaponCounts, setFactionWeaponCounts] = useState<Record<string, number>>({})

  const refreshStoredData = useCallback(async () => {
    const [meta, rmeta, factions] = await Promise.all([
      getImportMeta(),
      getRulesImportMeta(),
      listStoredFactions(),
    ])
    setCurrentMeta(meta)
    setRulesMeta(rmeta)
    setStoredFactions(factions)

    const counts: Record<string, number> = {}
    const weaponCounts: Record<string, number> = {}
    for (const f of factions) {
      const units = await searchUnits({ faction: f })
      counts[f] = units.length
      weaponCounts[f] = units.reduce((sum, u) => sum + u.weapons.length, 0)
    }
    setFactionCounts(counts)
    setFactionWeaponCounts(weaponCounts)
  }, [])

  useEffect(() => {
    refreshStoredData()
    isWahapediaAvailable().then(setRulesAvailable)
  }, [refreshStoredData])

  // ── Unit import handlers ──────────────────────────────────────────────────

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
    const details: FactionImportDetail[] = []
    let totalUnits = 0
    const successfulFactions: string[] = []

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

        const weaponCount = units.reduce((sum, u) => sum + u.weapons.length, 0)
        details.push({
          faction: file.faction,
          unitCount: units.length,
          weaponCount,
          warnings: errors.filter(e => e.startsWith(file.faction) || units.some(u => e.startsWith(u.name))),
        })

        setFactionStatuses((prev) => ({ ...prev, [file.faction]: 'success' }))
      } catch (err) {
        allErrors.push(`${file.faction}: ${err instanceof Error ? err.message : String(err)}`)
        details.push({ faction: file.faction, unitCount: 0, weaponCount: 0, warnings: [] })
        setFactionStatuses((prev) => ({ ...prev, [file.faction]: 'failed' }))
      }
    }

    if (successfulFactions.length > 0) {
      await setImportMeta({
        lastImport: Date.now(),
        factions: successfulFactions,
        totalUnits,
        parserVersion: PARSER_VERSION,
      })
    }

    setResult({ totalUnits, factions: successfulFactions.length, errors: allErrors, details })
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

  // ── Rules import handlers ─────────────────────────────────────────────────

  const handleImportRules = async () => {
    setImportingRules(true)
    setRulesResult(null)
    try {
      const result = await importWahapediaRules((p) => setRulesProgress(p))
      setRulesResult(result)
    } finally {
      setImportingRules(false)
      setRulesProgress(null)
      await refreshStoredData()
    }
  }

  // ── Stored data handlers ──────────────────────────────────────────────────

  const handleClearFaction = async (faction: string) => {
    await clearFaction(faction)
    await refreshStoredData()
  }

  const handleClearAll = async () => {
    await clearAll()
    await refreshStoredData()
  }

  const handleClearGameRules = async () => {
    await clearGameRules()
    await refreshStoredData()
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

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

  const totalRulesCount = rulesMeta
    ? Object.values(rulesMeta.counts).reduce((a, b) => a + b, 0)
    : 0

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <a href="/" className="text-3xl font-bold text-slate-100 hover:text-slate-300 transition-colors">
            Data <span className="text-amber-400">Import</span>
          </a>
          <p className="mt-1 text-slate-400">
            Load game data into your browser for use across all apps.
          </p>
        </header>

        {/* Tab bar */}
        <div className="mb-6 flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
          {([
            { key: 'units' as Tab, label: 'Unit Profiles' },
            { key: 'rules' as Tab, label: 'Game Rules' },
            { key: 'stored' as Tab, label: 'Stored Data' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'bg-amber-400 text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Unit Profiles Tab ── */}
        {activeTab === 'units' && (
          <>
            {/* Rate limit warning */}
            {rateLimit && rateLimit.remaining < 10 && (
              <div className="mb-4 rounded-lg border border-amber-800 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
                GitHub API: {rateLimit.remaining}/{rateLimit.limit} requests remaining.
                {rateLimit.remaining === 0 && (
                  <> Resets at {rateLimit.resetAt.toLocaleTimeString()}.</>
                )}
              </div>
            )}

            {/* Summary of stored units */}
            {currentMeta && (
              <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                {currentMeta.totalUnits} units across {storedFactions.length} factions imported.
                {(currentMeta.parserVersion ?? 0) < PARSER_VERSION && (
                  <span className="ml-2 text-amber-400">Outdated parser — re-import recommended.</span>
                )}
              </div>
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
                  {result.errors.length > 0 && (
                    <span className="ml-1 text-amber-400">
                      {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''} — review below.
                    </span>
                  )}
                </p>

                {/* Per-faction breakdown */}
                {result.details.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-medium text-slate-400">Per-faction breakdown:</p>
                    <div className="max-h-48 space-y-1 overflow-y-auto">
                      {result.details.map((d) => (
                        <div key={d.faction} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
                          <span className={d.unitCount > 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {d.unitCount > 0 ? '✓' : '✕'}
                          </span>
                          <span className="flex-1 text-slate-200">{d.faction}</span>
                          <span className="text-slate-400">{d.unitCount} units</span>
                          <span className="text-slate-500">{d.weaponCount} weapons</span>
                          {d.warnings.length > 0 && (
                            <span className="text-amber-400">{d.warnings.length} warn</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.errors.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-amber-400">
                      Show all {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''}
                    </summary>
                    <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-xs text-slate-500">
                      {result.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )}
          </>
        )}

        {/* ── Game Rules Tab ── */}
        {activeTab === 'rules' && (
          <>
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold text-slate-100">Game Rules Data</h2>
              <p className="mb-4 text-sm text-slate-400">
                Import detachments, stratagems, enhancements, leader attachments, unit compositions,
                costs, wargear options, keywords, abilities, weapon profiles, and model stats.
                IDs are automatically mapped to your imported unit profiles.
              </p>
              {!currentMeta && (
                <div className="mb-4 rounded-lg border border-amber-800 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
                  Import Unit Profiles first so game rules data can be linked to your units.
                </div>
              )}

              {rulesMeta && (
                <div className="mb-4 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-300">
                  {totalRulesCount.toLocaleString()} rules items imported on{' '}
                  {new Date(rulesMeta.lastImport).toLocaleDateString()}.
                </div>
              )}

              {!rulesAvailable && (
                <div className="mb-4 rounded-lg border border-amber-800 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
                  Game rules data not found. Run the export script first:
                  <code className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-xs">
                    npx tsx scripts/export-wahapedia.ts
                  </code>
                </div>
              )}

              <button
                onClick={handleImportRules}
                disabled={importingRules || !rulesAvailable}
                className="rounded bg-amber-400 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-300 disabled:opacity-50"
              >
                {importingRules ? 'Importing...' : rulesMeta ? 'Re-import Game Rules' : 'Import Game Rules'}
              </button>
            </section>

            {/* Rules progress */}
            {rulesProgress && (
              <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
                <p className="mb-2 text-sm text-slate-200">
                  Loading {rulesProgress.currentStep}... ({rulesProgress.current}/{rulesProgress.total})
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${(rulesProgress.current / rulesProgress.total) * 100}%` }}
                  />
                </div>
              </section>
            )}

            {/* Rules result */}
            {rulesResult && (
              <section className="mb-6 rounded-lg border border-emerald-800 bg-emerald-900/20 p-4">
                <h2 className="mb-2 text-lg font-semibold text-emerald-400">Import Complete</h2>

                {rulesResult.idMappingStats && (
                  <div className="mb-3 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm">
                    <span className="text-emerald-400">
                      {rulesResult.idMappingStats.matched.toLocaleString()} datasheets matched
                    </span>
                    {rulesResult.idMappingStats.unmatched > 0 && (
                      <span className="ml-2 text-amber-400">
                        ({rulesResult.idMappingStats.unmatched} unmatched — import more factions in Unit Profiles)
                      </span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-200">
                  <span className="text-slate-400">Datasheets</span>
                  <span>{(rulesResult.counts.datasheets ?? 0).toLocaleString()}</span>
                  <span className="text-slate-400">Weapon Profiles</span>
                  <span>{(rulesResult.counts.datasheetWargear ?? 0).toLocaleString()}</span>
                  <span className="text-slate-400">Model Stats</span>
                  <span>{(rulesResult.counts.datasheetModels ?? 0).toLocaleString()}</span>
                  <span className="text-slate-400">Detachments</span>
                  <span>{(rulesResult.counts.detachments ?? 0).toLocaleString()}</span>
                  <span className="text-slate-400">Stratagems</span>
                  <span>{(rulesResult.counts.stratagems ?? 0).toLocaleString()}</span>
                  <span className="text-slate-400">Enhancements</span>
                  <span>{(rulesResult.counts.enhancements ?? 0).toLocaleString()}</span>
                  <span className="text-slate-400">Leader Attachments</span>
                  <span>{(rulesResult.counts.leaderAttachments ?? 0).toLocaleString()}</span>
                  <span className="text-slate-400">Unit Compositions</span>
                  <span>{(rulesResult.counts.unitCompositions ?? 0).toLocaleString()}</span>
                  <span className="text-slate-400">Unit Costs</span>
                  <span>{(rulesResult.counts.unitCosts ?? 0).toLocaleString()}</span>
                  <span className="text-slate-400">Wargear Options</span>
                  <span>{(rulesResult.counts.wargearOptions ?? 0).toLocaleString()}</span>
                  <span className="text-slate-400">Unit Keywords</span>
                  <span>{(rulesResult.counts.unitKeywords ?? 0).toLocaleString()}</span>
                  <span className="text-slate-400">Unit Abilities</span>
                  <span>{(rulesResult.counts.unitAbilities ?? 0).toLocaleString()}</span>
                </div>
                {rulesResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-red-400">
                      {rulesResult.errors.length} error{rulesResult.errors.length !== 1 ? 's' : ''}
                    </summary>
                    <ul className="mt-1 space-y-1 text-xs text-slate-500">
                      {rulesResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )}
          </>
        )}

        {/* ── Stored Data Tab ── */}
        {activeTab === 'stored' && (
          <>
            {/* Units summary */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">Unit Profiles</h2>
                {storedFactions.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="rounded px-3 py-1 text-sm text-red-400 hover:bg-red-400/10"
                  >
                    Clear All Data
                  </button>
                )}
              </div>
              {currentMeta && (
                <p className="mb-3 text-sm text-slate-400">
                  Last import: {new Date(currentMeta.lastImport).toLocaleDateString()} —{' '}
                  {currentMeta.totalUnits} units across {storedFactions.length} factions
                  {(currentMeta.parserVersion ?? 0) < PARSER_VERSION && (
                    <span className="ml-2 text-amber-400">(outdated parser)</span>
                  )}
                </p>
              )}
              {storedFactions.length === 0 && (
                <p className="text-sm text-slate-500">No unit profiles imported yet.</p>
              )}
              {storedFactions.length > 0 && (
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {storedFactions.map((faction) => (
                    <div
                      key={faction}
                      className="flex items-center justify-between rounded px-3 py-2 hover:bg-slate-800"
                    >
                      <span className="text-sm text-slate-200">
                        {faction}{' '}
                        <span className="text-slate-500">
                          ({factionCounts[faction] ?? 0} units, {factionWeaponCounts[faction] ?? 0} weapons)
                        </span>
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
              )}
            </section>

            {/* Game Rules summary */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">Game Rules</h2>
                {rulesMeta && (
                  <button
                    onClick={handleClearGameRules}
                    className="rounded px-3 py-1 text-sm text-red-400 hover:bg-red-400/10"
                  >
                    Clear Game Rules
                  </button>
                )}
              </div>
              {rulesMeta ? (
                <>
                  <p className="mb-3 text-sm text-slate-400">
                    Last import: {new Date(rulesMeta.lastImport).toLocaleDateString()} —{' '}
                    {totalRulesCount.toLocaleString()} total items
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-slate-400">Detachments</div>
                    <div className="text-slate-200">{rulesMeta.counts.detachments.toLocaleString()}</div>
                    <div className="text-slate-400">Stratagems</div>
                    <div className="text-slate-200">{rulesMeta.counts.stratagems.toLocaleString()}</div>
                    <div className="text-slate-400">Enhancements</div>
                    <div className="text-slate-200">{rulesMeta.counts.enhancements.toLocaleString()}</div>
                    <div className="text-slate-400">Leader Attachments</div>
                    <div className="text-slate-200">{rulesMeta.counts.leaderAttachments.toLocaleString()}</div>
                    <div className="text-slate-400">Unit Compositions</div>
                    <div className="text-slate-200">{rulesMeta.counts.unitCompositions.toLocaleString()}</div>
                    <div className="text-slate-400">Unit Costs</div>
                    <div className="text-slate-200">{rulesMeta.counts.unitCosts.toLocaleString()}</div>
                    <div className="text-slate-400">Wargear Options</div>
                    <div className="text-slate-200">{rulesMeta.counts.wargearOptions.toLocaleString()}</div>
                    <div className="text-slate-400">Unit Keywords</div>
                    <div className="text-slate-200">{rulesMeta.counts.unitKeywords.toLocaleString()}</div>
                    <div className="text-slate-400">Unit Abilities</div>
                    <div className="text-slate-200">{rulesMeta.counts.unitAbilities.toLocaleString()}</div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">No game rules imported yet.</p>
              )}
            </section>
          </>
        )}

        <footer className="mt-8 text-center text-sm text-slate-600">
          Data sourced from BSData (community-maintained). Not affiliated with Games Workshop.
        </footer>
      </div>
    </div>
  )
}
