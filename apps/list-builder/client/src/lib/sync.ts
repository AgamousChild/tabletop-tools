import { getList, getListUnits, getLists } from '@tabletop-tools/game-data-store'
import { createList as createListInDb, addListUnit as addListUnitInDb } from '@tabletop-tools/game-data-store'
import { trpcClient } from './trpc'

/** Sync a single list (with its units) to the server. Fire-and-forget. */
export function syncListToServer(listId: string): void {
  void (async () => {
    try {
      const list = await getList(listId)
      if (!list) return
      const units = await getListUnits(listId)
      await trpcClient.list.sync.mutate({
        id: list.id,
        faction: list.faction,
        name: list.name,
        description: list.description,
        detachment: list.detachment,
        battleSize: list.battleSize,
        totalPts: list.totalPts,
        units: units.map((u) => ({
          id: u.id,
          unitContentId: u.unitContentId,
          unitName: u.unitName,
          unitPoints: u.unitPoints,
          modelCount: u.modelCount,
          count: u.count,
        })),
      })
    } catch {
      // Fire-and-forget — don't block UI on server errors
    }
  })()
}

/** Sync all local lists to the server. Fire-and-forget. */
export function syncAllToServer(): void {
  void (async () => {
    try {
      const allLists = await getLists()
      const payload = []
      for (const list of allLists) {
        const units = await getListUnits(list.id)
        payload.push({
          id: list.id,
          faction: list.faction,
          name: list.name,
          description: list.description,
          detachment: list.detachment,
          battleSize: list.battleSize,
          totalPts: list.totalPts,
          units: units.map((u) => ({
            id: u.id,
            unitContentId: u.unitContentId,
            unitName: u.unitName,
            unitPoints: u.unitPoints,
            modelCount: u.modelCount,
            count: u.count,
          })),
        })
      }
      if (payload.length > 0) {
        await trpcClient.list.syncAll.mutate({ lists: payload })
      }
    } catch {
      // Fire-and-forget
    }
  })()
}

/** Delete a list from the server. Fire-and-forget. */
export function deleteListFromServer(listId: string): void {
  void (async () => {
    try {
      await trpcClient.list.delete.mutate({ id: listId })
    } catch {
      // Fire-and-forget
    }
  })()
}

/** Restore all lists from server into IndexedDB. Returns count of lists restored. */
export async function restoreFromServer(): Promise<number> {
  const serverLists = await trpcClient.list.getAll.query()
  let count = 0

  for (const serverList of serverLists) {
    const now = Date.now()
    await createListInDb({
      id: serverList.id,
      faction: serverList.faction,
      name: serverList.name,
      description: serverList.description ?? undefined,
      detachment: serverList.detachment ?? undefined,
      battleSize: serverList.battleSize ?? undefined,
      totalPts: serverList.totalPts,
      createdAt: now,
      updatedAt: now,
    })

    for (const unit of serverList.units) {
      await addListUnitInDb({
        id: unit.id,
        listId: serverList.id,
        unitContentId: unit.unitContentId,
        unitName: unit.unitName,
        unitPoints: unit.unitPoints,
        modelCount: unit.modelCount ?? undefined,
        count: unit.count,
      })
    }
    count++
  }

  return count
}
