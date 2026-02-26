import { describe, expect, it } from 'vitest'

import {
  effectiveSave,
  resolveAttacks,
  resolveMin,
  resolveMax,
  resolveHits,
  resolveSaves,
  resolveWounds,
  simulateWeapon,
  woundTarget,
} from './pipeline'
import type { WeaponAbility } from '@tabletop-tools/game-content'

const noAbilities: WeaponAbility[] = []

// ── resolveAttacks ────────────────────────────────────────────────────────────

describe('resolveAttacks', () => {
  it('returns a flat number as-is', () => {
    expect(resolveAttacks(4)).toBe(4)
  })
  it('D6 = 3.5', () => {
    expect(resolveAttacks('D6')).toBeCloseTo(3.5)
  })
  it('D3 = 2', () => {
    expect(resolveAttacks('D3')).toBeCloseTo(2)
  })
  it('2D6 = 7', () => {
    expect(resolveAttacks('2D6')).toBeCloseTo(7)
  })
  it('D6+1 = 4.5', () => {
    expect(resolveAttacks('D6+1')).toBeCloseTo(4.5)
  })
  it('D3+2 = 4', () => {
    expect(resolveAttacks('D3+2')).toBeCloseTo(4)
  })
})

// ── resolveMin ──────────────────────────────────────────────────────────────

describe('resolveMin', () => {
  it('returns a flat number as-is', () => {
    expect(resolveMin(3)).toBe(3)
  })
  it('D6 min = 1', () => {
    expect(resolveMin('D6')).toBe(1)
  })
  it('2D6 min = 2', () => {
    expect(resolveMin('2D6')).toBe(2)
  })
  it('D6+1 min = 2', () => {
    expect(resolveMin('D6+1')).toBe(2)
  })
  it('D3 min = 1', () => {
    expect(resolveMin('D3')).toBe(1)
  })
})

// ── resolveMax ──────────────────────────────────────────────────────────────

describe('resolveMax', () => {
  it('returns a flat number as-is', () => {
    expect(resolveMax(3)).toBe(3)
  })
  it('D6 max = 6', () => {
    expect(resolveMax('D6')).toBe(6)
  })
  it('2D6 max = 12', () => {
    expect(resolveMax('2D6')).toBe(12)
  })
  it('D3+1 max = 4', () => {
    expect(resolveMax('D3+1')).toBe(4)
  })
  it('D6+2 max = 8', () => {
    expect(resolveMax('D6+2')).toBe(8)
  })
})

// ── woundTarget ───────────────────────────────────────────────────────────────

describe('woundTarget', () => {
  it('S >= 2×T: 2+', () => {
    expect(woundTarget(8, 4)).toBe(2)
    expect(woundTarget(8, 3)).toBe(2)
  })
  it('S > T (but < 2×T): 3+', () => {
    expect(woundTarget(5, 4)).toBe(3)
    expect(woundTarget(6, 4)).toBe(3)
  })
  it('S = T: 4+', () => {
    expect(woundTarget(4, 4)).toBe(4)
  })
  it('S < T: 5+', () => {
    expect(woundTarget(4, 5)).toBe(5)
    expect(woundTarget(3, 4)).toBe(5)
  })
  it('T >= 2×S: 6+', () => {
    expect(woundTarget(2, 4)).toBe(6)
    expect(woundTarget(3, 7)).toBe(6)
  })
})

// ── resolveHits ───────────────────────────────────────────────────────────────

