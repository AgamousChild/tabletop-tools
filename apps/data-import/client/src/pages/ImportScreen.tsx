import { PARSER_VERSION } from '@tabletop-tools/game-content/src/adapters/bsdata/parser'
import type { ImportMeta, RulesImportMeta } from '@tabletop-tools/game-data-store'
import {
  clearAll,
  clearGameRules,
  getImportMeta,
  getIncludeLegends,
  getRulesImportMeta,
  listFactions as listStoredFactions,
  searchUnits,
  setIncludeLegends,
} from '@tabletop-tools/game-data-store'
import { useCallback, useEffect, useState } from 'react'

import type { Manifest, SyncProgress, SyncResult } from '../lib/sync'
import { checkForUpdates, syncAllData } from '../lib/sync'

type Tab = 'sync' | 'stored'

export function ImportScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('sync')

  // Sync state
  const [checking, setChecking] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)

  // Stored data state
  const [currentMeta, setCurrentMeta] = useState<ImportMeta | null>(null)
  const [rulesMeta, setRulesMeta] = useState<RulesImportMeta | null>(null)
  const [storedFactions, setStoredFactions] = useState<string[]>([])
  const [factionCounts, setFactionCounts] = useState<Record<string, number>>({})
  const [factionWeaponCounts, setFactionWeaponCounts] = useState<Record<string, number>>({})
  const [clearing, setClearing] = useState(false)
  const [clearMessage, setClearMessage] = useState<string | null>(null)
  const [includeLegends, setIncludeLegendsState] = useState(false)

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
    getIncludeLegends().then(setIncludeLegendsState)
  }, [refreshStoredData])

  // ── Sync handlers ───────────────────────────────────────────────────────

  const handleCheckForUpdates = async () => {
    setChecking(true)
    setCheckError(null)
    setSyncResult(null)
    try {
      const currentVersion = currentMeta ? undefined : undefined // always check
      const { available, manifest: m } = await checkForUpdates(currentVersion)
      setUpdateAvailable(available)
      setManifest(m)
      if (!available && m) {
        setCheckError(null)
      } else if (!m) {
        setCheckError('Could not reach the data server. Try again later.')
      }
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  const handleSync = async () => {
    if (!manifest) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await syncAllData(manifest, (p) => setSyncProgress(p))
      setSyncResult(result)
      setUpdateAvailable(false)
    } finally {
      setSyncing(false)
      setSyncProgress(null)
      await refreshStoredData()
    }
  }

  // ── Stored data handlers ────────────────────────────────────────────────

  const handleClearAll = async () => {
    if (!confirm('Clear all imported data? This cannot be undone.')) return
    setClearing(true)
    setClearMessage(null)
    setStoredFactions([])
    setFactionCounts({})
    setFactionWeaponCounts({})
    setCurrentMeta(null)
    setRulesMeta(null)
    try {
      await clearAll()
      await refreshStoredData()
      setClearMessage('All data cleared successfully.')
    } finally {
      setClearing(false)
    }
  }

  const handleClearGameRules = async () => {
    if (!confirm('Clear all imported game rules? This cannot be undone.')) return
    setClearing(true)
    setClearMessage(null)
    setRulesMeta(null)
    try {
      await clearGameRules()
      await refreshStoredData()
      setClearMessage('All game rules data cleared.')
    } finally {
      setClearing(false)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  const totalRulesCount = rulesMeta ? Object.values(rulesMeta.counts).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              title="Back to Home"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z"
                  clipRule="evenodd"
                />
              </svg>
              Home
            </a>
            <h1>
              <a
                href="/"
                className="text-3xl font-bold text-slate-100 hover:text-slate-300 transition-colors"
              >
                Data <span className="text-amber-400">Import</span>
              </a>
            </h1>
          </div>
          <p className="mt-1 text-slate-400">
            Load game data into your browser for use across all apps.
          </p>
        </header>

        {/* Tab bar */}
        <div className="mb-6 flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
          {[
            { key: 'sync' as Tab, label: 'Sync' },
            { key: 'stored' as Tab, label: 'Stored Data' },
          ].map(({ key, label }) => (
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

        {/* ── Sync Tab ── */}
        {activeTab === 'sync' && (
          <>
            <p className="mb-4 text-xs text-slate-500">
              Sync all game data (unit profiles, rules, weapons, missions) from the server. Data
              stays in your browser.
            </p>

            {/* Current data status */}
            {currentMeta && (
              <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span>
                    {currentMeta.totalUnits} units across {storedFactions.length} factions
                    {rulesMeta && <> + {totalRulesCount.toLocaleString()} rules items</>}
                  </span>
                  <span className="text-xs text-slate-500">
                    Last sync: {new Date(currentMeta.lastImport).toLocaleDateString()}
                  </span>
                </div>
                {(currentMeta.parserVersion ?? 0) < PARSER_VERSION && (
                  <p className="mt-1 text-amber-400 text-xs">
                    Outdated parser — re-sync recommended.
                  </p>
                )}
              </div>
            )}

            {/* Sync actions */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold text-slate-100">Game Data Sync</h2>
              <p className="mb-4 text-sm text-slate-400">
                Check for updates from BSData (unit profiles) and Wahapedia (game rules, stratagems,
                enhancements, weapons). All data is pre-processed on the server — just click sync.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleCheckForUpdates}
                  disabled={checking || syncing}
                  className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                >
                  {checking ? 'Checking...' : 'Check for Updates'}
                </button>

                {(updateAvailable || !currentMeta) && manifest && (
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="rounded bg-amber-400 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-300 disabled:opacity-50"
                  >
                    {syncing ? 'Syncing...' : currentMeta ? 'Sync Updates' : 'Sync All Data'}
                  </button>
                )}
              </div>

              {checkError && <p className="mt-3 text-sm text-red-400">{checkError}</p>}

              {manifest && !updateAvailable && !syncing && !syncResult && (
                <p className="mt-3 text-sm text-emerald-400">
                  Data is up to date (v{manifest.version}, updated{' '}
                  {new Date(manifest.updatedAt).toLocaleDateString()}).
                </p>
              )}

              {manifest && updateAvailable && (
                <div className="mt-3 rounded border border-amber-800 bg-amber-900/20 px-3 py-2 text-sm text-amber-300">
                  Update available (v{manifest.version}, updated{' '}
                  {new Date(manifest.updatedAt).toLocaleDateString()}).
                  {manifest.bsdata && (
                    <>
                      {' '}
                      {manifest.bsdata.unitCount} units across {manifest.bsdata.factionCount}{' '}
                      factions.
                    </>
                  )}
                  {manifest.wahapedia && (
                    <>
                      {' '}
                      {Object.values(manifest.wahapedia.recordCounts)
                        .reduce((a, b) => a + b, 0)
                        .toLocaleString()}{' '}
                      rules records.
                    </>
                  )}
                </div>
              )}
            </section>

            {/* Sync progress */}
            {syncProgress && (
              <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
                <p className="mb-2 text-sm text-slate-200">
                  {syncProgress.currentStep}... ({syncProgress.current}/{syncProgress.total})
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                  />
                </div>
              </section>
            )}

            {/* Sync result */}
            {syncResult && (
              <section className="mb-6 rounded-lg border border-emerald-800 bg-emerald-900/20 p-4">
                <h2 className="mb-2 text-lg font-semibold text-emerald-400">Sync Complete</h2>
                <div className="text-sm text-slate-200">
                  {syncResult.unitCount > 0 && (
                    <p>{syncResult.unitCount.toLocaleString()} unit profiles synced.</p>
                  )}
                  {syncResult.rulesCount > 0 && (
                    <p>{syncResult.rulesCount.toLocaleString()} rules items synced.</p>
                  )}
                </div>
                {syncResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-red-400">
                      {syncResult.errors.length} error{syncResult.errors.length !== 1 ? 's' : ''}
                    </summary>
                    <ul className="mt-1 space-y-1 text-xs text-slate-500">
                      {syncResult.errors.map((err, i) => (
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
            <p className="mb-4 text-xs text-slate-500">
              View and manage imported data. Data is stored locally in your browser.
            </p>
            {clearing && (
              <div className="mb-4 rounded-lg bg-slate-900 border border-slate-700 px-4 py-2 text-sm text-slate-400">
                Clearing data...
              </div>
            )}
            {clearMessage && !clearing && (
              <div className="mb-4 rounded-lg bg-emerald-900/30 border border-emerald-700/50 px-4 py-2 text-sm text-emerald-400">
                {clearMessage}
              </div>
            )}

            {/* Units summary */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">Unit Profiles</h2>
                {storedFactions.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    disabled={clearing}
                    className="rounded px-3 py-1 text-sm text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                  >
                    Clear All Data
                  </button>
                )}
              </div>
              {currentMeta && (
                <p className="mb-3 text-sm text-slate-400">
                  Last sync: {new Date(currentMeta.lastImport).toLocaleDateString()} —{' '}
                  {currentMeta.totalUnits} units across {storedFactions.length} factions
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
                          ({factionCounts[faction] ?? 0} units, {factionWeaponCounts[faction] ?? 0}{' '}
                          weapons)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Settings */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-lg font-semibold text-slate-100">Settings</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLegends}
                  onChange={async (e) => {
                    const val = e.target.checked
                    setIncludeLegendsState(val)
                    await setIncludeLegends(val)
                  }}
                  className="w-4 h-4 rounded accent-amber-400"
                />
                <div>
                  <span className="text-sm text-slate-300">Include Legends units</span>
                  <p className="text-xs text-slate-500">
                    When enabled, Legends units will appear in all apps. Off by default.
                  </p>
                </div>
              </label>
            </section>

            {/* Game Rules summary */}
            <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">Game Rules</h2>
                {rulesMeta && (
                  <button
                    onClick={handleClearGameRules}
                    disabled={clearing}
                    className="rounded px-3 py-1 text-sm text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                  >
                    Clear Game Rules
                  </button>
                )}
              </div>
              {rulesMeta ? (
                <>
                  <p className="mb-3 text-sm text-slate-400">
                    Last sync: {new Date(rulesMeta.lastImport).toLocaleDateString()} —{' '}
                    {totalRulesCount.toLocaleString()} total items
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-slate-400">Detachments</div>
                    <div className="text-slate-200">
                      {rulesMeta.counts.detachments.toLocaleString()}
                    </div>
                    <div className="text-slate-400">Stratagems</div>
                    <div className="text-slate-200">
                      {rulesMeta.counts.stratagems.toLocaleString()}
                    </div>
                    <div className="text-slate-400">Enhancements</div>
                    <div className="text-slate-200">
                      {rulesMeta.counts.enhancements.toLocaleString()}
                    </div>
                    <div className="text-slate-400">Leader Attachments</div>
                    <div className="text-slate-200">
                      {rulesMeta.counts.leaderAttachments.toLocaleString()}
                    </div>
                    <div className="text-slate-400">Unit Compositions</div>
                    <div className="text-slate-200">
                      {rulesMeta.counts.unitCompositions.toLocaleString()}
                    </div>
                    <div className="text-slate-400">Unit Costs</div>
                    <div className="text-slate-200">
                      {rulesMeta.counts.unitCosts.toLocaleString()}
                    </div>
                    <div className="text-slate-400">Wargear Options</div>
                    <div className="text-slate-200">
                      {rulesMeta.counts.wargearOptions.toLocaleString()}
                    </div>
                    <div className="text-slate-400">Unit Keywords</div>
                    <div className="text-slate-200">
                      {rulesMeta.counts.unitKeywords.toLocaleString()}
                    </div>
                    <div className="text-slate-400">Unit Abilities</div>
                    <div className="text-slate-200">
                      {rulesMeta.counts.unitAbilities.toLocaleString()}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">No game rules imported yet.</p>
              )}
            </section>
          </>
        )}

        <footer className="mt-8 text-center text-sm text-slate-600">
          Data sourced from BSData and Wahapedia (community-maintained). Not affiliated with Games
          Workshop.
        </footer>
      </div>
    </div>
  )
}
