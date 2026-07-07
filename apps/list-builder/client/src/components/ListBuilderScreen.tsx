import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { BattleSize } from '../lib/armyRules'
import { authClient } from '../lib/auth'
import { migrateIndexedDbLists } from '../lib/migrateIndexedDbLists'
import {
  createListV2Imperative,
  type ListSummaryV2,
  pointsToBattleSizeEnum,
  useInvalidateListsV2,
} from '../lib/useListsV2'
import { BattleSizeScreen } from './BattleSizeScreen'
import { FactionDetachmentScreen } from './FactionDetachmentScreen'
import { MyListsScreen } from './MyListsScreen'
import { UnitSelectionScreen } from './UnitSelectionScreen'

/**
 * Convert a faction display name to its canonical content_entity id.
 * Mirrors the data-import slug rule: strip apostrophes / smart quotes,
 * lowercase, non-alnum → '-', trim '-', max 60 chars. The match must be
 * exact for the FK constraint on `list.faction_id`.
 */
function canonicalFactionId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’ʼ'‘"”“]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

type Screen =
  | { type: 'my-lists' }
  | { type: 'battle-size' }
  | { type: 'faction-detachment'; battleSize: BattleSize }
  | {
      type: 'unit-selection'
      listId: string
      factionId: string
      detachmentId: string
      battleSize: BattleSize
    }

type Props = {
  onSignOut: () => void
}

/**
 * Map a listV2 battleSize string back to a BattleSize object.
 * Uses totalPoints to disambiguate "Strike Force" at 1000 vs 2000 pts.
 */
function battleSizeFromServer(bsName: string, totalPoints: number): BattleSize {
  if (bsName === 'Strike Force' && totalPoints === 1000) {
    return { name: 'Strike Force', points: 1000, maxDuplicates: 2, description: '' }
  }
  const byName: Record<string, BattleSize> = {
    Incursion: { name: 'Incursion', points: 500, maxDuplicates: 1, description: '' },
    'Combat Patrol': { name: 'Combat Patrol', points: 500, maxDuplicates: 1, description: '' },
    'Strike Force': { name: 'Strike Force', points: 2000, maxDuplicates: 3, description: '' },
    Onslaught: { name: 'Onslaught', points: 3000, maxDuplicates: 3, description: '' },
    unknown: { name: 'Strike Force', points: 2000, maxDuplicates: 3, description: '' },
  }
  return byName[bsName] ?? { name: 'Strike Force', points: 2000, maxDuplicates: 3, description: '' }
}

export function ListBuilderScreen({ onSignOut }: Props) {
  const [screen, setScreen] = useState<Screen>({ type: 'my-lists' })
  const [migrationFailures, setMigrationFailures] = useState<Array<{ id: string; name: string }>>(
    [],
  )
  const invalidateLists = useInvalidateListsV2()
  const migrationRan = useRef(false)

  // One-time migration: push any existing IndexedDB lists to the server.
  // If some lists fail, the migration itself does not mark completion (so it
  // retries on next load) — but the user still needs to know now that some
  // of their lists did not make it to the server this run.
  useEffect(() => {
    if (migrationRan.current) return
    migrationRan.current = true
    void migrateIndexedDbLists().then((result) => {
      if (!result.skipped && result.migrated > 0) {
        invalidateLists()
      }
      if (result.failed > 0) {
        setMigrationFailures(result.failedLists)
      }
    })
  }, [invalidateLists])

  const handleSignOut = useCallback(async () => {
    await authClient.signOut()
    onSignOut()
  }, [onSignOut])

  const handleCreateNew = useCallback(() => {
    setScreen({ type: 'battle-size' })
  }, [])

  const handleSelectList = useCallback((list: ListSummaryV2) => {
    const bs = battleSizeFromServer(list.battleSize, list.totalPoints)
    setScreen({
      type: 'unit-selection',
      listId: list.id,
      factionId: list.factionId ?? '',
      detachmentId: list.detachmentId ?? '',
      battleSize: bs,
    })
  }, [])

  const handleBattleSizeSelect = useCallback((size: BattleSize) => {
    setScreen({ type: 'faction-detachment', battleSize: size })
  }, [])

  const handleFactionDetachmentSelect = useCallback(
    async (factionDisplayName: string, detachmentId: string) => {
      const bs =
        screen.type === 'faction-detachment'
          ? screen.battleSize
          : { name: 'Strike Force', points: 2000, maxDuplicates: 3, description: '' }

      const bsEnum = pointsToBattleSizeEnum(bs.points)
      const name = `${factionDisplayName || 'New List'} ${bs.points}pts`
      // Convert display name → canonical content_entity faction id, matching
      // the data-import slug rule (drop apostrophes, lowercase, non-alnum → '-').
      const factionId = factionDisplayName ? canonicalFactionId(factionDisplayName) : undefined

      const listId = await createListV2Imperative({
        name,
        battleSize: bsEnum,
        factionId,
        detachmentId: detachmentId || undefined,
      })

      invalidateLists()

      setScreen({
        type: 'unit-selection',
        listId,
        factionId: factionId ?? '',
        detachmentId,
        battleSize: bs,
      })
    },
    [screen, invalidateLists],
  )

  const handleDone = useCallback(() => {
    invalidateLists()
    setScreen({ type: 'my-lists' })
  }, [invalidateLists])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            title="Back to Home"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path
                fillRule="evenodd"
                d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 1-.707-1.707l7-7Z"
                clipRule="evenodd"
              />
            </svg>
            Home
          </a>
          <h1>
            <a
              href="/"
              className="text-2xl font-bold text-amber-400 hover:text-amber-300 transition-colors"
            >
              List Builder
            </a>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleSignOut()}
            className="text-slate-400 hover:text-slate-100 text-sm"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {migrationFailures.length > 0 && (
          <div
            data-testid="migration-warning"
            className="mb-4 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-500/30 text-amber-400 text-sm"
          >
            <p className="font-semibold">
              {migrationFailures.length} list{migrationFailures.length === 1 ? '' : 's'} could not
              be moved to your account
            </p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              {migrationFailures.map((l) => l.name).join(', ')} — we&apos;ll retry automatically
              next time you open the app. Your original lists are still saved on this device.
            </p>
          </div>
        )}

        {screen.type === 'my-lists' && (
          <MyListsScreen onCreateNew={handleCreateNew} onSelectList={handleSelectList} />
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
            factionId={screen.factionId}
            detachmentId={screen.detachmentId}
            battleSize={screen.battleSize}
            onDone={handleDone}
            onBack={() => setScreen({ type: 'my-lists' })}
          />
        )}
      </div>
    </div>
  )
}
