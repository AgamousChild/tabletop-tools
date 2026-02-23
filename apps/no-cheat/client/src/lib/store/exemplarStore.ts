/**
 * IndexedDB store for die face cluster exemplars.
 *
 * Keyed by dice_set_id. One ClusterSet per dice set. Exemplars never leave
 * the device — they are not synced to the server.
 *
 * If the user clears browser storage, they re-label in ~1 minute (clustering
 * rebuilds naturally as they roll; labeling is quick once 6 clusters appear).
 */

import type { Cluster } from '../cv/cluster'

export interface ClusterSet {
  clusters: Cluster[]
  updatedAt: number
}

const DB_NAME = 'nocheat-exemplars'
const STORE_NAME = 'clusterSets'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Load the cluster set for a given dice set, or null if none exists. */
export async function getClusterSet(diceSetId: string): Promise<ClusterSet | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(diceSetId)
    req.onsuccess = () => resolve((req.result as ClusterSet | undefined) ?? null)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

/** Save (or overwrite) the cluster set for a given dice set. */
export async function saveClusterSet(diceSetId: string, clusterSet: ClusterSet): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(clusterSet, diceSetId)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

/** Delete the cluster set for a given dice set (e.g. when re-calibrating). */
export async function clearClusterSet(diceSetId: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).delete(diceSetId)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}
