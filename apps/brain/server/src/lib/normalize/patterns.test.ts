import { describe, it, expect } from 'vitest'
import {
  isSectionHeading,
  isPageReference,
  isStratagemBlock,
  findSentenceBoundaries,
  splitAtHeadings,
} from './patterns'

describe('isSectionHeading', () => {
  it('detects ALL CAPS section headers', () => {
    expect(isSectionHeading('SHOOTING PHASE')).toBe(true)
    expect(isSectionHeading('CORE CONCEPTS')).toBe(true)
    expect(isSectionHeading('COMMAND PHASE')).toBe(true)
  })

  it('rejects mixed case', () => {
    expect(isSectionHeading('Shooting Phase')).toBe(false)
  })

  it('rejects single ALL-CAPS words (keywords, not headings)', () => {
    expect(isSectionHeading('INFANTRY')).toBe(false)
    expect(isSectionHeading('CHARACTER')).toBe(false)
  })

  it('accepts 2+ word ALL CAPS phrases', () => {
    expect(isSectionHeading('WOUND ROLL')).toBe(true)
    expect(isSectionHeading('DETERMINING VISIBILITY')).toBe(true)
  })

  it('handles numbers in headings', () => {
    expect(isSectionHeading('1 COMMAND PHASE')).toBe(true)
    expect(isSectionHeading('2 MOVEMENT PHASE')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isSectionHeading('')).toBe(false)
  })

  it('handles headings with trailing spaces', () => {
    expect(isSectionHeading('  SHOOTING PHASE  ')).toBe(true)
  })
})

describe('isPageReference', () => {
  it('detects page references like (PG 5-9)', () => {
    expect(isPageReference('(PG 5-9)')).toBe(true)
    expect(isPageReference('(PG 10-36)')).toBe(true)
  })

  it('detects single page refs', () => {
    expect(isPageReference('(PG 5)')).toBe(true)
  })

  it('rejects non-page-refs', () => {
    expect(isPageReference('(see below)')).toBe(false)
  })

  it('rejects partial matches', () => {
    expect(isPageReference('PG 5-9')).toBe(false)
  })
})

describe('isStratagemBlock', () => {
  it('detects WHEN/TARGET/EFFECT pattern', () => {
    expect(isStratagemBlock('WHEN: In your Shooting phase')).toBe(true)
    expect(isStratagemBlock('TARGET: One unit from your army')).toBe(true)
    expect(isStratagemBlock('EFFECT: Until the end of the phase')).toBe(true)
  })

  it('detects COST prefix', () => {
    expect(isStratagemBlock('COST: 1CP')).toBe(true)
  })

  it('rejects normal text', () => {
    expect(isStratagemBlock('When you roll dice')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isStratagemBlock('')).toBe(false)
  })
})

describe('findSentenceBoundaries', () => {
  it('finds period-space boundaries', () => {
    const text = 'First sentence. Second sentence. Third.'
    const boundaries = findSentenceBoundaries(text)
    expect(boundaries.length).toBe(2)
  })

  it('does not split on abbreviations like e.g.', () => {
    const text = 'Use this ability e.g. in your Shooting phase. Next sentence.'
    const boundaries = findSentenceBoundaries(text)
    expect(boundaries.length).toBe(1)
  })

  it('does not split on page numbers like p.10', () => {
    const text = 'See Core Rules p.10 for details. Next section.'
    const boundaries = findSentenceBoundaries(text)
    expect(boundaries.length).toBe(1)
  })

  it('handles empty string', () => {
    const boundaries = findSentenceBoundaries('')
    expect(boundaries).toEqual([])
  })

  it('handles single sentence', () => {
    const boundaries = findSentenceBoundaries('Just one sentence.')
    expect(boundaries).toEqual([])
  })
})

describe('splitAtHeadings', () => {
  it('splits text into sections at ALL-CAPS headings', () => {
    const text = 'intro text SHOOTING PHASE Rules about shooting CHARGE PHASE Rules about charging'
    const sections = splitAtHeadings(text)
    expect(sections.length).toBeGreaterThanOrEqual(2)
    expect(sections.some(s => s.heading.includes('SHOOTING PHASE'))).toBe(true)
    expect(sections.some(s => s.heading.includes('CHARGE PHASE'))).toBe(true)
  })

  it('preserves body text between headings', () => {
    const text = 'WOUND ROLL When making a wound roll, compare the attacking weapon\u2019s Strength. SAVING THROW The target unit takes saves.'
    const sections = splitAtHeadings(text)
    const woundRoll = sections.find(s => s.heading.includes('WOUND ROLL'))
    expect(woundRoll).toBeTruthy()
    expect(woundRoll!.body).toContain('When making a wound roll')
  })

  it('handles empty string', () => {
    const sections = splitAtHeadings('')
    expect(sections).toEqual([])
  })

  it('handles text with no headings', () => {
    const sections = splitAtHeadings('just some regular text with no caps headings')
    expect(sections).toEqual([])
  })
})
