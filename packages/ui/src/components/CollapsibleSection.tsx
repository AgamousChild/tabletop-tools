import type { ReactNode } from 'react'
import { useState } from 'react'

type Props = {
  title: string
  count?: number
  children: ReactNode
  defaultOpen?: boolean
}

/**
 * Collapsible section with title and optional count badge.
 * Collapsed by default — shows only the title and toggle indicator.
 */
export function CollapsibleSection({ title, count, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg bg-surface border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-foreground-subtle uppercase tracking-wider hover:text-foreground-secondary transition-colors"
      >
        <span>
          {title}
          {count !== undefined && (
            <span className="ml-1.5 text-[10px] font-normal text-foreground-faint">({count})</span>
          )}
        </span>
        <span className="text-foreground-disabled text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-3 pb-3 pt-0">{children}</div>}
    </div>
  )
}
