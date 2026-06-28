/**
 * Calm one-line banner that appears when the Worker tried the requested
 * edition (typically 11th), got no results, and soft-fell-back to `any`.
 *
 * The Worker signals this with `{ fallback: true, fallbackFrom: '11th' }`
 * on `/search`, `/ask`, and `/graph-data` responses.
 *
 * Copy is intentionally calm — this isn't an error, it's an explanation.
 *
 * Only renders when `fallbackFrom` is a specific edition (`11th` / `10th` /
 * `9th`). When `fallbackFrom` is `'any'` or otherwise non-specific the copy
 * has no useful subject ("No the selected edition results."), so the banner
 * suppresses itself — the absence of results is already self-evident.
 */

import type { Edition } from '../lib/edition'

export interface EditionFallbackBannerProps {
  fallbackFrom: Edition | undefined
  onDismiss?: () => void
}

const SPECIFIC_EDITIONS: ReadonlyArray<Edition> = ['11th', '10th', '9th']

function isSpecificEdition(e: Edition | undefined): e is '11th' | '10th' | '9th' {
  return e != null && (SPECIFIC_EDITIONS as ReadonlyArray<Edition>).includes(e)
}

export function EditionFallbackBanner({ fallbackFrom, onDismiss }: EditionFallbackBannerProps) {
  if (!isSpecificEdition(fallbackFrom)) return null

  return (
    <div
      role="status"
      data-testid="edition-fallback-banner"
      className="bg-slate-800/60 border border-slate-700 rounded px-3 py-2 flex items-center justify-between gap-3 text-xs text-slate-300"
    >
      <span>No {fallbackFrom} edition results. Showing all editions.</span>
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
