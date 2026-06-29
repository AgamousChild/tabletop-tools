import { useState } from 'react'

import type { CardContext, ForceDispositionCardData } from './types'

interface ForceDispositionCardProps {
  data: ForceDispositionCardData
  context: CardContext
}

function PageImage({ src, alt, onError }: { src: string; alt: string; onError: () => void }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative">
      {!loaded && (
        <div className="flex items-center justify-center h-48 text-slate-400 text-xs">
          Loading...
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className="w-full h-auto rounded"
        style={{ display: loaded ? undefined : 'none' }}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false)
          onError()
        }}
      />
    </div>
  )
}

export function ForceDispositionCard({ data }: ForceDispositionCardProps) {
  const apiBase = import.meta.env.VITE_BRAIN_API_URL || '/brain/api'
  const [failed, setFailed] = useState(false)
  const image = data.pdfImage

  return (
    <div
      className="border-2 border-slate-700 rounded-md overflow-hidden bg-slate-950"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      <div className="px-3.5 py-2.5">
        {/* Header */}
        <div className="flex items-baseline justify-between border-b-2 border-amber-500 pb-1 mb-1.5">
          <span
            className="text-sm font-bold uppercase tracking-wider text-white"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            {data.name}
          </span>
          <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded shrink-0 ml-2">
            Force Disposition
          </span>
        </div>

        {/* Card image */}
        {image && !failed && (
          <div className="mb-1.5">
            <PageImage
              src={`${apiBase}/pages/${image.pdfName}/page-${image.page}.png`}
              alt={data.name}
              onError={() => setFailed(true)}
            />
          </div>
        )}

        {/* Fallback when image failed */}
        {image && failed && (
          <div className="text-xs text-slate-400 italic py-4 text-center">
            Image unavailable for {data.name}
          </div>
        )}

        {/* No image — show description body */}
        {!image && (
          <div className="text-xs text-slate-300 leading-snug mb-1.5 whitespace-pre-line">
            {data.description}
          </div>
        )}

        {/* Description below image */}
        {image && data.description && (
          <div className="text-[11px] text-slate-400 leading-snug whitespace-pre-line">
            {data.description}
          </div>
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
