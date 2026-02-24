import type { UnitProfile } from '@tabletop-tools/game-content'

const DB_NAME = 'tabletop-tools-game-data'
const DB_VERSION = 1
const UNITS_STORE = 'units'
const META_STORE = 'meta'

export interface ImportMeta {
  lastImport: number
  factions: string[]
  totalUnits: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(UNITS_STORE)) {
        const store = db.createObjectStore(UNITS_STORE, { keyPath: 'id' })
        store.createIndex('faction', 'faction', { unique: false })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveUnits(units: UnitProfile[]): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNITS_STORE, 'readwrite')
    const store = tx.objectStore(UNITS_STORE)
    for (const unit of units) {
      store.put(unit)
    }
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function getUnit(id: string): Promise<UnitProfile | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNITS_STORE, 'readonly')
    const req = tx.objectStore(UNITS_STORE).get(id)
    req.onsuccess = () => resolve((req.result as UnitProfile | undefined) ?? null)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function searchUnits(query: { faction?: string; name?: string }): Promise<UnitProfile[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNITS_STORE, 'readonly')
    const store = tx.objectStore(UNITS_STORE)
    const results: UnitProfile[] = []

    let source: IDBRequest
    if (query.faction) {
      const index = store.index('faction')
      source = index.openCursor(IDBKeyRange.only(query.faction))
    } else {
      source = store.openCursor()
    }

    source.onsuccess = () => {
      const cursor = source.result as IDBCursorWithValue | null
      if (cursor) {
        const unit = cursor.value as UnitProfile
        if (!query.name || unit.name.toLowerCase().includes(query.name.toLowerCase())) {
          results.push(unit)
        }
        cursor.continue()
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve(results)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function listFactions(): Promise<string[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNITS_STORE, 'readonly')
    const index = tx.objectStore(UNITS_STORE).index('faction')
    const req = index.openKeyCursor(null, 'nextunique')
    const factions: string[] = []

    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        factions.push(cursor.key as string)
        cursor.continue()
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve(factions)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function clearFaction(faction: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNITS_STORE, 'readwrite')
    const store = tx.objectStore(UNITS_STORE)
    const index = store.index('faction')
    const req = index.openCursor(IDBKeyRange.only(faction))

    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function clearAll(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([UNITS_STORE, META_STORE], 'readwrite')
    tx.objectStore(UNITS_STORE).clear()
    tx.objectStore(META_STORE).clear()
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function getImportMeta(): Promise<ImportMeta | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly')
    const req = tx.objectStore(META_STORE).get('importMeta')
    req.onsuccess = () => resolve((req.result as ImportMeta | undefined) ?? null)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function setImportMeta(meta: ImportMeta): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite')
    tx.objectStore(META_STORE).put(meta, 'importMeta')
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}