describe('resolveHits', () => {
  it('3+ skill: 4 of 6 attacks hit', () => {
    const r = resolveHits(6, 3, noAbilities)
    expect(r.normalHits).toBeCloseTo(4)
    expect(r.lethalHits).toBeCloseTo(0)
  })

  it('4+ skill: 3 of 6 attacks hit', () => {
    const r = resolveHits(6, 4, noAbilities)
    expect(r.normalHits).toBeCloseTo(3)
  })

  it('TORRENT: all attacks hit automatically', () => {
    const r = resolveHits(4, 4, [{ type: 'TORRENT' }])
    expect(r.normalHits).toBe(4)
    expect(r.lethalHits).toBe(0)
  })

  it('LETHAL_HITS: 6s become auto-wounds, non-6 hits proceed normally', () => {
    // 6 attacks at 3+:
    //   6s = 1/6 per attack → lethalHits = 1
    //   non-6 hits on 3,4,5 = 3/6 → normalHits = 3
    const r = resolveHits(6, 3, [{ type: 'LETHAL_HITS' }])
    expect(r.lethalHits).toBeCloseTo(1)   // 6 × 1/6
    expect(r.normalHits).toBeCloseTo(3)   // 6 × 3/6
  })

  it('SUSTAINED_HITS 1: 6s grant +1 extra hit', () => {
    // 6 attacks, 3+ to hit:
    //   On 6 (1/6): 1 hit + 1 extra = 2 hits → contributes 2/6 per attack
    //   On 3,4,5 (3/6): 1 hit → contributes 3/6 per attack
    //   Total = 5/6 per attack → 6 × 5/6 = 5
    const r = resolveHits(6, 3, [{ type: 'SUSTAINED_HITS', value: 1 }])
    expect(r.normalHits).toBeCloseTo(5)
    expect(r.lethalHits).toBeCloseTo(0)
  })

  it('SUSTAINED_HITS 2: 6s grant +2 extra hits', () => {
    // 6 attacks, 3+: on 6 = 3 hits, on 3,4,5 = 1 hit
    // Expected = 6 × (1/6 × 3 + 3/6 × 1) = 6 × (3/6 + 3/6) = 6 × 1 = 6
    const r = resolveHits(6, 3, [{ type: 'SUSTAINED_HITS', value: 2 }])
    expect(r.normalHits).toBeCloseTo(6)
  })

  it('REROLL_HITS: rerolling misses improves hit rate', () => {
    // 3+ = 4/6 base. With reroll: 4/6 + (2/6)(4/6) = 32/36
    const r = resolveHits(36, 3, [{ type: 'REROLL_HITS' }])
    expect(r.normalHits).toBeCloseTo(32)
  })

  it('REROLL_HITS_OF_1: rerolling 1s improves hit rate', () => {
    // 3+ = 4/6. With reroll 1s: 4/6 + (1/6)(4/6) = 28/36
    const r = resolveHits(36, 3, [{ type: 'REROLL_HITS_OF_1' }])
    expect(r.normalHits).toBeCloseTo(28)
  })

  it('HIT_MOD +1: 3+ becomes 2+ (5/6 hit rate)', () => {
    const r = resolveHits(6, 3, [{ type: 'HIT_MOD', value: 1 }])
    expect(r.normalHits).toBeCloseTo(5)
  })

  it('HIT_MOD -1: 3+ becomes 4+ (3/6 hit rate)', () => {
    const r = resolveHits(6, 3, [{ type: 'HIT_MOD', value: -1 }])
    expect(r.normalHits).toBeCloseTo(3)
  })

  it('HIT_MOD is capped at 2+ minimum (5/6 maximum hit rate)', () => {
    const r = resolveHits(6, 3, [{ type: 'HIT_MOD', value: 10 }])
    expect(r.normalHits).toBeCloseTo(5)
  })
})

// ── resolveWounds ─────────────────────────────────────────────────────────────

describe('resolveWounds', () => {
  it('S4 vs T4: wounds on 4+ (3/6)', () => {
    const r = resolveWounds(6, 0, 4, 4, noAbilities)
    expect(r.wounds).toBeCloseTo(3)
    expect(r.mortals).toBeCloseTo(0)
  })

  it('lethal hits bypass wound roll and go straight to wounds', () => {
    // 2 normal hits + 1 lethal hit, S4 T4
    // wounds = 2 × 3/6 + 1 lethal = 1 + 1 = 2
    const r = resolveWounds(2, 1, 4, 4, noAbilities)
    expect(r.wounds).toBeCloseTo(2)
  })

  it('DEVASTATING_WOUNDS: 6s to wound become mortals (bypass saves)', () => {
    // 6 hits, S4 T4: wound rate 3/6, mortals on 6 = 1/6
    // mortals = 6 × 1/6 = 1
    // wounds = 6 × (3/6 - 1/6) = 6 × 2/6 = 2
    const r = resolveWounds(6, 0, 4, 4, [{ type: 'DEVASTATING_WOUNDS' }])
    expect(r.mortals).toBeCloseTo(1)
    expect(r.wounds).toBeCloseTo(2)
  })

  it('REROLL_WOUNDS: rerolling failed wounds improves wound rate', () => {
    // S4 T4: 3/6 base. With reroll: 3/6 + (3/6)(3/6) = 18/36 + 9/36 = 27/36
    const r = resolveWounds(36, 0, 4, 4, [{ type: 'REROLL_WOUNDS' }])
    expect(r.wounds).toBeCloseTo(27)
  })

  it('TWIN_LINKED: same as REROLL_WOUNDS (reroll failed wounds)', () => {
    const r = resolveWounds(36, 0, 4, 4, [{ type: 'TWIN_LINKED' }])
    expect(r.wounds).toBeCloseTo(27)
  })

  it('WOUND_MOD +1: wound target decreases by 1', () => {
    // S4 T4 normally 4+. With +1 mod → 3+ = 4/6
    const r = resolveWounds(6, 0, 4, 4, [{ type: 'WOUND_MOD', value: 1 }])
    expect(r.wounds).toBeCloseTo(4)
  })
})

