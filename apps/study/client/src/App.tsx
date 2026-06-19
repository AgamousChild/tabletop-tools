import { useEffect, useMemo, useState } from 'react'

import { ResultsList } from '@/components/ResultsList'
import { SearchBar } from '@/components/SearchBar'
import { SlideViewer } from '@/components/SlideViewer'
import { buildSearchEngine } from '@/lib/search'
import type { SearchResult, SlidesManifest } from '@/types'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export function App() {
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

  if (loadError) {
    return (
      <div className="app">
        <div className="error">Failed to load slides manifest: {loadError}</div>
      </div>
    )
  }

  if (!manifest) {
    return (
      <div className="app">
        <div className="loading">Loading slides…</div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Study</h1>
        <span className="meta">
          {manifest.decks.length} decks · {manifest.decks.reduce((n, d) => n + d.slides.length, 0)}{' '}
          slides
        </span>
      </header>
      <SearchBar value={query} onChange={setQuery} resultCount={results.length} />
      <ResultsList results={results} onSelect={setSelected} query={query} />
      {selected && <SlideViewer result={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
