import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useConnectedNodes, useNode, useNodeRefs, useNodesByLayer, useNodeSearch } from './hooks'
import { type BrainNode, clearBrainData, saveNodes, saveRefs } from './store'

const testNode: BrainNode = {
  id: 'core:wound-roll',
  layer: 'core',
  category: 'core-mechanic',
  title: 'Wound Roll',
  content: 'Compare Strength to Toughness.',
  summary: 'How wound rolls work.',
  sources: [{ type: 'pdf', title: 'Core Rules', retrievedAt: '2026-04-08' }],
  refs: [],
  version: 1,
  keywords: ['wound', 'roll'],
}

const relatedNode: BrainNode = {
  ...testNode,
  id: 'core:shooting-phase',
  title: 'Shooting Phase',
  keywords: ['shooting'],
}

describe('brain hooks', () => {
  beforeEach(async () => {
    await clearBrainData()
    await saveNodes([testNode, relatedNode])
  })

  describe('useNode', () => {
    it('loads a node by id', async () => {
      const { result } = renderHook(() => useNode('core:wound-roll'))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data?.id).toBe('core:wound-roll')
      expect(result.current.data?.title).toBe('Wound Roll')
    })

    it('returns null for missing id', async () => {
      const { result } = renderHook(() => useNode('nonexistent'))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toBeNull()
    })

    it('has no error on success', async () => {
      const { result } = renderHook(() => useNode('core:wound-roll'))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.error).toBeNull()
    })
  })

  describe('useNodesByLayer', () => {
    it('returns nodes filtered by layer', async () => {
      const { result } = renderHook(() => useNodesByLayer('core'))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data.length).toBe(2)
    })

    it('returns empty array for empty layer', async () => {
      const { result } = renderHook(() => useNodesByLayer('errata'))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toEqual([])
    })
  })

  describe('useNodeSearch', () => {
    it('searches by keyword', async () => {
      const { result } = renderHook(() => useNodeSearch('wound'))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toHaveLength(1)
      expect(result.current.data[0]?.id).toBe('core:wound-roll')
    })

    it('returns empty for no match', async () => {
      const { result } = renderHook(() => useNodeSearch('nonexistent'))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data).toHaveLength(0)
    })
  })

  describe('useNodeRefs', () => {
    it('returns from and to refs', async () => {
      await saveRefs([
        {
          sourceId: 'core:wound-roll',
          targetId: 'core:shooting-phase',
          rel: 'part_of',
          context: 'Wound roll is part of shooting.',
        },
      ])

      const { result } = renderHook(() => useNodeRefs('core:wound-roll'))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data.from.length).toBe(1)
    })
  })

  describe('useConnectedNodes', () => {
    it('returns nodes connected via refs', async () => {
      await saveRefs([
        {
          sourceId: 'core:wound-roll',
          targetId: 'core:shooting-phase',
          rel: 'part_of',
          context: 'Wound roll is part of shooting.',
        },
      ])

      const { result } = renderHook(() => useConnectedNodes('core:wound-roll'))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.data.length).toBe(1)
      expect(result.current.data[0]?.id).toBe('core:shooting-phase')
    })
  })
})
