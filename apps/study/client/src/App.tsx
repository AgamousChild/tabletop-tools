import { useEffect, useMemo, useState } from 'react'

import { PracticeExamLoader } from '@/components/PracticeExam'
import { ResultsList } from '@/components/ResultsList'
import { SearchBar } from '@/components/SearchBar'
import { SlideIndex } from '@/components/SlideIndex'
import { SlideViewer } from '@/components/SlideViewer'
import { buildSearchEngine } from '@/lib/search'
import type { SearchResult, Slide, SlidesManifest } from '@/types'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

type Tab = 'search' | 'exam'

/**
 * When a user clicks a slide in the deck-browse (not from a search), synthesize
 * a SearchResult so SlideViewer can render it. The matchedBlock is a full-slide
 * bounding box so nothing gets falsely highlighted.
 */
function selectSlideAsSearchResult(
  deckName: string,
  s: Slide,
  setSelected: (r: SearchResult) => void,
) {
  setSelected({
    deckId: s.deckId,
    deckName,
    slideNum: s.slideNum,
    slideTitle: s.title,
    imageUrl: s.imageUrl,
    matchedBlock: { text: '', leftPct: 0, topPct: 0, widthPct: 0, heightPct: 0 },
    snippet: s.body,
    score: 1,
  })
}

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
              {query.trim().length > 0 ? (
                <ResultsList results={results} onSelect={setSelected} query={query} />
              ) : (
                <div className="decks-browse">
                  {manifest.decks.map((deck) => (
                    <section key={deck.id} className="deck-section">
                      <h2 className="deck-heading">
                        {deck.name} <span className="deck-count">{deck.slides.length} slides</span>
                      </h2>
                      <SlideIndex
                        deckName={deck.name}
                        slides={deck.slides}
                        onSelect={(s: Slide) =>
                          selectSlideAsSearchResult(deck.name, s, setSelected)
                        }
                      />
                    </section>
                  ))}
                </div>
              )}
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
