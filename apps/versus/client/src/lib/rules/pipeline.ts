import type { WeaponAbility, WeaponProfile } from '@tabletop-tools/game-content'

// ── Attack resolution ─────────────────────────────────────────────────────────

/**
 * Parse a dice notation string or flat number to its expected (average) value.
 * Supports: flat integers, D6, 2D6, D3+1, D6-1, etc.
 */
export function resolveAttacks(attacks: number | string): number {
  if (typeof attacks === 'number') return attacks
  const m = /^(\d*)D(\d+)([+-]\d+)?$/i.exec(String(attacks))
  if (!m) return 0
  const count = m[1] ? parseInt(m[1]) : 1
  const sides = parseInt(m[2]!)
  const mod = m[3] ? parseInt(m[3]) : 0
  return count * (1 + sides) / 2 + mod
}

/**
 * Returns the minimum possible value for a dice notation or flat number.
 * D6 → 1, 2D6 → 2, D6+1 → 2, flat 3 → 3.
 */
export function resolveMin(value: number | string): number {
  if (typeof value === 'number') return value
  const m = /^(\d*)D(\d+)([+-]\d+)?$/i.exec(String(value))
  if (!m) return 0
  const count = m[1] ? parseInt(m[1]) : 1
  const mod = m[3] ? parseInt(m[3]) : 0
  return Math.max(1, count + mod)
}

/**
 * Returns the maximum possible value for a dice notation or flat number.
 * D6 → 6, 2D6 → 12, D3+1 → 4, flat 3 → 3.
 */
export function resolveMax(value: number | string): number {
  if (typeof value === 'number') return value
  const m = /^(\d*)D(\d+)([+-]\d+)?$/i.exec(String(value))
  if (!m) return 0
  const count = m[1] ? parseInt(m[1]) : 1
  const sides = parseInt(m[2]!)
  const mod = m[3] ? parseInt(m[3]) : 0
  return count * sides + mod
}

// ── Wound target table ────────────────────────────────────────────────────────

/**
 * 40K wound roll target from Strength vs Toughness.
 * Returns the number needed on a d6 (e.g. 3 = "3+").
 */
export function woundTarget(strength: number, toughness: number): number {
  if (strength >= 2 * toughness) return 2
  if (strength > toughness) return 3
  if (strength === toughness) return 4
  if (toughness < 2 * strength) return 5
  return 6  // toughness >= 2 × strength
}

// ── Hit resolution ────────────────────────────────────────────────────────────

export interface HitResult {
  normalHits: number   // hits that proceed to the wound roll
  lethalHits: number   // auto-wounds from LETHAL_HITS (bypass wound roll)
}

/**
 * Compute expected hit counts from N attack dice.
 *
 * Handles: TORRENT, LETHAL_HITS, SUSTAINED_HITS, REROLL_HITS, REROLL_HITS_OF_1, HIT_MOD.
 */
export function resolveHits(
  attacks: number,
  skill: number,
  abilities: WeaponAbility[],
): HitResult {
  // TORRENT: all attacks auto-hit (no dice roll)
  if (abilities.some((a) => a.type === 'TORRENT')) {
    return { normalHits: attacks, lethalHits: 0 }
  }

  // HIT_MOD adjusts the target number
  const hitMod = abilities
    .filter((a): a is { type: 'HIT_MOD'; value: number } => a.type === 'HIT_MOD')
    .reduce((sum, a) => sum + a.value, 0)
  const effectiveSkill = Math.min(6, Math.max(2, skill - hitMod))

  // Base hit rates (before rerolls)
  // Unmodified 6s always hit and are checked for LETHAL/SUSTAINED regardless of effective skill
  const baseTotalHitRate = (7 - effectiveSkill) / 6
  const baseSixRate = 1 / 6  // rate of rolling an unmodified 6

  // Apply rerolls to get the adjusted rates
  let totalHitRate: number
  let sixRate: number

  if (abilities.some((a) => a.type === 'REROLL_HITS')) {
    // Reroll all misses: hitRate + miss × hitRate
    totalHitRate = baseTotalHitRate + (1 - baseTotalHitRate) * baseTotalHitRate
    // Rerolled misses that become 6s
    sixRate = baseSixRate + (1 - baseTotalHitRate) * baseSixRate
  } else if (abilities.some((a) => a.type === 'REROLL_HITS_OF_1')) {
    // Reroll 1s only: hitRate + (1/6) × hitRate
    totalHitRate = baseTotalHitRate + (1 / 6) * baseTotalHitRate
    sixRate = baseSixRate + (1 / 6) * baseSixRate
  } else {
    totalHitRate = baseTotalHitRate
    sixRate = baseSixRate
  }

  // SUSTAINED_HITS: each unmodified 6 to hit generates extra hits
  const sustainedValue = abilities
    .filter((a): a is { type: 'SUSTAINED_HITS'; value: number } => a.type === 'SUSTAINED_HITS')
    .reduce((sum, a) => sum + a.value, 0)

  const hasLethalHits = abilities.some((a) => a.type === 'LETHAL_HITS')

  let normalHits: number
  let lethalHits: number

  if (hasLethalHits) {
    // 6s become auto-wounds and skip the wound roll
    lethalHits = attacks * sixRate
    // Non-6 hits proceed through wound roll
    const nonSixHitRate = Math.max(0, totalHitRate - sixRate)
    normalHits = attacks * nonSixHitRate
  } else {
    lethalHits = 0
    normalHits = attacks * totalHitRate
  }

  // SUSTAINED_HITS add extra normal hits per 6
  if (sustainedValue > 0) {
    normalHits += attacks * sixRate * sustainedValue
  }

  return { normalHits, lethalHits }
}

