import { useState } from 'react'

export interface CollapsibleSectionProps {
  title: string
  count: number
  children: React.ReactNode
}

export function CollapsibleSection({ title, count, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(false)

  if (!count) return null

  return (
    <div className="border-t border-slate-800 mt-2">
      <button
        className="w-full flex items-center justify-between py-2 text-left"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="text-xs text-slate-500 uppercase font-medium">{title}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs bg-slate-700 text-slate-300 rounded-full px-1.5 min-w-[1.25rem] text-center">
            {count}
          </span>
          <svg
            className={`w-3 h-3 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  )
}
