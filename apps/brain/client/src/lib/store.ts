// Brain knowledge graph IndexedDB store
// Separate database from game-data-store to decouple schema lifecycles.

const DB_NAME = 'tabletop-tools-brain'
const DB_VERSION = 1
const NODES_STORE = 'nodes'
const REFS_STORE = 'refs'
const META_STORE = 'meta'

// ── Types ───────────────────────────────────────────────────────────────────

export interface BrainNode {
  id: string
  layer: string
  category: string
  title: string
  content: string
  summary: string
  phase?: string
  factionId?: string
  detachmentId?: string
  datasheetId?: string
  sources: Array<{
    type: string
    title: string
    url?: string
    page?: number
    section?: string
    timestamp?: string
    retrievedAt: string
  }>
  refs: Array<{
    targetId: string
    rel: string
    context: string
    bidirectional?: boolean
  }>
  effectiveDate?: string
  supersededBy?: string
  version: number
  keywords: string[]
}

export interface StoredRef {
  sourceId: string
  targetId: string
  rel: string
  context: string
  bidirectional?: boolean
}

export interface BrainMeta {
  lastSync: number
  fileHashes: Record<string, string>
}

// ── Database ────────────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(NODES_STORE)) {
        const nodeStore = db.createObjectStore(NODES_STORE, { keyPath: 'id' })
        nodeStore.createIndex('layer', 'layer', { unique: false })
        nodeStore.createIndex('category', 'category', { unique: false })
        nodeStore.createIndex('factionId', 'factionId', { unique: false })
        nodeStore.createIndex('phase', 'phase', { unique: false })
      }

      if (!db.objectStoreNames.contains(REFS_STORE)) {
        const refStore = db.createObjectStore(REFS_STORE, { autoIncrement: true })
        refStore.createIndex('sourceId', 'sourceId', { unique: false })
        refStore.createIndex('targetId', 'targetId', { unique: false })
        refStore.createIndex('rel', 'rel', { unique: false })
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ── Node operations ─────────────────────────────────────────────────────────

export async function saveNodes(nodes: BrainNode[]): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(NODES_STORE, 'readwrite')
  const store = tx.objectStore(NODES_STORE)
  for (const node of nodes) {
    store.put(node)
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getNode(id: string): Promise<BrainNode | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NODES_STORE, 'readonly')
    const request = tx.objectStore(NODES_STORE).get(id)
    request.onsuccess = () => { db.close(); resolve(request.result ?? null) }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

export async function searchNodes(query: string): Promise<BrainNode[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NODES_STORE, 'readonly')
    const store = tx.objectStore(NODES_STORE)
    const request = store.getAll()
    request.onsuccess = () => {
      db.close()
      const lower = query.toLowerCase()
      const results = (request.result as BrainNode[]).filter(n =>
        n.title.toLowerCase().includes(lower) ||
        n.keywords.some(k => k.includes(lower))
      )
      resolve(results)
    }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

export async function getNodesByLayer(layer: string): Promise<BrainNode[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NODES_STORE, 'readonly')
    const index = tx.objectStore(NODES_STORE).index('layer')
    const request = index.getAll(layer)
    request.onsuccess = () => { db.close(); resolve(request.result) }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

export async function getNodesByFaction(factionId: string): Promise<BrainNode[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NODES_STORE, 'readonly')
    const index = tx.objectStore(NODES_STORE).index('factionId')
    const request = index.getAll(factionId)
    request.onsuccess = () => { db.close(); resolve(request.result) }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

// ── Ref operations ──────────────────────────────────────────────────────────

export async function saveRefs(refs: StoredRef[]): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(REFS_STORE, 'readwrite')
  const store = tx.objectStore(REFS_STORE)
  for (const ref of refs) {
    store.add(ref)
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getRefsFrom(sourceId: string): Promise<StoredRef[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REFS_STORE, 'readonly')
    const index = tx.objectStore(REFS_STORE).index('sourceId')
    const request = index.getAll(sourceId)
    request.onsuccess = () => { db.close(); resolve(request.result) }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

export async function getRefsTo(targetId: string): Promise<StoredRef[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REFS_STORE, 'readonly')
    const index = tx.objectStore(REFS_STORE).index('targetId')
    const request = index.getAll(targetId)
    request.onsuccess = () => { db.close(); resolve(request.result) }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

// ── Meta operations ─────────────────────────────────────────────────────────

export async function setBrainMeta(meta: BrainMeta): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(META_STORE, 'readwrite')
  tx.objectStore(META_STORE).put({ key: 'sync', ...meta })
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getBrainMeta(): Promise<BrainMeta | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly')
    const request = tx.objectStore(META_STORE).get('sync')
    request.onsuccess = () => {
      db.close()
      if (request.result) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { key, ...meta } = request.result
        resolve(meta as BrainMeta)
      } else {
        resolve(null)
      }
    }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

// ── Clear ───────────────────────────────────────────────────────────────────

export async function clearBrainData(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([NODES_STORE, REFS_STORE, META_STORE], 'readwrite')
  tx.objectStore(NODES_STORE).clear()
  tx.objectStore(REFS_STORE).clear()
  tx.objectStore(META_STORE).clear()
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
