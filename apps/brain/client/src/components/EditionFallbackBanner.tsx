/**
 * Calm one-line banner that appears when the Worker tried the requested
 * edition (typically 11th), got no results, and soft-fell-back to `any`.
 *
 * The Worker signals this with `{ fallback: true, fallbackFrom: '11th' }`
 * on `/search`, `/ask`, and `/graph-data` responses.
 *
 * Copy is intentionally calm — this isn't an error, it's an explanation.
 */

import type { Edition } from '../lib/edition'

export interface EditionFallbackBannerProps {
  fallbackFrom: Edition
  onDismiss?: () => void
}

function editionLabel(e: Edition): string {
  return e === 'any' ? 'the selected edition' : `${e} edition`
}

export function EditionFallbackBanner({ fallbackFrom, onDismiss }: EditionFallbackBannerProps) {
  return (
    <div
      role="status"
      data-testid="edition-fallback-banner"
      className="bg-slate-800/60 border border-slate-700 rounded px-3 py-2 flex items-center justify-between gap-3 text-xs text-slate-300"
    >
      <span>No {editionLabel(fallbackFrom)} results. Showing all editions.</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-200 shrink-0"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  )
}
