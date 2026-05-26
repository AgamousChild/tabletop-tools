import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  addExample,
  clearAll,
  clearExamples,
  deleteExample,
  getAllExamples,
  getExamples,
  getStats,
  type StoredExample,
  type TrainingStats,
  updateStats,
} from './trainingStore'

const DB_NAME = 'no-cheat-training'

function makeExample(overrides: Partial<Omit<StoredExample, 'id' | 'createdAt'>> = {}) {
  return {
    diceSetId: 'dice-set-1',
    label: 3 as number,
    features: [0.1, 0.2, 0.3, 0.4, 0.5],
    roiGray: new Uint8Array([10, 20, 30, 40]),
    roiWidth: 2,
    roiHeight: 2,
    ...overrides,
  }
}

function makeStats(overrides: Partial<TrainingStats> = {}): TrainingStats {
  return {
    diceSetId: 'dice-set-1',
    totalGuesses: 10,
    correctGuesses: 8,
    corrections: 2,
    lastTrainedAt: Date.now(),
    ...overrides,
  }
}

beforeEach(() => {
  indexedDB.deleteDatabase(DB_NAME)
})

describe('trainingStore', () => {
  describe('addExample', () => {
    it('stores an example and returns its id', async () => {
      const input = makeExample()
      const id = await addExample(input)

      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')

      const examples = await getExamples('dice-set-1')
      expect(examples).toHaveLength(1)
      expect(examples[0].id).toBe(id)
      expect(examples[0].diceSetId).toBe('dice-set-1')
      expect(examples[0].label).toBe(3)
      expect(examples[0].features).toEqual([0.1, 0.2, 0.3, 0.4, 0.5])
      expect(new Uint8Array(examples[0].roiGray)).toEqual(new Uint8Array([10, 20, 30, 40]))
      expect(examples[0].roiWidth).toBe(2)
      expect(examples[0].roiHeight).toBe(2)
      expect(examples[0].createdAt).toBeGreaterThan(0)
    })
  })

  describe('getExamples', () => {
    it('returns all examples for a diceSetId', async () => {
      await addExample(makeExample({ label: 1 }))
      await addExample(makeExample({ label: 2 }))
      await addExample(makeExample({ label: 5 }))
      // Different dice set
      await addExample(makeExample({ diceSetId: 'dice-set-2', label: 4 }))

      const examples = await getExamples('dice-set-1')
      expect(examples).toHaveLength(3)
      expect(examples.map((e) => e.label).sort()).toEqual([1, 2, 5])
    })

    it('returns empty array for unknown diceSetId', async () => {
      await addExample(makeExample())

      const examples = await getExamples('unknown-dice-set')
      expect(examples).toEqual([])
    })
  })

  describe('getAllExamples', () => {
    it('returns all examples across all dice sets', async () => {
      await addExample(makeExample({ diceSetId: 'dice-set-1', label: 1 }))
      await addExample(makeExample({ diceSetId: 'dice-set-2', label: 2 }))
      await addExample(makeExample({ diceSetId: 'dice-set-3', label: 3 }))

      const all = await getAllExamples()
      expect(all).toHaveLength(3)
      expect(all.map((e) => e.diceSetId).sort()).toEqual(['dice-set-1', 'dice-set-2', 'dice-set-3'])
    })
  })

  describe('deleteExample', () => {
    it('removes a specific example', async () => {
      const id1 = await addExample(makeExample({ label: 1 }))
      const id2 = await addExample(makeExample({ label: 2 }))

      await deleteExample(id1)

      const examples = await getExamples('dice-set-1')
      expect(examples).toHaveLength(1)
      expect(examples[0].id).toBe(id2)
    })
  })

  describe('clearExamples', () => {
    it('clears all examples for a diceSetId', async () => {
      await addExample(makeExample({ diceSetId: 'dice-set-1', label: 1 }))
      await addExample(makeExample({ diceSetId: 'dice-set-1', label: 2 }))
      await addExample(makeExample({ diceSetId: 'dice-set-2', label: 3 }))

      await clearExamples('dice-set-1')

      const set1 = await getExamples('dice-set-1')
      expect(set1).toEqual([])

      const set2 = await getExamples('dice-set-2')
      expect(set2).toHaveLength(1)
    })
  })

  describe('getStats', () => {
    it('returns stats for a diceSetId', async () => {
      const stats = makeStats()
      await updateStats(stats)

      const result = await getStats('dice-set-1')
      expect(result).not.toBeNull()
      expect(result!.diceSetId).toBe('dice-set-1')
      expect(result!.totalGuesses).toBe(10)
      expect(result!.correctGuesses).toBe(8)
      expect(result!.corrections).toBe(2)
    })

    it('returns null if no stats exist', async () => {
      const result = await getStats('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('updateStats', () => {
    it('creates stats if not existing', async () => {
      const stats = makeStats({ totalGuesses: 5, correctGuesses: 4, corrections: 1 })
      await updateStats(stats)

      const result = await getStats('dice-set-1')
      expect(result).not.toBeNull()
      expect(result!.totalGuesses).toBe(5)
      expect(result!.correctGuesses).toBe(4)
      expect(result!.corrections).toBe(1)
    })

    it('updates existing stats', async () => {
      await updateStats(makeStats({ totalGuesses: 5, correctGuesses: 4 }))
      await updateStats(makeStats({ totalGuesses: 15, correctGuesses: 12 }))

      const result = await getStats('dice-set-1')
      expect(result).not.toBeNull()
      expect(result!.totalGuesses).toBe(15)
      expect(result!.correctGuesses).toBe(12)
    })
  })

  describe('clearAll', () => {
    it('clears everything for a diceSetId (examples + stats)', async () => {
      await addExample(makeExample({ diceSetId: 'dice-set-1', label: 1 }))
      await addExample(makeExample({ diceSetId: 'dice-set-1', label: 2 }))
      await addExample(makeExample({ diceSetId: 'dice-set-2', label: 3 }))
      await updateStats(makeStats({ diceSetId: 'dice-set-1' }))
      await updateStats(makeStats({ diceSetId: 'dice-set-2' }))

      await clearAll('dice-set-1')

      // dice-set-1 should be fully cleared
      const examples1 = await getExamples('dice-set-1')
      expect(examples1).toEqual([])
      const stats1 = await getStats('dice-set-1')
      expect(stats1).toBeNull()

      // dice-set-2 should be untouched
      const examples2 = await getExamples('dice-set-2')
      expect(examples2).toHaveLength(1)
      const stats2 = await getStats('dice-set-2')
      expect(stats2).not.toBeNull()
    })
  })
})
