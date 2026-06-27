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
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface-overlay text-[9px] font-bold text-foreground-subtle hover:bg-surface-overlay-hover hover:text-foreground-muted transition-colors"
        title={text}
        aria-label="Help"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-5 top-0 z-10 w-48 rounded bg-surface-raised border border-border-strong px-2 py-1.5 text-[11px] text-foreground-muted leading-tight shadow-lg">
          {text}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-1 text-foreground-faint hover:text-foreground-muted"
          >
            ×
          </button>
        </span>
      )}
    </span>
  )
}
