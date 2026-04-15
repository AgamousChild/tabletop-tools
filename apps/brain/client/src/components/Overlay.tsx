import type { ReactNode } from 'react'

interface OverlayProps {
  open: boolean
  onDismiss: () => void
  children: ReactNode
}

export function Overlay({ open, onDismiss, children }: OverlayProps) {
  if (!open) return null

  return (
    <div
      data-testid="overlay-backdrop"
      className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/70 overflow-y-auto pb-20 md:pb-0"
      onClick={onDismiss}
    >
      <div
        className="relative w-full md:max-w-3xl md:mx-4 md:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          aria-label="Close"
          onClick={onDismiss}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 h-12 w-12 flex items-center justify-center rounded-full bg-slate-800 text-slate-100 hover:bg-slate-700 transition-colors md:absolute md:bottom-auto md:left-auto md:translate-x-0 md:-top-3 md:-right-3 md:h-10 md:w-10"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}