// ── Wound resolution ──────────────────────────────────────────────────────────

export interface WoundResult {
  wounds: number    // wounds that proceed to the save roll
  mortals: number   // mortal wounds from DEVASTATING_WOUNDS (bypass saves)
}

/**
 * Compute expected wound counts from hit results.
 *
 * Handles: WOUND_MOD, REROLL_WOUNDS, TWIN_LINKED, DEVASTATING_WOUNDS, ANTI.
 * lethalHits from resolveHits are treated as auto-wounds (go straight to saves).
 *
 * ANTI-[KEYWORD] X+: if the defender has the matching keyword, wound rolls of X+
 * are critical wounds (auto-wound). This effectively lowers the wound target to
 * whichever is lower: the normal wound target or the ANTI value.
 */
export function resolveWounds(
  normalHits: number,
  lethalHits: number,
  strength: number,
  toughness: number,
  abilities: WeaponAbility[],
  defenderKeywords?: string[],
): WoundResult {
  const target = woundTarget(strength, toughness)

  const woundMod = abilities
    .filter((a): a is { type: 'WOUND_MOD'; value: number } => a.type === 'WOUND_MOD')
    .reduce((sum, a) => sum + a.value, 0)
  let effectiveTarget = Math.min(6, Math.max(2, target - woundMod))

  // ANTI: if defender has matching keyword, use lower of normal target or anti value
  if (defenderKeywords && defenderKeywords.length > 0) {
    const antiAbilities = abilities.filter(
      (a): a is { type: 'ANTI'; keyword: string; value: number } => a.type === 'ANTI'
    )
    for (const anti of antiAbilities) {
      const matches = defenderKeywords.some(
        (k) => k.toLowerCase() === anti.keyword.toLowerCase()
      )
      if (matches) {
        effectiveTarget = Math.min(effectiveTarget, anti.value)
      }
    }
  }

  const baseWoundRate = (7 - effectiveTarget) / 6
  const baseSixWoundRate = 1 / 6

  // Apply rerolls (REROLL_WOUNDS and TWIN_LINKED both reroll failed wounds)
  let woundRate: number
  let sixWoundRate: number

  if (abilities.some((a) => a.type === 'REROLL_WOUNDS' || a.type === 'TWIN_LINKED')) {
    woundRate = baseWoundRate + (1 - baseWoundRate) * baseWoundRate
    sixWoundRate = baseSixWoundRate + (1 - baseWoundRate) * baseSixWoundRate
  } else {
    woundRate = baseWoundRate
    sixWoundRate = baseSixWoundRate
  }

  const hasDevWounds = abilities.some((a) => a.type === 'DEVASTATING_WOUNDS')

  if (hasDevWounds) {
    // 6s to wound become mortal wounds (bypass saves entirely)
    const devMortals = normalHits * sixWoundRate
    const normalWounds = normalHits * Math.max(0, woundRate - sixWoundRate)
    return {
      wounds: normalWounds + lethalHits,
      mortals: devMortals,
    }
  }

  return {
    wounds: normalHits * woundRate + lethalHits,
    mortals: 0,
  }
}

// ── Save resolution ───────────────────────────────────────────────────────────

/**
 * Returns the save target number the defender must roll to negate a wound.
 * ap is stored as a negative number (e.g. -2 for AP-2).
 * A lower returned value is better for the defender.
 */
