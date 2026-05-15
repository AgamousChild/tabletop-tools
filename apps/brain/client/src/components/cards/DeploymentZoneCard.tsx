import { renderMarkdown } from "../../lib/render-markdown"
import { useState } from 'react'

import type { CardContext, DeploymentZoneCardData } from './types'

interface DeploymentZoneCardProps {
  data: DeploymentZoneCardData
  context: CardContext
}

const SIZE_LABELS: Record<number, string> = {}

function PageImage({ src, alt, onError }: { src: string; alt: string; onError: () => void }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative">
      {!loaded && (
        <div className="flex items-center justify-center h-48 text-slate-400 text-xs">Loading...</div>
      )}
      <img
        src={src}
        alt={alt}
        className="w-full h-auto rounded"
        style={{ display: loaded ? undefined : 'none' }}
        onLoad={() => setLoaded(true)}
        onError={() => { setLoaded(false); onError() }}
      />
    </div>
  )
}

export function DeploymentZoneCard({ data }: DeploymentZoneCardProps) {
  const apiBase = import.meta.env.VITE_BRAIN_API_URL || '/brain/api'
  const images = data.pdfImages ?? []
  const [currentPage, setCurrentPage] = useState(0)
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set())

  // Build labels for each page from battle size info
  // Standard zones: page 0 = Strike Force, page 1 = Incursion
  // Asymmetric: single page
  const pageLabels = images.map((_, i) => {
    if (images.length === 1) return 'Asymmetric War'
    return i === 0 ? 'Strike Force (2000pts)' : 'Incursion (1000pts)'
  })

  const validImages = images.filter((_, i) => !failedPages.has(i))
  const hasMultiplePages = validImages.length > 1

  return (
    <div
      className="border-2 border-slate-700 rounded-md overflow-hidden bg-slate-950"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      <div className="px-3.5 py-2.5">
        {/* Header */}
        <div className="flex items-baseline justify-between border-b-2 border-green-500 pb-1 mb-1.5">
          <span
            className="text-sm font-bold uppercase tracking-wider text-white"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            {data.name}
          </span>
          {data.battleSize && (
            <span className="text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded shrink-0 ml-2">
              {data.battleSize}
            </span>
          )}
        </div>

        {/* Page flip image viewer */}
        {images.length > 0 ? (
          <div className="mb-1.5">
            {/* Page tabs / navigation */}
            {hasMultiplePages && (
              <div className="flex gap-1 mb-2">
                {images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i)}
                    className={`text-[11px] px-2.5 py-1 rounded font-medium transition-colors ${
                      currentPage === i
                        ? 'bg-green-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {pageLabels[i]}
                  </button>
                ))}
              </div>
            )}

            {/* Single page label for asymmetric */}
            {!hasMultiplePages && images.length === 1 && (
              <div className="text-[10px] text-green-400 uppercase tracking-wide mb-1">
                {pageLabels[0]}
              </div>
            )}

            {/* Current image */}
            {images[currentPage] && !failedPages.has(currentPage) && (
              <PageImage
                src={`${apiBase}/pages/${images[currentPage].pdfName}/page-${images[currentPage].page}.png`}
                alt={`${data.name} — ${pageLabels[currentPage]}`}
                onError={() => setFailedPages(prev => new Set([...prev, currentPage]))}
              />
            )}

            {/* Fallback when current page failed */}
            {failedPages.has(currentPage) && (
              <div className="text-xs text-slate-400 italic py-4 text-center">
                Image unavailable for {pageLabels[currentPage]}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-300 leading-snug mb-1.5 whitespace-pre-line">
            {data.description}
          </div>
        )}

        {/* Description */}
        {data.description && (
          <div className="text-[11px] text-slate-400 leading-snug whitespace-pre-line">
            {data.description}
          </div>
        )}

        {/* Quality flags */}
        {data.qualityFlags && data.qualityFlags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {data.qualityFlags.map((flag) => (
              <span key={flag} className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                {flag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
