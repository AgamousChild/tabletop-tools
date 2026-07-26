import { describe, expect, test } from 'vitest'

import type { CountResult } from './count'
import { parseCountQueryFromQuestion, renderCubeContext } from './count-parser'

describe('parseCountQueryFromQuestion', () => {
  test('returns null for non-count-shape questions', () => {
    expect(parseCountQueryFromQuestion('what is oath of moment?', [], '11th')).toBeNull()
    expect(parseCountQueryFromQuestion('who has sustained hits?', [], '11th')).toBeNull()
  })

  test('classic "how many X" — detachments for a detected faction', () => {
    const q = parseCountQueryFromQuestion(
      'how many detachment combos do dark angels have access to?',
      ['dark-angels', 'space-marines'],
      '11th',
    )
    expect(q).toEqual({
      category: 'detachment',
      edition: '11th',
      faction: 'dark-angels',
      keyword: undefined,
      group: undefined,
    })
  })

  test('table shape with "every faction" triggers group=faction', () => {
    const q = parseCountQueryFromQuestion(
      'give me a table that lists every faction and their number of detachments',
      [],
      '11th',
    )
    expect(q).toEqual({
      category: 'detachment',
      edition: '11th',
      faction: undefined,
      keyword: undefined,
      group: 'faction',
    })
  })

  test('extracts sustained hits keyword filter', () => {
    const q = parseCountQueryFromQuestion(
      'how many units have sustained hits per faction',
      [],
      '11th',
    )
    expect(q).toEqual({
      category: 'datasheet',
      edition: '11th',
      faction: undefined,
      keyword: 'sustained hits',
      group: 'faction',
    })
  })

  test('character models → datasheet category', () => {
    const q = parseCountQueryFromQuestion(
      'how many character models does Orks have',
      ['orks'],
      '11th',
    )
    expect(q?.category).toBe('datasheet')
    expect(q?.faction).toBe('orks')
  })

  test('honours explicit edition token in question', () => {
    const q = parseCountQueryFromQuestion(
      'how many 10th edition detachments does Space Marines have',
      ['space-marines'],
      '11th', // ask-level default is 11th, but question overrides
    )
    expect(q?.edition).toBe('10th')
  })

  test('deep strike keyword survives across the family lookup', () => {
    const q = parseCountQueryFromQuestion(
      'how many units with deep strike does dark angels have',
      ['dark-angels'],
      '11th',
    )
    expect(q?.keyword).toBe('deep strike')
    expect(q?.category).toBe('datasheet')
    expect(q?.faction).toBe('dark-angels')
  })

  test('returns null when count-shape but no identifiable category', () => {
    // "how many things" — no category noun. Fall back to normal RAG.
    expect(parseCountQueryFromQuestion('how many things are there', [], '11th')).toBeNull()
  })
})

describe('renderCubeContext', () => {
  test('single-faction dpRollup renders the combo formula inline', () => {
    const r: CountResult = {
      count: 30,
      dpRollup: [
        {
          factionId: 'dark-angels',
          displayName: 'DARK ANGELS',
          isChapter: true,
          parentId: 'space-marines',
          dp1: 6,
          dp2: 18,
          dp3: 6,
          total: 30,
          combosStrikeForce: 134,
        },
      ],
      cubeVersion: 'v1',
    }
    const out = renderCubeContext(
      { category: 'detachment', faction: 'dark-angels', edition: '11th' },
      r,
    )
    expect(out).toContain('DARK ANGELS: 30 accessible 11e detachments')
    expect(out).toContain('Strike Force combos (3 DP budget, no repeats): 134')
    expect(out).toContain('C(6, 3)')
    expect(out).toContain('INSTRUCTION FOR THE ANSWERING MODEL')
  })

  test('multi-faction dpRollup renders a markdown table sorted by name', () => {
    const r: CountResult = {
      count: 4,
      dpRollup: [
        {
          factionId: 'orks',
          displayName: 'ORKS',
          isChapter: false,
          dp1: 3,
          dp2: 8,
          dp3: 1,
          total: 12,
          combosStrikeForce: 26,
        },
        {
          factionId: 'aeldari',
          displayName: 'AELDARI',
          isChapter: false,
          dp1: 4,
          dp2: 9,
          dp3: 2,
          total: 15,
          combosStrikeForce: 42,
        },
      ],
      cubeVersion: 'v1',
    }
    const out = renderCubeContext({ category: 'detachment', edition: '11th', group: 'faction' }, r)
    expect(out).toContain('| Faction |')
    // AELDARI should come before ORKS alphabetically
    const aeldariIdx = out.indexOf('AELDARI')
    const orksIdx = out.indexOf('ORKS')
    expect(aeldariIdx).toBeLessThan(orksIdx)
    expect(aeldariIdx).toBeGreaterThan(-1)
  })

  test('bare-count result renders a plain "Count:" line', () => {
    const r: CountResult = { count: 42, cubeVersion: 'v1' }
    const out = renderCubeContext({ category: 'datasheet', keyword: 'sustained hits' }, r)
    expect(out).toContain('Count: 42')
  })
})