// ── effectiveSave ─────────────────────────────────────────────────────────────

describe('effectiveSave', () => {
  it('no AP: save unchanged', () => {
    expect(effectiveSave(3, 0)).toBe(3)
  })

  it('AP -2: 3+ save becomes 5+', () => {
    // ap stored as -2, effective = 3 - (-2) = 5
    expect(effectiveSave(3, -2)).toBe(5)
  })

  it('invuln save used when better than armor', () => {
    // armor=5+ with AP-2 → 7+, invuln=4+ → use 4+
    expect(effectiveSave(5, -2, 4)).toBe(4)
  })

  it('armor save used when better than invuln', () => {
    // armor=2+ with AP0 → 2+, invuln=5+ → use 2+
    expect(effectiveSave(2, 0, 5)).toBe(2)
  })
})

// ── resolveSaves ──────────────────────────────────────────────────────────────

describe('resolveSaves', () => {
  it('3+ save: 1/3 of wounds get through', () => {
    // save rate = 4/6, fail = 2/6 = 1/3
    const r = resolveSaves(6, 0, 0, 3)
    expect(r).toBeCloseTo(2)
  })

  it('mortals bypass saves and are added to damage', () => {
    // 0 wounds, 3 mortals
    const r = resolveSaves(0, 3, 0, 3)
    expect(r).toBeCloseTo(3)
  })

  it('AP -2 makes 3+ save effectively 5+ (2/3 get through)', () => {
    // effectiveSave(3, -2) = 5, save rate = 2/6, fail = 4/6
    const r = resolveSaves(6, 0, -2, 3)
    expect(r).toBeCloseTo(4)
  })

  it('FNP 5+ reduces damage by 2/6', () => {
    // 6 unsaved wounds (no mortals), FNP 5+
    // FNP rate = 2/6 → effective damage = 6 × (1 - 2/6) = 6 × 4/6 = 4
    const r = resolveSaves(6, 0, 0, 7, undefined, 5)   // save=7 = no save at all
    expect(r).toBeCloseTo(4)
  })
})

// ── simulateWeapon (end-to-end) ───────────────────────────────────────────────

