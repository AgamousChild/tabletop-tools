import { beforeEach, describe, expect, it } from 'vitest'

import {
  type EntityMap,
  getEntityIndex,
  linkEntitiesInContent,
  resetEntityCache,
} from './entity-linker'

describe('linkEntitiesInContent', () => {
  it('links known entity names in text', () => {
    const text = 'This model has the Sustained Hits ability and Lethal Hits.'
    const entityMap: EntityMap = new Map([
      ['sustained hits', { nodeId: 'core:sustained-hits', title: 'Sustained Hits' }],
      ['lethal hits', { nodeId: 'core:lethal-hits', title: 'Lethal Hits' }],
    ])
    const result = linkEntitiesInContent(text, entityMap)
    expect(result).toContain('[Sustained Hits](brain:core:sustained-hits)')
    expect(result).toContain('[Lethal Hits](brain:core:lethal-hits)')
  })

  it('only links first occurrence of each entity', () => {
    const text = 'Sustained Hits applies to attacks with Sustained Hits.'
    const entityMap: EntityMap = new Map([
      ['sustained hits', { nodeId: 'core:sustained-hits', title: 'Sustained Hits' }],
    ])
    const result = linkEntitiesInContent(text, entityMap)
    const linkCount = (result.match(/\[Sustained Hits\]/g) || []).length
    expect(linkCount).toBe(1)
  })

  it('does not double-link existing brain: links', () => {
    const text = 'Already [Sustained Hits](brain:core:sustained-hits) linked.'
    const entityMap: EntityMap = new Map([
      ['sustained hits', { nodeId: 'core:sustained-hits', title: 'Sustained Hits' }],
    ])
    const result = linkEntitiesInContent(text, entityMap)
    const linkCount = (result.match(/brain:core:sustained-hits/g) || []).length
    expect(linkCount).toBe(1)
  })

  it('matches longest entity first (greedy)', () => {
    const entityMap: EntityMap = new Map([
      ['hits', { nodeId: 'core:hits', title: 'Hits' }],
      ['sustained hits', { nodeId: 'core:sustained-hits', title: 'Sustained Hits' }],
    ])
    const text = 'This weapon has Sustained Hits.'
    const result = linkEntitiesInContent(text, entityMap)
    expect(result).toContain('[Sustained Hits](brain:core:sustained-hits)')
    expect(result).not.toContain('[Hits](brain:core:hits)')
  })

  // Regression for the "Captain in Terminator Armour" bug: shorter "Captain"
  // datasheet was winning over the longer "Captain In Terminator Armour" entry.
  // Map insertion order puts the shorter title first — the matcher must still
  // pick the longer title because its title length is greater.
  it('longest title wins even when shorter title was inserted first', () => {
    const entityMap: EntityMap = new Map([
      ['captain', { nodeId: '000000073', title: 'Captain' }],
      [
        'captain in terminator armour',
        { nodeId: '000000135', title: 'Captain In Terminator Armour' },
      ],
    ])
    const text = 'Bring a Captain in Terminator Armour for the bodyguard rule.'
    const result = linkEntitiesInContent(text, entityMap)
    expect(result).toContain('[Captain in Terminator Armour](brain:000000135)')
    // Critical: the shorter "Captain" datasheet must not also be emitted as a
    // nested link inside the longer span.
    expect(result).not.toContain('[Captain](brain:000000073)')
    expect(result).not.toContain('brain:000000073')
  })

  it('does not re-link a substring inside a longer match', () => {
    // Both "Land Raider" and "Land Raider Crusader" exist; the longer one wins.
    const entityMap: EntityMap = new Map([
      ['land raider', { nodeId: 'lr', title: 'Land Raider' }],
      ['land raider crusader', { nodeId: 'lrc', title: 'Land Raider Crusader' }],
    ])
    const text = 'Bring a Land Raider Crusader.'
    const result = linkEntitiesInContent(text, entityMap)
    expect(result).toContain('[Land Raider Crusader](brain:lrc)')
    expect(result).not.toContain('brain:lr)')
    // No nested brackets — output must be a clean single link, not [[Land Raider](brain:lr) Crusader](...).
    expect(result).not.toMatch(/\[\[/)
  })

  it('returns text unchanged when entityMap is empty', () => {
    const text = 'No entities here.'
    const result = linkEntitiesInContent(text, new Map())
    expect(result).toBe(text)
  })
})

describe('getEntityIndex', () => {
  beforeEach(() => {
    resetEntityCache()
  })

  it('builds entity map from R2 node data', async () => {
    const mockBucket = {
      get: async (key: string) => {
        if (key === 'manifest.json') {
          return { json: async () => ({ files: { 'nodes/core.json': 'hash' } }) }
        }
        if (key === 'nodes/core.json') {
          return {
            json: async () => [
              { id: 'ds:intercessors', category: 'datasheet', title: 'Intercessors' },
              { id: 'weapon:bolt', category: 'weapon', title: 'Bolt Rifle' },
            ],
          }
        }
        return null
      },
    }
    const index = await getEntityIndex(mockBucket)
    expect(index.has('intercessors')).toBe(true)
    expect(index.has('bolt rifle')).toBe(false) // weapons not indexed
  })

  it('returns empty map when manifest is missing', async () => {
    const mockBucket = {
      get: async (_key: string) => null,
    }
    const index = await getEntityIndex(mockBucket)
    expect(index.size).toBe(0)
  })

  it('caches the result across calls', async () => {
    let callCount = 0
    const mockBucket = {
      get: async (key: string) => {
        callCount++
        if (key === 'manifest.json') {
          return { json: async () => ({ files: {} }) }
        }
        return null
      },
    }
    await getEntityIndex(mockBucket)
    await getEntityIndex(mockBucket)
    // manifest.json fetched only once despite two calls
    expect(callCount).toBe(1)
  })

  it('indexes stratagems, detachment rules, enhancements, and faction abilities', async () => {
    const mockBucket = {
      get: async (key: string) => {
        if (key === 'manifest.json') {
          return { json: async () => ({ files: { 'nodes/test.json': 'hash' } }) }
        }
        if (key === 'nodes/test.json') {
          return {
            json: async () => [
              { id: 'strat:1', category: 'stratagem', title: 'Rapid Ingress' },
              { id: 'det:1', category: 'detachment-rule', title: 'Storm of Fire' },
              { id: 'enh:1', category: 'enhancement', title: 'Sanctic Halo' },
              { id: 'fa:1', category: 'faction-ability', title: 'Angels of Death' },
              { id: 'core:1', category: 'core-rule', title: 'Core Rule' }, // not indexed
            ],
          }
        }
        return null
      },
    }
    const index = await getEntityIndex(mockBucket)
    expect(index.has('rapid ingress')).toBe(true)
    expect(index.has('storm of fire')).toBe(true)
    expect(index.has('sanctic halo')).toBe(true)
    expect(index.has('angels of death')).toBe(true)
    expect(index.has('core rule')).toBe(false) // core-rule not indexed
  })
})
