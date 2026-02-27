import { useState } from 'react'

type Props = {
  text: string
}

/**
 * Small info icon that expands to show help text on click.
 * Used throughout all apps for contextual field-level help.
 */
export function HelpTip({ text }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-700 text-[9px] font-bold text-slate-400 hover:bg-slate-600 hover:text-slate-300 transition-colors"
        title={text}
        aria-label="Help"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-5 top-0 z-10 w-48 rounded bg-slate-800 border border-slate-700 px-2 py-1.5 text-[11px] text-slate-300 leading-tight shadow-lg">
          {text}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-1 text-slate-500 hover:text-slate-300"
          >
            ×
          </button>
        </span>
      )}
    </span>
  )
}
