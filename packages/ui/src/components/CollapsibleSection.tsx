import { useState } from 'react'
import type { ReactNode } from 'react'

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
    <div className="rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
      >
        <span>
          {title}
          {count !== undefined && (
            <span className="ml-1.5 text-[10px] font-normal text-slate-500">({count})</span>
          )}
        </span>
        <span className="text-slate-600 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0">
          {children}
        </div>
      )}
    </div>
  )
}