export function effectiveSave(save: number, ap: number, invulnSave?: number): number {
  // AP penalty: ap is negative, so subtracting it raises the target (harder to save)
  const armorSave = save - ap
  const best = invulnSave !== undefined ? Math.min(armorSave, invulnSave) : armorSave
  return Math.min(7, best)  // 7 means impossible to save (0% rate)
}

/**
 * Returns expected total damage dealt after saves and Feel No Pain rolls.
 *
 * mortals bypass both armor/invuln saves and are subject to FNP only.
 */
export function resolveSaves(
  wounds: number,
  mortals: number,
  ap: number,
  save: number,
  invulnSave?: number,
  fnp?: number,
): number {
  const saveTarget = effectiveSave(save, ap, invulnSave)
  const saveRate = saveTarget <= 6 ? (7 - saveTarget) / 6 : 0
  const unsavedWounds = wounds * (1 - saveRate)

  const totalDamage = unsavedWounds + mortals

  if (fnp !== undefined && fnp <= 6) {
    const fnpRate = (7 - fnp) / 6
    return totalDamage * (1 - fnpRate)
  }

  return totalDamage
}

// ── Monte Carlo simulation ────────────────────────────────────────────────────

function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1
}

function rollDice(notation: number | string): number {
  if (typeof notation === 'number') return notation
  const m = /^(\d*)D(\d+)([+-]\d+)?$/i.exec(String(notation))
  if (!m) return 0
  const count = m[1] ? parseInt(m[1]) : 1
  const sides = parseInt(m[2]!)
  const mod = m[3] ? parseInt(m[3]) : 0
  let total = 0
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1
  }
  return Math.max(1, total + mod)
}

function mcRollHits(
  attacks: number,
  skill: number,
  abilities: WeaponAbility[],
): { normalHits: number; lethalHits: number } {
  if (abilities.some((a) => a.type === 'TORRENT')) {
    return { normalHits: attacks, lethalHits: 0 }
  }

  const hitMod = abilities
    .filter((a): a is { type: 'HIT_MOD'; value: number } => a.type === 'HIT_MOD')
    .reduce((sum, a) => sum + a.value, 0)
  const effectiveSkill = Math.min(6, Math.max(2, skill - hitMod))

  const hasRerollAll = abilities.some((a) => a.type === 'REROLL_HITS')
  const hasReroll1s = abilities.some((a) => a.type === 'REROLL_HITS_OF_1')
  const hasLethal = abilities.some((a) => a.type === 'LETHAL_HITS')
  const sustainedValue = abilities
    .filter((a): a is { type: 'SUSTAINED_HITS'; value: number } => a.type === 'SUSTAINED_HITS')
    .reduce((sum, a) => sum + a.value, 0)

  let normalHits = 0
  let lethalHits = 0

  for (let i = 0; i < attacks; i++) {
    let roll = rollD6()
    // Reroll logic
    if (roll < effectiveSkill) {
      if (hasRerollAll || (hasReroll1s && roll === 1)) {
        roll = rollD6()
      }
    }
    if (roll >= effectiveSkill) {
      if (hasLethal && roll === 6) {
        lethalHits++
      } else {
        normalHits++
      }
      if (sustainedValue > 0 && roll === 6) {
        normalHits += sustainedValue
      }
    }
  }

  return { normalHits, lethalHits }
}

function mcRollWounds(
  normalHits: number,
  lethalHits: number,
  strength: number,
  toughness: number,
  abilities: WeaponAbility[],
  defenderKeywords?: string[],
): { wounds: number; mortals: number } {
  const target = woundTarget(strength, toughness)
  const woundMod = abilities
    .filter((a): a is { type: 'WOUND_MOD'; value: number } => a.type === 'WOUND_MOD')
    .reduce((sum, a) => sum + a.value, 0)
  let effectiveTarget = Math.min(6, Math.max(2, target - woundMod))

  if (defenderKeywords && defenderKeywords.length > 0) {
    const antiAbilities = abilities.filter(
      (a): a is { type: 'ANTI'; keyword: string; value: number } => a.type === 'ANTI'
    )
    for (const anti of antiAbilities) {
      if (defenderKeywords.some((k) => k.toLowerCase() === anti.keyword.toLowerCase())) {
        effectiveTarget = Math.min(effectiveTarget, anti.value)
      }
    }
  }

  const hasRerollWounds = abilities.some((a) => a.type === 'REROLL_WOUNDS' || a.type === 'TWIN_LINKED')
  const hasDevWounds = abilities.some((a) => a.type === 'DEVASTATING_WOUNDS')

  let wounds = lethalHits
  let mortals = 0

  for (let i = 0; i < normalHits; i++) {
    let roll = rollD6()
    if (roll < effectiveTarget && hasRerollWounds) {
      roll = rollD6()
    }
    if (roll >= effectiveTarget) {
      if (hasDevWounds && roll === 6) {
        mortals++
      } else {
        wounds++
      }
    }
  }

  return { wounds, mortals }
}

