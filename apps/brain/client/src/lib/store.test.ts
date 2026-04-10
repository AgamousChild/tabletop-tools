import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveNodes, getNode, searchNodes, getNodesByLayer, getNodesByFaction,
  saveRefs, getRefsFrom, getRefsTo,
  getBrainMeta, setBrainMeta, clearBrainData,
  type BrainNode, type StoredRef,
} from './store'

const makeNode = (overrides: Partial<BrainNode> = {}): BrainNode => ({
  id: 'core:wound-roll',
  layer: 'core',
  category: 'core-mechanic',
  title: 'Wound Roll',
  content: 'Compare Strength to Toughness.',
  summary: 'How wound rolls work.',
  sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-04-08' }],
  refs: [],
  version: 1,
  keywords: ['wound', 'roll', 'strength', 'toughness'],
  ...overrides,
})

describe('brain store', () => {
  beforeEach(async () => {
    await clearBrainData()
  })

  describe('nodes', () => {
    it('saves and retrieves a node by id', async () => {
      const node = makeNode()
      await saveNodes([node])
      const retrieved = await getNode('core:wound-roll')
      expect(retrieved?.id).toBe('core:wound-roll')
      expect(retrieved?.title).toBe('Wound Roll')
    })

    it('returns null for missing node', async () => {
      const result = await getNode('nonexistent')
      expect(result).toBeNull()
    })

    it('saves multiple nodes in batch', async () => {
      await saveNodes([
        makeNode({ id: 'core:a', title: 'A' }),
        makeNode({ id: 'core:b', title: 'B' }),
        makeNode({ id: 'core:c', title: 'C' }),
      ])
      const a = await getNode('core:a')
      const c = await getNode('core:c')
      expect(a?.title).toBe('A')
      expect(c?.title).toBe('C')
    })

    it('searches nodes by keyword', async () => {
      await saveNodes([
        makeNode({ id: 'core:wound-roll', title: 'Wound Roll', keywords: ['wound'] }),
        makeNode({ id: 'core:hit-roll', title: 'Hit Roll', keywords: ['hit'] }),
      ])
      const results = await searchNodes('wound')
      expect(results).toHaveLength(1)
      expect(results[0]?.id).toBe('core:wound-roll')
    })

    it('searches by title substring', async () => {
      await saveNodes([
        makeNode({ id: 'core:wound-roll', title: 'Wound Roll', keywords: [] }),
      ])
      const results = await searchNodes('Wound')
      expect(results).toHaveLength(1)
    })

    it('filters nodes by layer', async () => {
      await saveNodes([
        makeNode({ id: 'core:test', layer: 'core' }),
        makeNode({ id: 'errata:test', layer: 'errata', category: 'faq' }),
      ])
      const coreNodes = await getNodesByLayer('core')
      expect(coreNodes).toHaveLength(1)
      expect(coreNodes[0]?.layer).toBe('core')
    })

    it('filters nodes by factionId', async () => {
      await saveNodes([
        makeNode({ id: 'faction:sm:oath', layer: 'faction', category: 'faction-ability', factionId: 'space-marines' }),
        makeNode({ id: 'faction:necrons:rean', layer: 'faction', category: 'faction-ability', factionId: 'necrons' }),
      ])
      const smNodes = await getNodesByFaction('space-marines')
      expect(smNodes).toHaveLength(1)
      expect(smNodes[0]?.factionId).toBe('space-marines')
    })

    it('overwrites existing node on re-save', async () => {
      await saveNodes([makeNode({ version: 1 })])
      await saveNodes([makeNode({ version: 2 })])
      const node = await getNode('core:wound-roll')
      expect(node?.version).toBe(2)
    })
  })

  describe('refs', () => {
    it('saves and retrieves refs by sourceId', async () => {
      const ref: StoredRef = {
        sourceId: 'core:shooting-phase',
        targetId: 'core:wound-roll',
        rel: 'part_of',
        context: 'Wound roll is part of the shooting sequence.',
      }
      await saveRefs([ref])
      const results = await getRefsFrom('core:shooting-phase')
      expect(results).toHaveLength(1)
      expect(results[0]?.targetId).toBe('core:wound-roll')
    })

    it('retrieves refs by targetId', async () => {
      const ref: StoredRef = {
        sourceId: 'core:shooting-phase',
        targetId: 'core:wound-roll',
        rel: 'part_of',
        context: 'Wound roll is part of the shooting sequence.',
      }
      await saveRefs([ref])
      const results = await getRefsTo('core:wound-roll')
      expect(results).toHaveLength(1)
      expect(results[0]?.sourceId).toBe('core:shooting-phase')
    })

    it('returns empty array when no refs exist', async () => {
      const results = await getRefsFrom('nonexistent')
      expect(results).toEqual([])
    })
  })

  describe('meta', () => {
    it('stores and retrieves sync metadata', async () => {
      await setBrainMeta({ lastSync: 1234567890, fileHashes: { 'core.json': 'abc' } })
      const meta = await getBrainMeta()
      expect(meta?.lastSync).toBe(1234567890)
      expect(meta?.fileHashes['core.json']).toBe('abc')
    })

    it('returns null when no meta exists', async () => {
      const meta = await getBrainMeta()
      expect(meta).toBeNull()
    })
  })

  describe('clearBrainData', () => {
    it('removes all data', async () => {
      await saveNodes([makeNode()])
      await saveRefs([{
        sourceId: 'core:a',
        targetId: 'core:b',
        rel: 'part_of',
        context: 'test',
      }])
      await setBrainMeta({ lastSync: 123, fileHashes: {} })

      await clearBrainData()

      const node = await getNode('core:wound-roll')
      expect(node).toBeNull()
      const meta = await getBrainMeta()
      expect(meta).toBeNull()
    })
  })
})
