import { describe, it, expect } from 'vitest'
import {
  slugify,
  coreId, factionId, detachmentId, errataId, balanceId,
  weaponId, abilityId, communityId,
} from './slugify'

describe('slugify', () => {
  it('converts title to kebab-case', () => {
    expect(slugify('Wound Roll')).toBe('wound-roll')
  })

  it('handles ALL CAPS', () => {
    expect(slugify('SHOOTING PHASE')).toBe('shooting-phase')
  })

  it('strips apostrophes and smart quotes', () => {
    expect(slugify("Emperor's Shield")).toBe('emperors-shield')
    expect(slugify('Emperor\u2019s Shield')).toBe('emperors-shield')
  })

  it('collapses multiple hyphens', () => {
    expect(slugify('Fights First -- Edge Case')).toBe('fights-first-edge-case')
  })

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  Wound Roll  ')).toBe('wound-roll')
  })

  it('handles parentheses and numbers', () => {
    expect(slugify('Unit Coherency (2" models)')).toBe('unit-coherency-2-models')
  })

  it('handles numbered phase headings', () => {
    expect(slugify('1 COMMAND PHASE')).toBe('1-command-phase')
  })

  it('handles empty string', () => {
    expect(slugify('')).toBe('')
  })
})

describe('node ID builders', () => {
  it('builds core ID', () => {
    expect(coreId('Wound Roll')).toBe('core:wound-roll')
  })

  it('builds faction ID', () => {
    expect(factionId('space-marines', 'Oath of Moment'))
      .toBe('faction:space-marines:oath-of-moment')
  })

  it('builds detachment ID', () => {
    expect(detachmentId('space-marines', 'gladius', 'Armour of Contempt'))
      .toBe('det:space-marines:gladius:armour-of-contempt')
  })

  it('builds errata ID', () => {
    expect(errataId('core-rules-commentary', 10, 1))
      .toBe('errata:core-rules-commentary:p10:1')
  })

  it('builds balance ID', () => {
    expect(balanceId('aeldari', 'Fate Dice Change'))
      .toBe('balance:aeldari:fate-dice-change')
  })

  it('builds weapon ID', () => {
    expect(weaponId('a1b2c3d4', 'Bolt Rifle'))
      .toBe('weapon:a1b2c3d4:bolt-rifle')
  })

  it('builds ability ID', () => {
    expect(abilityId('a1b2c3d4', 'Oath of Moment'))
      .toBe('ability:a1b2c3d4:oath-of-moment')
  })

  it('builds community ID', () => {
    expect(communityId('overwatch-engagement-range-ruling'))
      .toBe('community:overwatch-engagement-range-ruling')
  })
})
