import { useState, useCallback } from 'react'

import { authClient } from '../lib/auth'
import {
  createList as createListInDb,
  useLists,
} from '@tabletop-tools/game-data-store'
import type { LocalList } from '@tabletop-tools/game-data-store'
import { MyListsScreen } from './MyListsScreen'
import { BattleSizeScreen } from './BattleSizeScreen'
import { FactionDetachmentScreen } from './FactionDetachmentScreen'
import { UnitSelectionScreen } from './UnitSelectionScreen'
import type { BattleSize } from '../lib/armyRules'
import { syncListToServer, syncAllToServer, restoreFromServer } from '../lib/sync'
import { HelpTip } from '@tabletop-tools/ui'

type Screen =
  | { type: 'my-lists' }
  | { type: 'battle-size' }
  | { type: 'faction-detachment'; battleSize: BattleSize }
  | { type: 'unit-selection'; listId: string; faction: string; detachment: string; battleSize: BattleSize }

type Props = {
  onSignOut: () => void
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function ListBuilderScreen({ onSignOut }: Props) {
  const [screen, setScreen] = useState<Screen>({ type: 'my-lists' })
  const { refetch: refetchLists } = useLists()
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  async function handleSignOut() {
    await authClient.signOut()
    onSignOut()
  }

  const handleCreateNew = useCallback(() => {
    setScreen({ type: 'battle-size' })
  }, [])

  const handleSelectList = useCallback((list: LocalList) => {
    // Reconstruct battleSize from stored points or default
    const pts = list.battleSize ?? 2000
    const sizeMap: Record<number, BattleSize> = {
      500: { name: 'Incursion', points: 500, maxDuplicates: 1, description: '' },
      1000: { name: 'Strike Force', points: 1000, maxDuplicates: 2, description: '' },
      2000: { name: 'Strike Force', points: 2000, maxDuplicates: 3, description: '' },
      3000: { name: 'Onslaught', points: 3000, maxDuplicates: 3, description: '' },
    }
    setScreen({
      type: 'unit-selection',
      listId: list.id,
      faction: list.faction,
      detachment: list.detachment ?? '',
      battleSize: sizeMap[pts] ?? { name: 'Strike Force', points: pts, maxDuplicates: 3, description: '' },
    })
  }, [])

  const handleBattleSizeSelect = useCallback((size: BattleSize) => {
    setScreen({ type: 'faction-detachment', battleSize: size })
  }, [])

  const handleFactionDetachmentSelect = useCallback(async (faction: string, detachment: string) => {
    const bs = screen.type === 'faction-detachment' ? screen.battleSize : { name: 'Strike Force', points: 2000, maxDuplicates: 3, description: '' }

    // Create the list in IndexedDB
    const id = generateId()
    const now = Date.now()
    await createListInDb({
      id,
      faction,
      name: `${faction} ${bs.points}pts`,
      detachment,
      battleSize: bs.points,
      totalPts: 0,
      createdAt: now,
      updatedAt: now,
    })
    refetchLists()
    syncListToServer(id)

    setScreen({
      type: 'unit-selection',
      listId: id,
      faction,
      detachment,
      battleSize: bs,
    })
  }, [screen, refetchLists])

  const handleDone = useCallback(() => {
    refetchLists()
    setScreen({ type: 'my-lists' })
  }, [refetchLists])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <h1><a href="/" className="text-2xl font-bold text-amber-400 hover:text-amber-300 transition-colors">List Builder</a></h1>
        <div className="flex items-center gap-3">
          {syncStatus && <span className="text-xs text-green-400">{syncStatus}</span>}
          <button
            onClick={() => {
              syncAllToServer()
              setSyncStatus('Synced!')
              setTimeout(() => setSyncStatus(null), 2000)
            }}
            className="text-slate-400 hover:text-amber-400 text-sm"
          >
            Sync
          </button>
          <HelpTip text="Upload lists to server backup" />
          <button
            onClick={() => {
              void (async () => {
                try {
                  const count = await restoreFromServer()
                  refetchLists()
                  setSyncStatus(`Restored ${count} list${count !== 1 ? 's' : ''}`)
                  setTimeout(() => setSyncStatus(null), 3000)
                } catch {
                  setSyncStatus('Restore failed')
                  setTimeout(() => setSyncStatus(null), 3000)
                }
              })()
            }}
            className="text-slate-400 hover:text-amber-400 text-sm"
          >
            Restore
          </button>
          <HelpTip text="Download lists from server to this device" />
          <button
            onClick={() => void handleSignOut()}
            className="text-slate-400 hover:text-slate-100 text-sm"
          >
            Sign out
          </button>
        </div>
      </header>

      <p className="text-[10px] text-slate-500 px-6 pt-2">Build and manage army lists with live meta ratings. Lists save locally and sync to your account.</p>

      <div className="max-w-4xl mx-auto p-6">
        {screen.type === 'my-lists' && (
          <MyListsScreen
            onCreateNew={handleCreateNew}
            onSelectList={handleSelectList}
          />
        )}

        {screen.type === 'battle-size' && (
          <BattleSizeScreen
            onSelect={handleBattleSizeSelect}
            onBack={() => setScreen({ type: 'my-lists' })}
          />
        )}

        {screen.type === 'faction-detachment' && (
          <FactionDetachmentScreen
            battleSize={screen.battleSize}
            onSelect={(f, d) => void handleFactionDetachmentSelect(f, d)}
            onBack={() => setScreen({ type: 'battle-size' })}
          />
        )}

        {screen.type === 'unit-selection' && (
          <UnitSelectionScreen
            listId={screen.listId}
            faction={screen.faction}
            detachment={screen.detachment}
            battleSize={screen.battleSize}
            onDone={handleDone}
            onBack={() => setScreen({ type: 'my-lists' })}
          />
        )}
      </div>
    </div>
  )
}
