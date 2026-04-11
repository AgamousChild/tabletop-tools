/// <reference types="vite/client" />

import { saveNodes, saveRefs, setBrainMeta, type BrainNode, type StoredRef } from './store'

export interface BrainManifest {
  version: number
  updatedAt: string
  files: Record<string, string>
}

export interface SyncProgress {
  current: number
  total: number
  currentFile: string
}

export interface SyncResult {
  nodeCount: number
  refCount: number
  errors: string[]
}

function getApiBase(): string {
  if (import.meta.env.VITE_BRAIN_API_URL) {
    return import.meta.env.VITE_BRAIN_API_URL
  }
  return `${window.location.origin}/brain/api`
}

export async function checkForBrainUpdates(currentVersion?: number): Promise<{
  available: boolean
  manifest: BrainManifest | null
}> {
  try {
    const resp = await fetch(`${getApiBase()}/manifest.json`)
    if (!resp.ok) return { available: false, manifest: null }
    const manifest: BrainManifest = await resp.json()
    const available = currentVersion == null || manifest.version > currentVersion
    return { available, manifest }
  } catch {
    return { available: false, manifest: null }
  }
}

async function fetchDataFile<T>(path: string): Promise<T> {
  const resp = await fetch(`${getApiBase()}/data/${path}`)
  if (!resp.ok) throw new Error(`Failed to fetch ${path}: HTTP ${resp.status}`)
  return resp.json()
}

export async function syncBrainData(
  manifest: BrainManifest,
  localHashes: Record<string, string>,
  onProgress: (progress: SyncProgress) => void,
): Promise<SyncResult> {
  const errors: string[] = []
  let nodeCount = 0
  let refCount = 0

  // Filter to only files that changed
  const filesToSync = Object.entries(manifest.files)
    .filter(([name, hash]) => localHashes[name] !== hash)
    .map(([name]) => name)

  const total = filesToSync.length

  for (let i = 0; i < filesToSync.length; i++) {
    const file = filesToSync[i]!
    onProgress({ current: i + 1, total, currentFile: file })

    try {
      if (file.startsWith('nodes/')) {
        const data = await fetchDataFile<BrainNode[]>(file)
        await saveNodes(data)
        nodeCount += data.length
      } else if (file.startsWith('refs/')) {
        const data = await fetchDataFile<StoredRef[]>(file)
        await saveRefs(data)
        refCount += data.length
      }
    } catch (err) {
      errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Update local metadata
  await setBrainMeta({
    lastSync: Date.now(),
    fileHashes: manifest.files,
  })

  return { nodeCount, refCount, errors }
}
