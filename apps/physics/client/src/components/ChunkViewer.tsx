import { useState } from 'react'

import { fmtTs } from '@/lib/search'
import type { SearchResult } from '@/types'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

interface Props {
  result: SearchResult
  onClose: () => void
}

export function ChunkViewer({ result, onClose }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const src = `${BASE}/${result.imageUrl.replace(/^\//, '')}`

  return (
    <div className="slide-viewer" onClick={onClose}>
      <div className="slide-viewer-inner" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>
            {result.meetingName} · {fmtTs(result.startSec)}–{fmtTs(result.endSec)}
          </h2>
          <button onClick={onClose}>Close</button>
        </header>
        <div className="slide-image-wrap">
          {!loaded && !error && <div className="loading">Loading frame…</div>}
          {error && <div className="error">Image unavailable: {src}</div>}
          <img
            src={src}
            alt={`${result.meetingName} frame at ${fmtTs(result.startSec)}`}
            style={{ display: error ? 'none' : undefined }}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        </div>
        <div className="chunk-text">{result.text}</div>
      </div>
    </div>
  )
}
