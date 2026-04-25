import { describe, it, expect } from 'vitest'
import { generateFormations } from './formations'
import { isCoherent } from './coherency'
import { DEFAULT_10E_RULES } from '../types'

const rules = DEFAULT_10E_RULES

describe('generateFormations', () => {
  describe('block formation', () => {
    it('generates a block formation for 5 models with correct count', () => {
      const formations = generateFormations(5, 32, rules)
      const block = formations.find((f) => f.type === 'block')
      expect(block).toBeDefined()
      expect(block!.positions).toHaveLength(5)
    })

    it('block formation for 5 models passes coherency check', () => {
      const formations = generateFormations(5, 32, rules)
      const block = formations.find((f) => f.type === 'block')!
      expect(isCoherent(block.positions, rules)).toBe(true)
    })

    it('generates a block formation for 10 models with correct count', () => {
      const formations = generateFormations(10, 32, rules)
      const block = formations.find((f) => f.type === 'block')
      expect(block).toBeDefined()
      expect(block!.positions).toHaveLength(10)
    })

    it('block formation for 10 models passes coherency check', () => {
      const formations = generateFormations(10, 32, rules)
      const block = formations.find((f) => f.type === 'block')!
      expect(isCoherent(block.positions, rules)).toBe(true)
    })
  })

  describe('line formation', () => {
    it('generates a line formation for 5 models', () => {
      const formations = generateFormations(5, 32, rules)
      const line = formations.find((f) => f.type === 'line')
      expect(line).toBeDefined()
      expect(line!.positions).toHaveLength(5)
    })

    it('line formation for 5 models passes coherency check', () => {
      const formations = generateFormations(5, 32, rules)
      const line = formations.find((f) => f.type === 'line')!
      expect(isCoherent(line.positions, rules)).toBe(true)
    })

    it('does NOT generate a line formation for 10 models (too many for single file)', () => {
      const formations = generateFormations(10, 32, rules)
      const line = formations.find((f) => f.type === 'line')
      expect(line).toBeUndefined()
    })
  })

  describe('wide-line formation', () => {
    it('generates a wide-line formation for 5 models', () => {
      const formations = generateFormations(5, 32, rules)
      const wideLine = formations.find((f) => f.type === 'wide-line')
      expect(wideLine).toBeDefined()
      expect(wideLine!.positions).toHaveLength(5)
    })

    it('generates a wide-line formation for 10 models', () => {
      const formations = generateFormations(10, 32, rules)
      const wideLine = formations.find((f) => f.type === 'wide-line')
      expect(wideLine).toBeDefined()
      expect(wideLine!.positions).toHaveLength(10)
    })

    it('wide-line formation for 10 models passes coherency check', () => {
      const formations = generateFormations(10, 32, rules)
      const wideLine = formations.find((f) => f.type === 'wide-line')!
      expect(isCoherent(wideLine.positions, rules)).toBe(true)
    })
  })

  describe('dog-bone formation', () => {
    it('generates a dog-bone formation for 10 models', () => {
      const formations = generateFormations(10, 32, rules)
      const dogBone = formations.find((f) => f.type === 'dog-bone')
      expect(dogBone).toBeDefined()
      expect(dogBone!.positions).toHaveLength(10)
    })

    it('dog-bone formation for 10 models passes coherency check', () => {
      const formations = generateFormations(10, 32, rules)
      const dogBone = formations.find((f) => f.type === 'dog-bone')!
      expect(isCoherent(dogBone.positions, rules)).toBe(true)
    })

    it('does NOT generate dog-bone for 5 models (only for large units)', () => {
      const formations = generateFormations(5, 32, rules)
      const dogBone = formations.find((f) => f.type === 'dog-bone')
      expect(dogBone).toBeUndefined()
    })
  })

  describe('blob formation', () => {
    it('generates a blob formation for 5 models', () => {
      const formations = generateFormations(5, 32, rules)
      const blob = formations.find((f) => f.type === 'blob')
      expect(blob).toBeDefined()
      expect(blob!.positions).toHaveLength(5)
    })

    it('blob formation for 5 models passes coherency check', () => {
      const formations = generateFormations(5, 32, rules)
      const blob = formations.find((f) => f.type === 'blob')!
      expect(isCoherent(blob.positions, rules)).toBe(true)
    })

    it('generates a blob formation for 10 models', () => {
      const formations = generateFormations(10, 32, rules)
      const blob = formations.find((f) => f.type === 'blob')
      expect(blob).toBeDefined()
      expect(blob!.positions).toHaveLength(10)
    })

    it('blob formation for 10 models passes coherency check', () => {
      const formations = generateFormations(10, 32, rules)
      const blob = formations.find((f) => f.type === 'blob')!
      expect(isCoherent(blob.positions, rules)).toBe(true)
    })
  })

  describe('all formations pass coherency', () => {
    it('all formations for 5 models are coherent', () => {
      const formations = generateFormations(5, 32, rules)
      expect(formations.length).toBeGreaterThan(0)
      for (const f of formations) {
        expect(isCoherent(f.positions, rules), `${f.type} failed coherency`).toBe(true)
      }
    })

    it('all formations for 10 models are coherent', () => {
      const formations = generateFormations(10, 32, rules)
      expect(formations.length).toBeGreaterThan(0)
      for (const f of formations) {
        expect(isCoherent(f.positions, rules), `${f.type} failed coherency`).toBe(true)
      }
    })

    it('all formations for 1 model are coherent', () => {
      const formations = generateFormations(1, 32, rules)
      expect(formations.length).toBeGreaterThan(0)
      for (const f of formations) {
        expect(isCoherent(f.positions, rules), `${f.type} failed coherency`).toBe(true)
      }
    })

    it('all formations for 20 models are coherent', () => {
      const formations = generateFormations(20, 32, rules)
      expect(formations.length).toBeGreaterThan(0)
      for (const f of formations) {
        expect(isCoherent(f.positions, rules), `${f.type} failed coherency`).toBe(true)
      }
    })
  })

  describe('positions are relative to origin', () => {
    it('block formation is centered around (0,0)', () => {
      const formations = generateFormations(4, 32, rules)
      const block = formations.find((f) => f.type === 'block')!
      const xs = block.positions.map((p) => p.x)
      const ys = block.positions.map((p) => p.y)
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
      const centerY = (Math.min(...ys) + Math.max(...ys)) / 2
      expect(centerX).toBeCloseTo(0, 5)
      expect(centerY).toBeCloseTo(0, 5)
    })
  })
})
