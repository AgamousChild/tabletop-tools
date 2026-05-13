import { factionDisplayName } from '../lib/faction-names'

export interface FactionBannerProps {
  factions: string[]
  subfaction?: string
  onDismiss: () => void
}

export function FactionBanner({ factions, subfaction, onDismiss }: FactionBannerProps) {
  if (factions.length === 0) return null

  const label = subfaction
    ? factionDisplayName(subfaction)
    : factions.map(f => factionDisplayName(f)).join(', ')

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 flex items-center justify-between gap-3">
      <span className="text-xs text-amber-400">Filtered to {label}</span>
      <button
        onClick={onDismiss}
        className="text-xs text-amber-400 hover:text-amber-300 underline shrink-0"
      >
        Show all results
      </button>
    </div>
  )
}
