import { describe, it, expect } from 'vitest'
import { parseArmyListFromText } from './army-list'

// We test the pure parsing helper only — Playwright navigation is not unit-testable.
// parseArmyListFromText takes raw text extracted from the page and normalises it.

describe('parseArmyListFromText', () => {
  it('returns null when passed null or empty string', () => {
    expect(parseArmyListFromText(null)).toBeNull()
    expect(parseArmyListFromText('')).toBeNull()
    expect(parseArmyListFromText('   ')).toBeNull()
  })

  it('returns trimmed text when content is present', () => {
    const raw = '  ARMY LIST\nSpace Marines\nCaptain: 90pts  '
    const result = parseArmyListFromText(raw)
    expect(result).toBe('ARMY LIST\nSpace Marines\nCaptain: 90pts')
  })

  it('returns text as-is when it has no surrounding whitespace', () => {
    const list = 'Detachment: Gladius Task Force\n++ Brigade Detachment ++'
    expect(parseArmyListFromText(list)).toBe(list)
  })
})
