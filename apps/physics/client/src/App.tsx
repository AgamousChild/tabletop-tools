import { useEffect, useMemo, useState } from 'react'

import { ChunkViewer } from '@/components/ChunkViewer'
import { ResultsList } from '@/components/ResultsList'
import { SearchBar } from '@/components/SearchBar'
import { SlideIndex } from '@/components/SlideIndex'
import { buildSearchEngine, fmtTs } from '@/lib/search'
import type { SearchResult, Slide, SlidesManifest } from '@/types'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

function toResult(meetingName: string, s: Slide): SearchResult {
  return {
    meetingId: s.meetingId,
    meetingName,
    slideNum: s.slideNum,
    startSec: s.startSec,
    endSec: s.endSec,
    text: s.text,
    imageUrl: s.imageUrl,
    score: 0,
  }
}

export function App() {
  const [manifest, setManifest] = useState<SlidesManifest | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<SearchResult | null>(null)

  useEffect(() => {
    fetch(`${BASE}/data/chunks.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((m: SlidesManifest) => {
        setManifest(m)
        if (m.meetings.length && !selectedMeetingId) setSelectedMeetingId(m.meetings[0]!.id)
      })
      .catch((err) => setLoadError(String(err)))
  }, [selectedMeetingId])

  const engine = useMemo(() => (manifest ? buildSearchEngine(manifest) : null), [manifest])
  const searchResults = useMemo(
    () => (engine && query.trim() ? engine.search(query) : []),
    [engine, query],
  )

  if (loadError) {
    return (
      <div className="app">
        <div className="error">Failed to load manifest: {loadError}</div>
      </div>
    )
  }
  if (!manifest) {
    return (
      <div className="app">
        <div className="loading">Loading…</div>
      </div>
    )
  }

  const activeMeeting = manifest.meetings.find((m) => m.id === selectedMeetingId) ?? null

  return (
    <div className="app">
      <header className="app-header">
        <h1>Physics</h1>
        <span className="meta">
          {manifest.meetings.length} meetings ·{' '}
          {manifest.meetings.reduce((n, m) => n + m.slides.length, 0)} slides
        </span>
      </header>
      <SearchBar value={query} onChange={setQuery} resultCount={searchResults.length} />
      {query.trim() ? (
        <ResultsList results={searchResults} onSelect={setSelected} query={query} />
      ) : (
        <>
          <div className="meeting-tabs">
            {manifest.meetings.map((m) => (
              <button
                key={m.id}
                className={m.id === selectedMeetingId ? 'tab tab-active' : 'tab'}
                onClick={() => setSelectedMeetingId(m.id)}
              >
                {m.name}{' '}
                <span className="tab-meta">
                  ({m.slides.length} · {fmtTs(m.durationSec)})
                </span>
              </button>
            ))}
          </div>
          {activeMeeting && (
            <SlideIndex
              meetingName={activeMeeting.name}
              slides={activeMeeting.slides}
              onSelect={(s) => setSelected(toResult(activeMeeting.name, s))}
            />
          )}
        </>
      )}
      {selected && <ChunkViewer result={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
