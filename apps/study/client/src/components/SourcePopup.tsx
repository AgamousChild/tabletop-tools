import { useEffect, useState } from 'react'

import type { PracticeExamSource } from '@/types'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

interface Props {
  source: PracticeExamSource
  questionNum: number
  /** Total slide count in the source deck — used to bound the prev/next nav. */
  deckSlideCount: number
  onClose: () => void
}

export function SourcePopup({ source, questionNum, deckSlideCount, onClose }: Props) {
  const originalSlide = source.slideNum
  const [slideNum, setSlideNum] = useState(originalSlide)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const src = `${BASE}/data/pages/${source.deckId}/slide-${slideNum}.png`
  const onOriginal = slideNum === originalSlide

  // Reset when the source changes (different question)
  useEffect(() => {
    setSlideNum(originalSlide)
    setLoaded(false)
    setError(false)
  }, [originalSlide, source.deckId])

  useEffect(() => {
    setLoaded(false)
    setError(false)
  }, [slideNum])

  function goPrev() {
    if (slideNum > 1) setSlideNum(slideNum - 1)
  }
  function goNext() {
    if (slideNum < deckSlideCount) setSlideNum(slideNum + 1)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'ArrowLeft') {
        e.stopPropagation()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.stopPropagation()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, slideNum, deckSlideCount])

  return (
    <div className="slide-viewer" onClick={onClose} role="dialog" aria-modal="true">
      <div className="slide-viewer-inner" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>
            Q{questionNum} source · {source.deckId} · slide {slideNum}
            {!onOriginal && <span className="source-popup-nav-label"> · (browsing)</span>}
          </h2>
          <button onClick={onClose} aria-label="Close source popup">
            Close
          </button>
        </header>
        {onOriginal && source.quote && (
          <div className="source-quote">&ldquo;{source.quote}&rdquo;</div>
        )}
        <div className="slide-image-wrap">
          {!loaded && !error && <div className="loading">Loading slide…</div>}
          {error && <div className="error">Image unavailable: {src}</div>}
          <img
            src={src}
            alt={`${source.deckId} slide ${slideNum}`}
            style={{ display: error ? 'none' : undefined }}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
          {loaded && onOriginal && source.highlight && (
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
        <div className="source-popup-nav">
          <button onClick={goPrev} disabled={slideNum <= 1} aria-label="Previous slide">
            &larr; Prev slide
          </button>
          <span className="source-popup-nav-label">
            {slideNum} / {deckSlideCount}
            {!onOriginal && (
              <>
                {' · '}
                <button
                  onClick={() => setSlideNum(originalSlide)}
                  style={{
                    padding: '0 0.25rem',
                    border: 'none',
                    background: 'none',
                    color: '#2563eb',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  jump to source (slide {originalSlide})
                </button>
              </>
            )}
          </span>
          <button onClick={goNext} disabled={slideNum >= deckSlideCount} aria-label="Next slide">
            Next slide &rarr;
          </button>
        </div>
      </div>
    </div>
  )
}
