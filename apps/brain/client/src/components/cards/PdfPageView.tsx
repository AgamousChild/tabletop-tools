import { useState } from 'react'

interface PdfPageViewProps {
  pdfName: string
  pageNumber: number
  highlightText: string
  title: string
  /** Top position as percentage of page height (0-100) */
  topPct?: number
  /** Height as percentage of page height (0-100) */
  heightPct?: number
  onDismiss: () => void
}

export function PdfPageView({
  pdfName, pageNumber, highlightText, title,
  topPct, heightPct, onDismiss,
}: PdfPageViewProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const apiBase = import.meta.env.VITE_BRAIN_API_URL || '/brain/api'
  const src = `${apiBase}/pages/${pdfName}/page-${pageNumber}.png`

  const hasHighlight = topPct !== undefined && heightPct !== undefined

  return (
    <div
      data-testid="pdf-page-view"
      className="fixed inset-0 z-50 flex flex-col items-center justify-start bg-black/80 overflow-y-auto"
      onClick={onDismiss}
    >
      <div
        className="relative w-full max-w-3xl mx-auto my-8 px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="bg-slate-900 border border-slate-700 rounded-t-lg px-4 py-3 flex items-center justify-between gap-4">
          <h2 className="font-['Oswald'] uppercase tracking-wide text-amber-400 text-lg font-semibold">
            {title}
          </h2>
          <span className="text-slate-400 text-sm whitespace-nowrap">
            {pdfName} — page {pageNumber}
          </span>
        </div>

        {/* Image area with highlight overlay */}
        <div className="relative bg-slate-950 border-x border-slate-700">
          {/* Loading state */}
          {!loaded && !error && (
            <div
              data-testid="pdf-loading"
              className="flex items-center justify-center h-64 text-slate-400"
            >
              <span className="text-sm">Loading page...</span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div
              data-testid="pdf-error"
              className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2"
            >
              <span className="text-2xl">Page image unavailable</span>
              <span className="text-sm">{pdfName}, page {pageNumber}</span>
            </div>
          )}

          {/* PDF page image */}
          <img
            src={src}
            alt={`${title} — ${pdfName} page ${pageNumber}`}
            className="w-full h-auto block"
            style={{ display: error ? 'none' : undefined }}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setLoaded(false)
              setError(true)
            }}
          />

          {/* Semi-transparent highlight overlay showing where the rule text is on the page */}
          {loaded && hasHighlight && (
            <div
              data-testid="pdf-highlight"
              className="absolute left-0 right-0 border-2 border-amber-400/60 pointer-events-none"
              style={{
                top: `${topPct}%`,
                height: `${heightPct}%`,
                backgroundColor: 'rgba(251, 191, 36, 0.12)',
              }}
            />
          )}
        </div>

        {/* Close button */}
        <div className="bg-slate-900 border border-slate-700 rounded-b-lg px-4 py-3 flex justify-center">
          <button
            aria-label="Close"
            onClick={onDismiss}
            className="flex items-center gap-2 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
