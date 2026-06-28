/**
 * Small button-group picker for the active rules edition.
 *
 * Lives in the BrainScreen header. Selection is reflected into
 * `window.location.hash` (`#edition=11th`) by the parent so it survives
 * reload + share.
 */

import { type Edition, EDITION_OPTIONS } from '../lib/edition'

export interface EditionPickerProps {
  value: Edition
  onChange: (next: Edition) => void
}

export function EditionPicker({ value, onChange }: EditionPickerProps) {
  return (
    <div
      role="group"
      aria-label="Rules edition"
      data-testid="edition-picker"
      className="inline-flex items-center rounded border border-slate-700 overflow-hidden text-xs"
    >
      <span className="px-2 py-1 text-slate-500 bg-slate-900 border-r border-slate-700">
        Edition
      </span>
      {EDITION_OPTIONS.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            data-testid={`edition-option-${opt.value}`}
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={`px-2 py-1 transition-colors ${
              selected
                ? 'bg-amber-500 text-slate-950 font-medium'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
