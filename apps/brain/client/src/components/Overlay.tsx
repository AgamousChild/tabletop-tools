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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 overflow-y-auto"
      onClick={onDismiss}
    >
      <div
        className="relative w-full max-w-2xl mx-4 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          aria-label="Close"
          onClick={onDismiss}
          className="absolute -top-3 -right-3 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 text-slate-100 hover:bg-slate-700 transition-colors"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}
