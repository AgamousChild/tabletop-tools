import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearClusterSet, getClusterSet, saveClusterSet } from './exemplarStore'
import type { ClusterSet } from './exemplarStore'
import { IDBFactory } from 'fake-indexeddb'

// Reset IndexedDB between tests so each test starts clean
beforeEach(() => {
  // Replace globalThis.indexedDB with a fresh fake instance
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  // No cleanup needed — fresh instance is set in beforeEach
})

const fakeClusterSet: ClusterSet = {
  clusters: [
    {
      id: 'c1',
      pipValue: 6,
      exemplars: [new Uint8Array(64 * 64).fill(200)],
      updatedAt: 1_700_000_000_000,
    },
    {
      id: 'c2',
      pipValue: null,
      exemplars: [new Uint8Array(64 * 64).fill(50)],
      updatedAt: 1_700_000_001_000,
    },
  ],
  updatedAt: 1_700_000_002_000,
}

describe('exemplarStore', () => {
  it('returns null when no cluster set exists for a dice set', async () => {
    const result = await getClusterSet('set-1')
    expect(result).toBeNull()
  })

  it('saves and retrieves a cluster set', async () => {
    await saveClusterSet('set-1', fakeClusterSet)
    const result = await getClusterSet('set-1')
    expect(result).not.toBeNull()
    expect(result!.clusters).toHaveLength(2)
    expect(result!.clusters[0]!.id).toBe('c1')
    expect(result!.clusters[0]!.pipValue).toBe(6)
  })

  it('preserves Uint8Array exemplar data through save/retrieve', async () => {
    await saveClusterSet('set-1', fakeClusterSet)
    const result = await getClusterSet('set-1')
    const exemplar = result!.clusters[0]!.exemplars[0]!
    // ArrayBuffer.isView works across realm boundaries (fake-indexeddb structured clone)
    expect(ArrayBuffer.isView(exemplar)).toBe(true)
    expect(exemplar[0]).toBe(200)
    expect(exemplar.length).toBe(64 * 64)
  })

  it('isolates cluster sets by dice set ID', async () => {
    const setA: ClusterSet = { clusters: [], updatedAt: 1 }
    const setB: ClusterSet = {
      clusters: [{ id: 'x', pipValue: 3, exemplars: [], updatedAt: 2 }],
      updatedAt: 2,
    }
    await saveClusterSet('set-A', setA)
    await saveClusterSet('set-B', setB)

    const a = await getClusterSet('set-A')
    const b = await getClusterSet('set-B')
    expect(a!.clusters).toHaveLength(0)
    expect(b!.clusters).toHaveLength(1)
  })

  it('overwrites a previous cluster set when saved again', async () => {
    await saveClusterSet('set-1', fakeClusterSet)

    const updated: ClusterSet = { clusters: [], updatedAt: 9999 }
    await saveClusterSet('set-1', updated)

    const result = await getClusterSet('set-1')
    expect(result!.clusters).toHaveLength(0)
    expect(result!.updatedAt).toBe(9999)
  })

  it('clears a cluster set', async () => {
    await saveClusterSet('set-1', fakeClusterSet)
    await clearClusterSet('set-1')
    const result = await getClusterSet('set-1')
    expect(result).toBeNull()
  })

  it('clearClusterSet is a no-op when nothing is stored', async () => {
    await expect(clearClusterSet('nonexistent')).resolves.not.toThrow()
  })
})
