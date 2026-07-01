/**
 * Faction-pack source tests. Synthetic fixtures only — no GW content.
 */
import { describe, expect, it } from 'vitest'

import { type ExistingUnitLookup, processFactionPacks } from './faction-pack'

// Synthetic markdown with a single detachment + two datasheets. One matches an
// existing BSData unit ("Frobber"), one is new ("New Bonker").
const SAMPLE_MD = `
## BONK BRIGADE

Bonker mob.


##### DETACHMENT RULE

##### CRUSH ROLL

Bonkers hit hard.


##### FROBBER

##### 6" 4+ 6+

RANGED WEAPONS RANGE A BS S AP D Frob cannon [SUSTAINED HITS 1] 24" 3 4+ 6 -2 2

MELEE WEAPONS RANGE A WS S AP D Frob fist Melee 4 3+ 6 -2 2

ABILITIES

Charge Frenzy: Each time this unit charges, add 1 to Attacks.

KEYWORDS: Infantry, Character

FACTION KEYWORDS: Greenskins


##### NEW BONKER

##### 8" 5+ 5+

RANGED WEAPONS RANGE A BS S AP D Bonk pistol [PISTOL] 12" 1 4+ 4 -1 1

ABILITIES

Zoom: Add 2 to Advance rolls.

KEYWORDS: Infantry

FACTION KEYWORDS: Greenskins
`.trim()

const existing: ExistingUnitLookup[] = [
  { id: 'bsdata-1', name: 'Frobber', faction: 'Greenskins' },
  { id: 'bsdata-2', name: 'Other Unit', faction: 'Greenskins' },
]

describe('processFactionPacks', () => {
  it('emits a patch for a datasheet whose name matches an existing BSData unit', () => {
    const r = processFactionPacks([{ factionSlug: 'greenskins', markdown: SAMPLE_MD }], existing)
    const frobberPatch = r.patches.find((p) => p.id === 'bsdata-1')
    expect(frobberPatch).toBeDefined()
    expect(frobberPatch?.patch.name).toBe('FROBBER')
    expect(frobberPatch?.patch.move).toBe(6)
    expect(frobberPatch?.patch.save).toBe(4)
    expect(frobberPatch?.patch.weapons?.length).toBeGreaterThanOrEqual(1)
  })

  it('emits a new UnitProfile for a datasheet that has no matching BSData row', () => {
    const r = processFactionPacks([{ factionSlug: 'greenskins', markdown: SAMPLE_MD }], existing)
    const newBonker = r.newUnits.find((u) => u.name === 'NEW BONKER')
    expect(newBonker).toBeDefined()
    expect(newBonker?.id).toBe('factionpack:greenskins:new-bonker')
    expect(newBonker?.faction).toBe('Greenskins')
    expect(newBonker?.move).toBe(8)
    expect(newBonker?.wounds).toBe(0) // unspecified stats fall to 0
  })

  it('reports unmatched datasheets so a caller can log a rekey opportunity', () => {
    const r = processFactionPacks([{ factionSlug: 'greenskins', markdown: SAMPLE_MD }], existing)
    expect(r.unmatched).toHaveLength(1)
    expect(r.unmatched[0]?.datasheet).toBe('NEW BONKER')
  })

  it('leaves rows alone whose existing name matches with different casing', () => {
    const r = processFactionPacks(
      [{ factionSlug: 'greenskins', markdown: SAMPLE_MD }],
      [{ id: 'bsdata-1', name: 'frobber', faction: 'Greenskins' }],
    )
    expect(r.patches.find((p) => p.id === 'bsdata-1')).toBeDefined()
  })

  it('captures a stats delta so downstream consumers can see the changed values', () => {
    const r = processFactionPacks([{ factionSlug: 'greenskins', markdown: SAMPLE_MD }], existing)
    const frobberPatch = r.patches.find((p) => p.id === 'bsdata-1')
    // stats came from `##### 6" 4+ 6+` — v2 recognises M / SV / OC in the
    // 3-cell shape.
    expect(frobberPatch?.patch.move).toBe(6)
    expect(frobberPatch?.patch.save).toBe(4)
    expect(frobberPatch?.patch.oc).toBe(6)
  })

  it('handles a pack with unparseable markdown by skipping it', () => {
    const r = processFactionPacks(
      [
        { factionSlug: 'broken', markdown: '' },
        { factionSlug: 'greenskins', markdown: SAMPLE_MD },
      ],
      existing,
    )
    // The Greenskins pack still produced output.
    expect(r.patches.length).toBeGreaterThan(0)
  })
})
