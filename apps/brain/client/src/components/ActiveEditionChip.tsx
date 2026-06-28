/**
 * Small chip that surfaces the currently-active edition filter next to
 * search-results counts / browse layer counts. Makes it obvious *why*
 * a given unit might not be showing up.
 *
 * Informational only — the edition picker in the header is still the
 * only way to change the filter. Keeping this read-only avoids a second
 * control with the same semantics (and the synchronization headaches
 * that come with it).
 *
 * Hidden when the active edition is `'any'` — there's no filter to
 * announce, so the chip would just be visual noise.
 */

import type { Edition } from '../lib/edition'

export interface ActiveEditionChipProps {
  edition: Edition
}

export function ActiveEditionChip({ edition }: ActiveEditionChipProps) {
  if (edition === 'any') return null

  return (
    <span
      data-testid="active-edition-chip"
      className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/50 text-slate-400"
      title="Edition filter is set by the picker in the header"
    >
      Edition: {edition}
    </span>
  )
}