describe('simulateWeapon', () => {
  it('basic bolter vs power armour gives expected wound count', () => {
    // 2 attacks, 3+ to hit (4/6), S4 vs T4 (4+ to wound = 3/6), 3+ save (AP 0, 4/6 save)
    // Expected hits = 2 × 4/6 ≈ 1.333
    // Expected wounds = 1.333 × 3/6 ≈ 0.667
    // Unsaved = 0.667 × (1 - 4/6) ≈ 0.667 × 2/6 ≈ 0.222
    // Damage = 0.222 × 1 ≈ 0.222
    const r = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 2, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
      4, 3, 2, 5,
    )
    expect(r.expectedWounds).toBeCloseTo(0.22, 1)
  })

  it('melta vs super-heavy: S4 vs T8 (6+ to wound)', () => {
    // 1 attack, 4+ to hit (3/6), S4 vs T8 → 6+ to wound (1/6), AP -4 → save 6+ → fail rate 5/6
    // Hits = 1 × 3/6 = 0.5
    // Wounds = 0.5 × 1/6 ≈ 0.0833
    // Unsaved = 0.0833 × 5/6 ≈ 0.0694
    // Damage D6 = 3.5 → 0.0694 × 3.5 ≈ 0.243
    const r = simulateWeapon(
      { name: 'Melta', range: 12, attacks: 1, skill: 4, strength: 4, ap: -4, damage: 'D6', abilities: [] },
      8, 2, 12, 1,
    )
    expect(r.expectedWounds).toBeCloseTo(0.24, 1)
  })

  it('BLAST weapon hits minimum 3 times against 6+ model unit', () => {
    // 1 attack with BLAST vs 6+ models → 3 effective attacks
    // Then regular math
    const r = simulateWeapon(
      { name: 'Frag', range: 24, attacks: 1, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [{ type: 'BLAST' }] },
      4, 4, 1, 10,  // 10 defender models
    )
    // With BLAST: 3 effective attacks instead of 1
    const rNoBlast = simulateWeapon(
      { name: 'Frag', range: 24, attacks: 1, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
      4, 4, 1, 5,  // < 6 models, no BLAST bonus
    )
    expect(r.expectedWounds).toBeGreaterThan(rNoBlast.expectedWounds)
  })

  it('worstCase is 1 minimum damage for flat damage weapons', () => {
    const r = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 2, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
      4, 3, 2, 5,
    )
    expect(r.worstCase.wounds).toBe(1)
    expect(r.worstCase.modelsRemoved).toBe(0) // 1 wound < 2 wounds per model
  })

  it('worstCase uses minimum dice roll for variable damage', () => {
    const r = simulateWeapon(
      { name: 'Melta', range: 12, attacks: 1, skill: 4, strength: 9, ap: -4, damage: 'D6', abilities: [] },
      4, 3, 2, 5,
    )
    // D6 min = 1
    expect(r.worstCase.wounds).toBe(1)
  })

  it('bestCase uses maximum dice roll for variable damage', () => {
    // 2 attacks, D6 damage each, vs T4 Sv3+ 2W 5 models
    const r = simulateWeapon(
      { name: 'Melta', range: 12, attacks: 2, skill: 4, strength: 9, ap: -4, damage: 'D6', abilities: [] },
      4, 3, 2, 5,
    )
    // Best: 2 attacks × 6 max damage = 12, capped at 5 models × 2 wounds = 10
    expect(r.bestCase.wounds).toBe(10)
    expect(r.bestCase.modelsRemoved).toBe(5)
  })

  it('STRENGTH_MOD +1: S4 vs T4 becomes S5 vs T4 (3+ to wound)', () => {
    // Without mod: S4 vs T4 = 4+ to wound (3/6)
    // With +1 strength: S5 vs T4 = 3+ to wound (4/6) — more damage
    const base = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 10, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
      4, 3, 2, 10,
    )
    const withMod = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 10, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [{ type: 'STRENGTH_MOD', value: 1 }] },
      4, 3, 2, 10,
    )
    expect(withMod.expectedWounds).toBeGreaterThan(base.expectedWounds)
  })

  it('STRENGTH_MOD +2: S4 vs T4 becomes S6 vs T4 (3+ to wound)', () => {
    // S6 vs T4 = 3+ to wound (same bracket as S5 vs T4)
    const plus1 = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 10, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [{ type: 'STRENGTH_MOD', value: 1 }] },
      4, 3, 2, 10,
    )
    const plus2 = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 10, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [{ type: 'STRENGTH_MOD', value: 2 }] },
      4, 3, 2, 10,
    )
    // S5 and S6 are both 3+ vs T4, so same result
    expect(plus2.expectedWounds).toBeCloseTo(plus1.expectedWounds)
  })

  it('STRENGTH_MOD -1: S4 vs T4 becomes S3 vs T4 (5+ to wound)', () => {
    const base = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 10, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
      4, 3, 2, 10,
    )
    const withMod = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 10, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [{ type: 'STRENGTH_MOD', value: -1 }] },
      4, 3, 2, 10,
    )
    expect(withMod.expectedWounds).toBeLessThan(base.expectedWounds)
  })

  it('ATTACKS_MOD +1: 2 attacks becomes 3', () => {
    const base = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 2, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
      4, 3, 2, 10,
    )
    const withMod = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 2, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [{ type: 'ATTACKS_MOD', value: 1 }] },
      4, 3, 2, 10,
    )
    // +1 attack = 50% more attacks, so 50% more damage
    expect(withMod.expectedWounds).toBeCloseTo(base.expectedWounds * 1.5, 2)
  })

  it('ATTACKS_MOD +2: 2 attacks becomes 4', () => {
    const base = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 2, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [] },
      4, 3, 2, 10,
    )
    const withMod = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 2, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [{ type: 'ATTACKS_MOD', value: 2 }] },
      4, 3, 2, 10,
    )
    // +2 attacks = double, so double damage
    expect(withMod.expectedWounds).toBeCloseTo(base.expectedWounds * 2, 2)
  })

  it('ATTACKS_MOD enforces minimum 1 attack', () => {
    const r = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 1, skill: 3, strength: 4, ap: 0, damage: 1, abilities: [{ type: 'ATTACKS_MOD', value: -5 }] },
      4, 3, 2, 10,
    )
    // Should still do some damage (1 attack minimum)
    expect(r.expectedWounds).toBeGreaterThan(0)
  })

  it('invuln save is passed through to resolveSaves', () => {
    const noInvuln = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 10, skill: 3, strength: 4, ap: -2, damage: 1, abilities: [] },
      4, 3, 2, 10,
    )
    const withInvuln = simulateWeapon(
      { name: 'Bolter', range: 24, attacks: 10, skill: 3, strength: 4, ap: -2, damage: 1, abilities: [] },
      4, 3, 2, 10, 4,
    )
    // Invuln 4+ is better than 3+ armor with AP-2 (which becomes 5+)
    expect(withInvuln.expectedWounds).toBeLessThan(noInvuln.expectedWounds)
  })
})
