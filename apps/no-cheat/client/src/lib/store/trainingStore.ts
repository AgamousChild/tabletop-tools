// ── Types ────────────────────────────────────────────────────────────────────

export interface StoredExample {
  id: string
  diceSetId: string
  label: number // 1-6
  features: number[]
  roiGray: Uint8Array
  roiWidth: number
  roiHeight: number
  createdAt: number // timestamp
}

export interface TrainingStats {
  diceSetId: string
  totalGuesses: number
  correctGuesses: number
  corrections: number
  lastTrainedAt: number
}

// ── Database ─────────────────────────────────────────────────────────────────

const DB_NAME = 'no-cheat-training'
const DB_VERSION = 1
const EXAMPLES_STORE = 'examples'
const STATS_STORE = 'stats'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(EXAMPLES_STORE)) {
        const store = db.createObjectStore(EXAMPLES_STORE, { keyPath: 'id' })
        store.createIndex('diceSetId', 'diceSetId', { unique: false })
      }
      if (!db.objectStoreNames.contains(STATS_STORE)) {
        db.createObjectStore(STATS_STORE, { keyPath: 'diceSetId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── Examples CRUD ────────────────────────────────────────────────────────────

export async function addExample(
  example: Omit<StoredExample, 'id' | 'createdAt'>,
): Promise<string> {
  const id = crypto.randomUUID()
  const record: StoredExample = {
    ...example,
    id,
    createdAt: Date.now(),
  }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXAMPLES_STORE, 'readwrite')
    tx.objectStore(EXAMPLES_STORE).put(record)
    tx.oncomplete = () => {
      db.close()
      resolve(id)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function getExamples(diceSetId: string): Promise<StoredExample[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXAMPLES_STORE, 'readonly')
    const index = tx.objectStore(EXAMPLES_STORE).index('diceSetId')
    const req = index.getAll(IDBKeyRange.only(diceSetId))
    req.onsuccess = () => resolve(req.result as StoredExample[])
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function getAllExamples(): Promise<StoredExample[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXAMPLES_STORE, 'readonly')
    const req = tx.objectStore(EXAMPLES_STORE).getAll()
    req.onsuccess = () => resolve(req.result as StoredExample[])
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function deleteExample(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXAMPLES_STORE, 'readwrite')
    tx.objectStore(EXAMPLES_STORE).delete(id)
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

export async function clearExamples(diceSetId: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXAMPLES_STORE, 'readwrite')
    const index = tx.objectStore(EXAMPLES_STORE).index('diceSetId')
    const cursorReq = index.openCursor(IDBKeyRange.only(diceSetId))
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result as IDBCursorWithValue | null
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

// ── Stats CRUD ───────────────────────────────────────────────────────────────

export async function getStats(diceSetId: string): Promise<TrainingStats | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STATS_STORE, 'readonly')
    const req = tx.objectStore(STATS_STORE).get(diceSetId)
    req.onsuccess = () => resolve((req.result as TrainingStats | undefined) ?? null)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function updateStats(stats: TrainingStats): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STATS_STORE, 'readwrite')
    tx.objectStore(STATS_STORE).put(stats)
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

// ── Clear All (per dice set) ─────────────────────────────────────────────────

export async function clearAll(diceSetId: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([EXAMPLES_STORE, STATS_STORE], 'readwrite')

    // Delete all examples for this dice set via cursor on the index
    const index = tx.objectStore(EXAMPLES_STORE).index('diceSetId')
    const cursorReq = index.openCursor(IDBKeyRange.only(diceSetId))
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result as IDBCursorWithValue | null
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }

    // Delete stats for this dice set
    tx.objectStore(STATS_STORE).delete(diceSetId)

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
