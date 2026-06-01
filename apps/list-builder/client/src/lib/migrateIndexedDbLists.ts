/**
 * migrateIndexedDbLists — one-time migration from IndexedDB list storage to listV2 server.
 *
 * Runs once per device/user combination. Checks a localStorage flag before executing.
 * On completion, sets the flag so it never runs again on this device.
 *
 * The IndexedDB lists/list_units stores are left intact (deprecated, not dropped).
 */
import { getList, getLists, getListUnits } from '@tabletop-tools/game-data-store'

import { addUnitV2Imperative, createListV2Imperative, pointsToBattleSizeEnum } from './useListsV2'

const MIGRATION_KEY = 'list-builder:idb-migration-v2-done'

export function isMigrationDone(): boolean {
  try {
    return localStorage.getItem(MIGRATION_KEY) === '1'
  } catch {
    return true // If localStorage is unavailable, skip migration silently
  }
}

export function markMigrationDone(): void {
  try {
    localStorage.setItem(MIGRATION_KEY, '1')
  } catch {
    // ignore
  }
}

export type MigrationResult = {
  migrated: number
  failed: number
  skipped: boolean
}

/**
 * Migrate all IndexedDB lists to the server.
 *
 * Safe to call multiple times — the MIGRATION_KEY guard prevents re-runs.
 * Returns a result summary; does NOT throw.
 */
export async function migrateIndexedDbLists(): Promise<MigrationResult> {
  if (isMigrationDone()) {
    return { migrated: 0, failed: 0, skipped: true }
  }

  let migrated = 0
  let failed = 0

  try {
    const localLists = await getLists()

    for (const localList of localLists) {
      try {
        const full = await getList(localList.id)
        if (!full) continue

        const battleSize = pointsToBattleSizeEnum(full.battleSize ?? 2000)

        const serverId = await createListV2Imperative({
          name: full.name,
          battleSize,
          factionId: full.faction || undefined,
          detachmentId: full.detachment || undefined,
        })

        const units = await getListUnits(localList.id)
        for (const unit of units) {
          try {
            await addUnitV2Imperative({
              listId: serverId,
              datasheetId: unit.unitContentId || undefined,
              isWarlord: unit.isWarlord ?? false,
              points: unit.unitPoints,
            })
          } catch {
            // Individual unit failure is non-fatal; the list header was created
          }
        }

        migrated++
      } catch {
        failed++
      }
    }
  } catch {
    // getLists() failure — treat as no local lists
  }

  // Mark done even if some lists failed — we don't want to re-run and create duplicates
  markMigrationDone()

  return { migrated, failed, skipped: false }
}
