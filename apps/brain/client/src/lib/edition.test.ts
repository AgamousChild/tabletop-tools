import { describe, expect, it } from 'vitest'

import { DEFAULT_EDITION, isEdition, parseEditionFromHash, writeEditionToHash } from './edition'

describe('lib/edition', () => {
  describe('isEdition', () => {
    it('accepts the four valid editions', () => {
      expect(isEdition('11th')).toBe(true)
      expect(isEdition('10th')).toBe(true)
      expect(isEdition('9th')).toBe(true)
      expect(isEdition('any')).toBe(true)
    })

    it('rejects garbage and null', () => {
      expect(isEdition('garbage')).toBe(false)
      expect(isEdition(null)).toBe(false)
      expect(isEdition(undefined)).toBe(false)
      expect(isEdition('')).toBe(false)
    })
  })

  describe('parseEditionFromHash', () => {
    it('returns DEFAULT_EDITION (11th) when hash is empty', () => {
      expect(parseEditionFromHash('')).toBe(DEFAULT_EDITION)
      expect(DEFAULT_EDITION).toBe('11th')
    })

    it('parses #edition=11th', () => {
      expect(parseEditionFromHash('#edition=11th')).toBe('11th')
    })

    it('parses edition=10th without leading hash', () => {
      expect(parseEditionFromHash('edition=10th')).toBe('10th')
    })

    it('parses edition out of a multi-param hash', () => {
      expect(parseEditionFromHash('#foo=bar&edition=9th&baz=qux')).toBe('9th')
    })

    it('falls back to default when value is not a valid edition', () => {
      expect(parseEditionFromHash('#edition=garbage')).toBe(DEFAULT_EDITION)
    })
  })

  describe('writeEditionToHash', () => {
    it('writes into an empty hash', () => {
      expect(writeEditionToHash('', '11th')).toBe('edition=11th')
    })

    it('overwrites an existing edition value', () => {
      expect(writeEditionToHash('#edition=10th', '11th')).toBe('edition=11th')
    })

    it('preserves other params alongside edition', () => {
      const result = writeEditionToHash('#foo=bar&edition=10th', '11th')
      expect(result).toContain('foo=bar')
      expect(result).toContain('edition=11th')
      expect(result).not.toContain('edition=10th')
    })
  })
})
