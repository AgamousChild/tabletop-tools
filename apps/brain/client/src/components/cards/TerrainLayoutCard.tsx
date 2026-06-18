import { useState } from 'react'

import { renderMarkdown } from '../../lib/render-markdown'
import type { CardContext, TerrainLayoutCardData } from './types'

interface TerrainLayoutCardProps {
  data: TerrainLayoutCardData
  context: CardContext
}

export function TerrainLayoutCard({ data }: TerrainLayoutCardProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const apiBase = import.meta.env.VITE_BRAIN_API_URL || '/brain/api'
  const src = data.pdfImage
    ? `${apiBase}/pages/${data.pdfImage.pdfName}/page-${data.pdfImage.page}.png`
    : null

  return (
    <div
      className="border-2 border-slate-700 rounded-md overflow-hidden bg-slate-950"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      <div className="px-3.5 py-2.5">
        {/* Header — layout name only, green underline */}
        <div className="flex items-baseline justify-between border-b-2 border-green-500 pb-1 mb-1.5">
          <span
            className="text-sm font-bold uppercase tracking-wider text-white"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            {data.name}
          </span>
        </div>

        {/* Image area or text description */}
        {src ? (
          <div className="mb-1.5">
            {/* Loading placeholder */}
            {!loaded && !error && (
              <div className="flex items-center justify-center h-24 text-slate-400 text-xs">
                Loading...
              </div>
            )}

            {/* Error fallback — show text description */}
            {error && (
              <div
                className="text-xs text-slate-300 leading-snug"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(data.description) }}
              />
            )}

            {/* PDF page image */}
            <img
              src={src}
              alt={`${data.name} terrain layout diagram`}
              className="w-full h-auto rounded"
              style={{ display: loaded ? undefined : 'none' }}
              onLoad={() => setLoaded(true)}
              onError={() => {
                setLoaded(false)
                setError(true)
              }}
            />
          </div>
        ) : (
          /* No image — render text description */
          <div
            className="text-xs text-slate-300 leading-snug mb-1.5"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(data.description) }}
          />
        )}

        {/* Quality flags */}
        {data.qualityFlags && data.qualityFlags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {data.qualityFlags.map((flag) => (
              <span
                key={flag}
                className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded"
              >
                {flag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
