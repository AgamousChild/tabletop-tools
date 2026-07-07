/**
 * migrateIndexedDbLists — one-time migration from IndexedDB list storage to listV2 server.
 *
 * Runs once per device/user combination, gated by a localStorage "done" flag.
 * The flag is only set once every local list has been migrated successfully
 * (failed === 0). While any list has failed, the migration stays eligible to
 * re-run on next load.
 *
 * Idempotency (no duplicate lists on retry): every local list id that is
 * successfully migrated is recorded in a separate localStorage set
 * (MIGRATED_IDS_KEY). On each run, lists whose id is already in that set are
 * skipped before calling createListV2Imperative — so a retry after a partial
 * failure only pushes the lists that failed last time. The local list `id`
 * (the IndexedDB primary key) is used as the identity signal because it is
 * stable across runs and is not derived from anything the migration itself
 * writes to the server (name/timestamp could collide or be edited by the
 * user after a partial migration; the local id cannot).
 *
 * The IndexedDB lists/list_units stores are left intact (deprecated, not dropped).
 */
import { getList, getLists, getListUnits } from '@tabletop-tools/game-data-store'

import { addUnitV2Imperative, createListV2Imperative, pointsToBattleSizeEnum } from './useListsV2'

const MIGRATION_KEY = 'list-builder:idb-migration-v2-done'
const MIGRATED_IDS_KEY = 'list-builder:idb-migration-v2-migrated-ids'

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

function getMigratedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(MIGRATED_IDS_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function addMigratedId(id: string, migratedIds: Set<string>): void {
  migratedIds.add(id)
  try {
    localStorage.setItem(MIGRATED_IDS_KEY, JSON.stringify([...migratedIds]))
  } catch {
    // ignore — worst case this list gets re-attempted next run, which is
    // safe (createListV2Imperative failing again just re-adds it to failedLists)
  }
}

export type MigrationResult = {
  migrated: number
  failed: number
  skipped: boolean
  /** Local lists that failed to migrate this run (id + name), for user-facing surfacing. */
  failedLists: Array<{ id: string; name: string }>
}

/**
 * Migrate all IndexedDB lists to the server.
 *
 * Safe to call multiple times: already-migrated lists (tracked by local id)
 * are skipped, so retries never create duplicates. The completion flag is
 * only set when every list in this run either migrated successfully or had
 * already been migrated in a prior run — i.e. failed === 0.
 * Returns a result summary; does NOT throw.
 */
export async function migrateIndexedDbLists(): Promise<MigrationResult> {
  if (isMigrationDone()) {
    return { migrated: 0, failed: 0, skipped: true, failedLists: [] }
  }

  let migrated = 0
  let failed = 0
  const failedLists: Array<{ id: string; name: string }> = []
  const migratedIds = getMigratedIds()

  try {
    const localLists = await getLists()

    for (const localList of localLists) {
      if (migratedIds.has(localList.id)) continue

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
        addMigratedId(localList.id, migratedIds)
      } catch {
        failed++
        failedLists.push({ id: localList.id, name: localList.name })
      }
    }
  } catch {
    // getLists() failure — treat as no local lists
  }

  // Only mark done once nothing failed. Failed lists remain un-recorded in
  // MIGRATED_IDS_KEY, so the next run retries exactly them and skips the rest.
  if (failed === 0) {
    markMigrationDone()
  }

  return { migrated, failed, skipped: false, failedLists }
}
