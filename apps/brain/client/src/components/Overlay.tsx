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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 overflow-y-auto"
      onClick={onDismiss}
    >
      <div
        className="relative w-full md:max-w-3xl md:mx-4 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
