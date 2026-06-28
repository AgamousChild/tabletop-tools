/**
 * One-tap edition switcher shown when a direct-fetch endpoint
 * (`/browse/unit/:id`, `/browse/node/:id`, `/browse/detachment/:id`) returns
 * 404 for the requested edition but the Worker advertised other editions in
 * `X-Available-Editions`.
 *
 * No auto-redirect — Micah's call: let the user opt in.
 */

import type { Edition } from '../lib/edition'

export interface EditionNotAvailableNoticeProps {
  requested: Edition
  available: Edition[]
  /** Subject of the lookup, e.g. "This unit" or "This detachment". */
  subject?: string
  onSwitch: (next: Edition) => void
}

function editionLabel(e: Edition): string {
  return e === 'any' ? 'all editions' : `${e} edition`
}

export function EditionNotAvailableNotice({
  requested,
  available,
  subject = 'This entry',
  onSwitch,
}: EditionNotAvailableNoticeProps) {
  if (available.length === 0) return null
  // Prefer the first available edition that isn't the one we just tried.
  const target = available.find((e) => e !== requested) ?? available[0]!

  return (
    <div
      role="alert"
      data-testid="edition-not-available-notice"
      className="bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 flex items-center justify-between gap-3 text-xs text-amber-200"
    >
      <span>
        {subject} exists in {editionLabel(target)}. View it?
      </span>
      <button
        type="button"
        data-testid="edition-switch-button"
        onClick={() => onSwitch(target)}
        className="bg-amber-500 text-slate-950 px-2 py-1 rounded font-medium hover:bg-amber-400"
      >
        Switch to {target === 'any' ? 'Any' : target}
      </button>
    </div>
  )
}
