import { useEffect, useState } from 'react'

import type { PracticeExamSource } from '@/types'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

interface Props {
  source: PracticeExamSource
  questionNum: number
  onClose: () => void
}

export function SourcePopup({ source, questionNum, onClose }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const src = `${BASE}/data/pages/${source.deckId}/slide-${source.slideNum}.png`

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="slide-viewer" onClick={onClose} role="dialog" aria-modal="true">
      <div className="slide-viewer-inner" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>
            Q{questionNum} source · {source.deckId} · slide {source.slideNum}
          </h2>
          <button onClick={onClose} aria-label="Close source popup">
            Close
          </button>
        </header>
        {source.quote && <div className="source-quote">&ldquo;{source.quote}&rdquo;</div>}
        <div className="slide-image-wrap">
          {!loaded && !error && <div className="loading">Loading slide…</div>}
          {error && <div className="error">Image unavailable: {src}</div>}
          <img
            src={src}
            alt={`${source.deckId} slide ${source.slideNum}`}
            style={{ display: error ? 'none' : undefined }}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
          {loaded && source.highlight && (
            <div
              className="highlight"
              style={{
                top: `${source.highlight.topPct}%`,
                height: `${source.highlight.heightPct}%`,
                left: `${source.highlight.leftPct}%`,
                width: `${source.highlight.widthPct}%`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
