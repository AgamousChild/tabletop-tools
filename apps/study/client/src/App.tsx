import { useEffect, useMemo, useState } from 'react'

import { PracticeExamLoader } from '@/components/PracticeExam'
import { ResultsList } from '@/components/ResultsList'
import { SearchBar } from '@/components/SearchBar'
import { SlideViewer } from '@/components/SlideViewer'
import { buildSearchEngine } from '@/lib/search'
import type { SearchResult, SlidesManifest } from '@/types'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

type Tab = 'search' | 'exam'

export function App() {
  const [tab, setTab] = useState<Tab>('search')
  const [manifest, setManifest] = useState<SlidesManifest | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SearchResult | null>(null)

  useEffect(() => {
    fetch(`${BASE}/data/slides.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((m: SlidesManifest) => setManifest(m))
      .catch((err) => setLoadError(String(err)))
  }, [])

  const engine = useMemo(() => (manifest ? buildSearchEngine(manifest) : null), [manifest])
  const results = useMemo(() => (engine ? engine.search(query) : []), [engine, query])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Study</h1>
        <div className="app-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'search'}
            className={`app-tab ${tab === 'search' ? 'app-tab-active' : ''}`}
            onClick={() => setTab('search')}
          >
            Search
          </button>
          <button
            role="tab"
            aria-selected={tab === 'exam'}
            className={`app-tab ${tab === 'exam' ? 'app-tab-active' : ''}`}
            onClick={() => setTab('exam')}
          >
            Practice Exam
          </button>
        </div>
        {tab === 'search' && manifest && (
          <span className="meta">
            {manifest.decks.length} decks ·{' '}
            {manifest.decks.reduce((n, d) => n + d.slides.length, 0)} slides
          </span>
        )}
      </header>

      {tab === 'search' ? (
        <>
          {loadError && <div className="error">Failed to load slides manifest: {loadError}</div>}
          {!loadError && !manifest && <div className="loading">Loading slides…</div>}
          {!loadError && manifest && (
            <>
              <SearchBar value={query} onChange={setQuery} resultCount={results.length} />
              <ResultsList results={results} onSelect={setSelected} query={query} />
              {selected && <SlideViewer result={selected} onClose={() => setSelected(null)} />}
            </>
          )}
        </>
      ) : (
        <PracticeExamLoader />
      )}
    </div>
  )
}
