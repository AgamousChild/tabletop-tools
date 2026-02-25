import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SyncMetadata } from './types'

const DEFAULT_METADATA: SyncMetadata = {
  lastUpdate: null,
  lastSyncedAt: null,
  csvFiles: {},
}

export function loadMetadata(path: string): SyncMetadata {
  if (!existsSync(path)) return { ...DEFAULT_METADATA, csvFiles: {} }
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as SyncMetadata
  } catch {
    return { ...DEFAULT_METADATA, csvFiles: {} }
  }
}

export function saveMetadata(path: string, metadata: SyncMetadata): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(metadata, null, 2), 'utf-8')
}

export function hasChanged(
  stored: SyncMetadata,
  remoteLastUpdate: string,
): boolean {
  return stored.lastUpdate !== remoteLastUpdate
}
