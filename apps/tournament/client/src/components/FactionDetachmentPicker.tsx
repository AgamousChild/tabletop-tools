import { trpc } from '../lib/trpc'

type Props = {
  /** Currently selected faction entity ID (or null if not selected) */
  factionEntityId: string | null
  /** Currently selected detachment entity ID (or null) */
  detachmentEntityId: string | null
  onFactionChange: (id: string | null) => void
  onDetachmentChange: (id: string | null) => void
  /** Fall-through: free-text faction string when content_entity is empty */
  factionText?: string
  onFactionTextChange?: (value: string) => void
  disabled?: boolean
}

/**
 * Faction + Detachment picker backed entirely by content_entity.
 *
 * - Faction list: player.listFactions() — reads content_entity WHERE type='faction'
 * - Detachment list: player.listDetachments(factionEntityId) — reads content_entity WHERE type='detachment'
 *
 * No hardcoded arrays. Falls back to a free-text input when content_entity
 * has no faction rows yet (returns empty array from the server).
 */
export function FactionDetachmentPicker({
  factionEntityId,
  detachmentEntityId,
  onFactionChange,
  onDetachmentChange,
  factionText = '',
  onFactionTextChange,
  disabled = false,
}: Props) {
  const factionsQuery = trpc.player.listFactions.useQuery()
  const detachmentsQuery = trpc.player.listDetachments.useQuery(
    { factionEntityId: factionEntityId! },
    { enabled: !!factionEntityId },
  )

  const factions = factionsQuery.data ?? []
  const detachments = detachmentsQuery.data ?? []
  const hasFactions = factions.length > 0

  const inputClass =
    'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 text-sm disabled:opacity-50'

  // When factions exist in DB: show selects driven by content_entity
  if (hasFactions) {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Faction</label>
          <select
            className={inputClass}
            value={factionEntityId ?? ''}
            onChange={(e) => {
              const val = e.target.value || null
              onFactionChange(val)
              onDetachmentChange(null) // clear detachment when faction changes
            }}
            disabled={disabled}
          >
            <option value="">Select faction...</option>
            {factions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {factionEntityId && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Detachment</label>
            {detachmentsQuery.isLoading ? (
              <div className="text-slate-500 text-sm">Loading...</div>
            ) : detachments.length > 0 ? (
              <select
                className={inputClass}
                value={detachmentEntityId ?? ''}
                onChange={(e) => onDetachmentChange(e.target.value || null)}
                disabled={disabled}
              >
                <option value="">Select detachment...</option>
                {detachments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-slate-500 text-sm italic">
                No detachments found for this faction.
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Fallback: free-text faction input when content_entity is empty
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-1">Faction</label>
      <input
        className={inputClass}
        type="text"
        value={factionText}
        onChange={(e) => onFactionTextChange?.(e.target.value)}
        placeholder="Faction (e.g. Space Marines)"
        disabled={disabled}
      />
    </div>
  )
}
