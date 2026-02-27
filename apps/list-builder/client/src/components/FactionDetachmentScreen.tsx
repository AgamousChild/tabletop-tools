import { useState } from 'react'
import { useGameDataAvailable, useDetachmentAbilities } from '@tabletop-tools/game-data-store'

import { useGameFactions, useGameDetachments } from '../lib/useGameData'
import type { BattleSize } from '../lib/armyRules'

type Props = {
  battleSize: BattleSize
  onSelect: (faction: string, detachment: string) => void
  onBack: () => void
}

/** Shows detachment button with abilities preview */
function DetachmentCard({ detId, detName, onSelect }: {
  detId: string
  detName: string
  onSelect: () => void
}) {
  const { data: abilities = [] } = useDetachmentAbilities(detId)

  return (
    <button
      onClick={onSelect}
      className="w-full text-left p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-400/50 transition-colors"
    >
      <p className="font-semibold text-slate-100">{detName}</p>
      {abilities.length > 0 && (
        <div className="mt-2 space-y-1">
          {abilities.slice(0, 3).map((a) => (
            <div key={a.id} className="text-xs text-slate-400">
              <span className="text-slate-300 font-medium">{a.name}</span>
              {a.legend && <span className="text-slate-600"> ({a.legend})</span>}
              {a.description && (
                <p className="text-slate-500 mt-0.5 line-clamp-2">{a.description}</p>
              )}
            </div>
          ))}
          {abilities.length > 3 && (
            <p className="text-xs text-slate-600">+{abilities.length - 3} more rules</p>
          )}
        </div>
      )}
    </button>
  )
}

export function FactionDetachmentScreen({ battleSize, onSelect, onBack }: Props) {
  const [selectedFaction, setSelectedFaction] = useState('')
  const gameDataAvailable = useGameDataAvailable()
  const { data: factions = [] } = useGameFactions()
  const { data: detachments = [] } = useGameDetachments(selectedFaction)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-slate-200 text-sm"
        >
          Back
        </button>
        <h2 className="text-lg font-semibold text-slate-100">{battleSize.points}pts {battleSize.name}</h2>
      </div>

      {!gameDataAvailable && (
        <div className="bg-slate-900 border border-amber-400/30 rounded-lg p-4 text-center">
          <p className="text-slate-200 font-semibold">No game data imported</p>
          <p className="text-slate-400 text-sm mt-1">
            Import unit profiles from the{' '}
            <a href="/data-import/" className="text-amber-400 hover:underline">Data Import</a>{' '}
            app to browse factions and build lists.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <label className="block text-sm text-slate-400">Select Faction</label>
        <select
          value={selectedFaction}
          onChange={(e) => setSelectedFaction(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-amber-400"
          aria-label="Select faction"
        >
          <option value="">Choose faction...</option>
          {factions.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {selectedFaction && (
        <div className="space-y-3">
          <label className="block text-sm text-slate-400">Select Detachment</label>
          {detachments.length === 0 ? (
            <button
              onClick={() => onSelect(selectedFaction, 'Default')}
              className="w-full text-left p-4 rounded-xl bg-slate-900 border border-amber-400/30 transition-colors"
            >
              <p className="font-semibold text-slate-100">Default Detachment</p>
              <p className="text-sm text-slate-400 mt-0.5">No detachment data imported. Continue with default rules.</p>
            </button>
          ) : (
            detachments.map((det) => (
              <DetachmentCard
                key={det.id}
                detId={det.id}
                detName={det.name}
                onSelect={() => onSelect(selectedFaction, det.name)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