function mcRollSaves(
  wounds: number,
  mortals: number,
  ap: number,
  save: number,
  damage: number | string,
  meltaBonus: number,
  defenderWoundsPerModel: number,
  defenderModelCount: number,
  invulnSave?: number,
  fnp?: number,
): number {
  const saveTarget = effectiveSave(save, ap, invulnSave)
  let totalDamage = 0

  // Process regular wounds
  for (let i = 0; i < wounds; i++) {
    const roll = rollD6()
    if (roll < saveTarget) {
      // Failed save — apply damage
      let dmg = rollDice(damage) + meltaBonus
      // Apply FNP to each point of damage
      if (fnp !== undefined && fnp <= 6) {
        let survived = 0
        for (let d = 0; d < dmg; d++) {
          if (rollD6() < fnp) survived++
        }
        dmg = survived
      }
      totalDamage += dmg
    }
  }

  // Process mortal wounds (bypass saves, subject to FNP only)
  for (let i = 0; i < mortals; i++) {
    if (fnp !== undefined && fnp <= 6) {
      if (rollD6() < fnp) totalDamage++
    } else {
      totalDamage++
    }
  }

  // Cap at total defender HP
  const maxDamage = defenderModelCount * defenderWoundsPerModel
  return Math.min(totalDamage, maxDamage)
}

export interface DistributionData {
  histogram: Map<number, number>
  percentiles: { p10: number; p25: number; median: number; p75: number; p90: number }
  mean: number
  iterations: number
}

/**
 * Run Monte Carlo simulation to generate a damage distribution.
 * Returns a histogram of total damage outcomes and key percentiles.
 */
export function runMonteCarlo(
  weapons: WeaponProfile[],
  defenderToughness: number,
  defenderSave: number,
  defenderWoundsPerModel: number,
  defenderModelCount: number,
  defenderInvulnSave?: number,
  defenderFnp?: number,
  defenderKeywords?: string[],
  iterations = 5000,
): DistributionData {
  const results: number[] = []

  for (let iter = 0; iter < iterations; iter++) {
    let totalDamage = 0

    for (const weapon of weapons) {
      let attackCount = rollDice(weapon.attacks)
      if (weapon.abilities.some((a) => a.type === 'BLAST') && defenderModelCount >= 6) {
        attackCount = Math.max(attackCount, 3)
      }
      const attacksMod = weapon.abilities
        .filter((a): a is { type: 'ATTACKS_MOD'; value: number } => a.type === 'ATTACKS_MOD')
        .reduce((sum, a) => sum + a.value, 0)
      if (attacksMod !== 0) attackCount = Math.max(1, attackCount + attacksMod)

      const strengthMod = weapon.abilities
        .filter((a): a is { type: 'STRENGTH_MOD'; value: number } => a.type === 'STRENGTH_MOD')
        .reduce((sum, a) => sum + a.value, 0)
      const effectiveStrength = weapon.strength + strengthMod

      const { normalHits, lethalHits } = mcRollHits(attackCount, weapon.skill, weapon.abilities)
      const { wounds, mortals } = mcRollWounds(
        normalHits, lethalHits, effectiveStrength, defenderToughness,
        weapon.abilities, defenderKeywords,
      )

      const meltaBonus = weapon.abilities
        .filter((a): a is { type: 'MELTA'; value: number } => a.type === 'MELTA')
        .reduce((sum, a) => sum + a.value, 0)

      totalDamage += mcRollSaves(
        wounds, mortals, weapon.ap, defenderSave,
        weapon.damage, meltaBonus,
        defenderWoundsPerModel, defenderModelCount,
        defenderInvulnSave, defenderFnp,
      )
    }

    results.push(totalDamage)
  }

  // Build histogram
  const histogram = new Map<number, number>()
  let sum = 0
  for (const d of results) {
    const bin = Math.floor(d)
    histogram.set(bin, (histogram.get(bin) ?? 0) + 1)
    sum += d
  }

  // Sort results for percentiles
  results.sort((a, b) => a - b)
  const p = (pct: number) => results[Math.floor(results.length * pct)] ?? 0

  return {
    histogram,
    percentiles: {
      p10: p(0.1),
      p25: p(0.25),
      median: p(0.5),
      p75: p(0.75),
      p90: p(0.9),
    },
    mean: sum / iterations,
    iterations,
  }
}

