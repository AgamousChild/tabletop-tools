import { useState } from 'react'

import type { SearchResult } from '@/types'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

interface Props {
  result: SearchResult
  onClose: () => void
}

export function SlideViewer({ result, onClose }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const b = result.matchedBlock
  const src = `${BASE}/${result.imageUrl.replace(/^\//, '')}`

  return (
    <div className="slide-viewer" onClick={onClose}>
      <div className="slide-viewer-inner" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>
            {result.deckName} · slide {result.slideNum}
            {result.slideTitle ? ` — ${result.slideTitle}` : ''}
          </h2>
          <button onClick={onClose}>Close</button>
        </header>
        <div className="slide-image-wrap">
          {!loaded && !error && <div className="loading">Loading slide…</div>}
          {error && <div className="error">Image unavailable: {src}</div>}
          <img
            src={src}
            alt={`${result.deckName} slide ${result.slideNum}`}
            style={{ display: error ? 'none' : undefined }}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
          {loaded && (
            <div
              className="highlight"
              style={{
                top: `${b.topPct}%`,
                height: `${b.heightPct}%`,
                left: `${b.leftPct}%`,
                width: `${b.widthPct}%`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
