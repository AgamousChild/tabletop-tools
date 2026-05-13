import { describe, it, expect, beforeEach } from 'vitest'
import { linkEntitiesInContent, getEntityIndex, resetEntityCache, type EntityMap } from './entity-linker'

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
            json: async () => ([
              { id: 'ds:intercessors', category: 'datasheet', title: 'Intercessors' },
              { id: 'weapon:bolt', category: 'weapon', title: 'Bolt Rifle' },
            ])
          }
        }
        return null
      }
    }
    const index = await getEntityIndex(mockBucket)
    expect(index.has('intercessors')).toBe(true)
    expect(index.has('bolt rifle')).toBe(false) // weapons not indexed
  })

  it('returns empty map when manifest is missing', async () => {
    const mockBucket = {
      get: async (_key: string) => null
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
      }
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
            json: async () => ([
              { id: 'strat:1', category: 'stratagem', title: 'Rapid Ingress' },
              { id: 'det:1', category: 'detachment-rule', title: 'Storm of Fire' },
              { id: 'enh:1', category: 'enhancement', title: 'Sanctic Halo' },
              { id: 'fa:1', category: 'faction-ability', title: 'Angels of Death' },
              { id: 'core:1', category: 'core-rule', title: 'Core Rule' }, // not indexed
            ])
          }
        }
        return null
      }
    }
    const index = await getEntityIndex(mockBucket)
    expect(index.has('rapid ingress')).toBe(true)
    expect(index.has('storm of fire')).toBe(true)
    expect(index.has('sanctic halo')).toBe(true)
    expect(index.has('angels of death')).toBe(true)
    expect(index.has('core rule')).toBe(false) // core-rule not indexed
  })
})