// ── Per-weapon simulation ─────────────────────────────────────────────────────

export interface SimResult {
  expectedWounds: number
  expectedModelsRemoved: number
  survivors: number
  worstCase: { wounds: number; modelsRemoved: number }
  bestCase: { wounds: number; modelsRemoved: number }
}

/**
 * Simulate one weapon profile against a defender and return expected outcomes.
 */
export function simulateWeapon(
  weapon: WeaponProfile,
  defenderToughness: number,
  defenderSave: number,
  defenderWoundsPerModel: number,
  defenderModelCount: number,
  defenderInvulnSave?: number,
  defenderFnp?: number,
  defenderKeywords?: string[],
): SimResult {
  // BLAST: minimum 3 attacks vs 6+ model unit
  let attackCount = resolveAttacks(weapon.attacks)
  if (weapon.abilities.some((a) => a.type === 'BLAST') && defenderModelCount >= 6) {
    attackCount = Math.max(attackCount, 3)
  }

  // ATTACKS_MOD: +/- to attack count (minimum 1)
  const attacksMod = weapon.abilities
    .filter((a): a is { type: 'ATTACKS_MOD'; value: number } => a.type === 'ATTACKS_MOD')
    .reduce((sum, a) => sum + a.value, 0)
  if (attacksMod !== 0) {
    attackCount = Math.max(1, attackCount + attacksMod)
  }

  // STRENGTH_MOD: +/- to weapon strength
  const strengthMod = weapon.abilities
    .filter((a): a is { type: 'STRENGTH_MOD'; value: number } => a.type === 'STRENGTH_MOD')
    .reduce((sum, a) => sum + a.value, 0)
  const effectiveStrength = weapon.strength + strengthMod

  const { normalHits, lethalHits } = resolveHits(attackCount, weapon.skill, weapon.abilities)
  const { wounds, mortals } = resolveWounds(
    normalHits,
    lethalHits,
    effectiveStrength,
    defenderToughness,
    weapon.abilities,
    defenderKeywords,
  )
  const damageDealt = resolveSaves(
    wounds,
    mortals,
    weapon.ap,
    defenderSave,
    defenderInvulnSave,
    defenderFnp,
  )

  let damagePerUnsaved = resolveAttacks(weapon.damage)
  // MELTA: adds bonus damage (simulated as always at half range for average)
  const meltaBonus = weapon.abilities
    .filter((a): a is { type: 'MELTA'; value: number } => a.type === 'MELTA')
    .reduce((sum, a) => sum + a.value, 0)
  if (meltaBonus > 0) {
    damagePerUnsaved += meltaBonus
  }
  const expectedTotalDamage = damageDealt * damagePerUnsaved
  const expectedModelsRemoved = Math.min(
    defenderModelCount,
    expectedTotalDamage / defenderWoundsPerModel,
  )
  const survivors = Math.max(0, defenderModelCount - expectedModelsRemoved)

  // Save probability for best/worst estimates
  const saveTarget = effectiveSave(defenderSave, weapon.ap, defenderInvulnSave)
  const saveRate = saveTarget <= 6 ? (7 - saveTarget) / 6 : 0
  const failSaveRate = 1 - saveRate
  const fnpPassRate = defenderFnp !== undefined && defenderFnp <= 6 ? (7 - defenderFnp) / 6 : 0
  const throughRate = failSaveRate * (1 - fnpPassRate)

  // Best case: all attacks hit, wound, then apply save/FNP probability, max damage
  const maxDamagePerAttack = resolveMax(weapon.damage) + meltaBonus
  const bestUnsaved = attackCount * throughRate
  const bestDamage = bestUnsaved * maxDamagePerAttack
  const bestWounds = Math.min(
    bestDamage,
    defenderModelCount * defenderWoundsPerModel,
  )

  // Worst case: 1 attack gets through saves at minimum damage
  const minDamagePerAttack = resolveMin(weapon.damage) + meltaBonus
  const worstWounds = Math.min(
    minDamagePerAttack * throughRate,
    defenderModelCount * defenderWoundsPerModel,
  )

  return {
    expectedWounds: parseFloat(expectedTotalDamage.toFixed(4)),
    expectedModelsRemoved: parseFloat(expectedModelsRemoved.toFixed(4)),
    survivors: parseFloat(survivors.toFixed(4)),
    worstCase: {
      wounds: worstWounds,
      modelsRemoved: Math.floor(worstWounds / defenderWoundsPerModel),
    },
    bestCase: {
      wounds: bestWounds,
      modelsRemoved: Math.floor(bestWounds / defenderWoundsPerModel),
    },
  }
}
