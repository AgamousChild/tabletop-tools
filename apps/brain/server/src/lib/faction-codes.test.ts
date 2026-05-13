import { describe, it, expect } from 'vitest'
import { normalizeFactionId, FACTION_CODE_TO_SLUG } from './faction-codes'

describe('normalizeFactionId', () => {
  it('maps short codes to canonical slugs', () => {
    expect(normalizeFactionId('SM')).toBe('space-marines')
    expect(normalizeFactionId('CSM')).toBe('chaos-space-marines')
    expect(normalizeFactionId('CD')).toBe('chaos-daemons')
    expect(normalizeFactionId('AM')).toBe('astra-militarum')
    expect(normalizeFactionId('GK')).toBe('grey-knights')
  })

  it('returns canonical slugs unchanged', () => {
    expect(normalizeFactionId('space-marines')).toBe('space-marines')
    expect(normalizeFactionId('necrons')).toBe('necrons')
  })

  it('slugifies unknown codes', () => {
    expect(normalizeFactionId('NewFaction')).toBe('newfaction')
  })

  it('has entries for all known factions', () => {
    expect(Object.keys(FACTION_CODE_TO_SLUG).length).toBeGreaterThanOrEqual(20)
  })
})
