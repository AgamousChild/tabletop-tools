import { describe, expect, it } from 'vitest'

import {
  abilityId,
  balanceId,
  communityId,
  coreId,
  detachmentId,
  errataId,
  factionId,
  slugify,
  weaponId,
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

  // Faction-name regression: any path that runs raw faction strings through
  // slugify must collapse the apostrophe BEFORE the non-alnum\u2192hyphen replace,
  // otherwise `T'au Empire` slugs to `t-au-empire` and `Emperor's Children`
  // slugs to `emperor-s-children` \u2014 both shadow ids that the brain has had to
  // clean up after with dim_faction_alias rows. The brain's own slugify gets
  // this right; this test pins the behaviour.
  it("collapses apostrophes in faction names (T'au, Emperor's)", () => {
    expect(slugify("T'au Empire")).toBe('tau-empire')
    expect(slugify("Emperor's Children")).toBe('emperors-children')
    // Smart-quote variants too \u2014 gw-sync occasionally emits these.
    expect(slugify('T\u2019au Empire')).toBe('tau-empire')
    expect(slugify('Emperor\u2019s Children')).toBe('emperors-children')
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
    expect(factionId('space-marines', 'Oath of Moment')).toBe(
      'faction:space-marines:oath-of-moment',
    )
  })

  it('builds detachment ID', () => {
    expect(detachmentId('space-marines', 'gladius', 'Armour of Contempt')).toBe(
      'det:space-marines:gladius:armour-of-contempt',
    )
  })

  it('builds errata ID', () => {
    expect(errataId('core-rules-commentary', 10, 1)).toBe('errata:core-rules-commentary:p10:1')
  })

  it('builds balance ID', () => {
    expect(balanceId('aeldari', 'Fate Dice Change')).toBe('balance:aeldari:fate-dice-change')
  })

  it('builds weapon ID', () => {
    expect(weaponId('a1b2c3d4', 'Bolt Rifle')).toBe('weapon:a1b2c3d4:bolt-rifle')
  })

  it('builds ability ID', () => {
    expect(abilityId('a1b2c3d4', 'Oath of Moment')).toBe('ability:a1b2c3d4:oath-of-moment')
  })

  it('builds community ID', () => {
    expect(communityId('overwatch-engagement-range-ruling')).toBe(
      'community:overwatch-engagement-range-ruling',
    )
  })
})
