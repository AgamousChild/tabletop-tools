/**
 * Combat tier classification for units and weapons.
 *
 * The wound roll in 40K is determined by comparing weapon Strength to unit Toughness:
 *   S >= 2×T → 2+    (double or more)
 *   S > T   → 3+     (greater)
 *   S = T   → 4+     (equal)
 *   S < T   → 5+     (lower)
 *   S <= T/2 → 6+    (half or less)
 *
 * Units cluster into toughness tiers and weapons cluster into strength tiers.
 * These tiers are fundamental to how the game works — they determine which
 * weapons are efficient against which targets.
 */

export interface ToughnessTier {
  name: string
  range: [number, number]  // min, max inclusive
  description: string
  examples: string
  /** Weapon strength needed to wound on 2+ */
  woundsOn2Plus: number
  /** Weapon strength needed to wound on 3+ */
  woundsOn3Plus: number
}

export const TOUGHNESS_TIERS: ToughnessTier[] = [
  {
    name: 'light-infantry',
    range: [2, 3],
    description: 'Light infantry — fragile, wounded easily by standard weapons',
    examples: 'Guardsmen, Aeldari infantry, Gretchin, cultists',
    woundsOn2Plus: 6,
    woundsOn3Plus: 4,
  },
  {
    name: 'standard-infantry',
    range: [4, 4],
    description: 'Standard infantry — the baseline. S4 weapons wound on 4+',
    examples: 'Space Marines, Chaos Marines, Necron Warriors, Ork Boyz',
    woundsOn2Plus: 8,
    woundsOn3Plus: 5,
  },
  {
    name: 'heavy-infantry',
    range: [5, 5],
    description: 'Heavy infantry — tougher than standard, resists S4',
    examples: 'Gravis armour, Terminators (some), Plague Marines',
    woundsOn2Plus: 10,
    woundsOn3Plus: 6,
  },
  {
    name: 'elite-infantry',
    range: [6, 6],
    description: 'Elite infantry / light vehicles — S4 wounds on 5+',
    examples: 'Custodians, some characters, light walkers',
    woundsOn2Plus: 12,
    woundsOn3Plus: 7,
  },
  {
    name: 'light-vehicle',
    range: [7, 8],
    description: 'Light-medium vehicles and monsters',
    examples: 'Rhinos, Dreadnoughts, War Walkers, Carnifex',
    woundsOn2Plus: 16,
    woundsOn3Plus: 9,
  },
  {
    name: 'heavy-vehicle',
    range: [9, 10],
    description: 'Heavy vehicles and large monsters',
    examples: 'Leman Russ, Repulsor, Tyrannofex, Hive Tyrant',
    woundsOn2Plus: 20,
    woundsOn3Plus: 11,
  },
  {
    name: 'super-heavy',
    range: [11, 12],
    description: 'Super-heavy vehicles and greater daemons',
    examples: 'Land Raiders, Knights, Baneblade, Wraithknight',
    woundsOn2Plus: 24,
    woundsOn3Plus: 13,
  },
  {
    name: 'titanic',
    range: [13, 99],
    description: 'Titanic units — only the heaviest weapons wound reliably',
    examples: 'Warlord Titans, some fortifications',
    woundsOn2Plus: 26,
    woundsOn3Plus: 14,
  },
]

export interface StrengthTier {
  name: string
  range: [number, number]
  description: string
  /** What toughness tiers this wounds on 2+, 3+, 4+ */
  woundsOn2Plus: string
  woundsOn3Plus: string
  woundsOn4Plus: string
}

export const STRENGTH_TIERS: StrengthTier[] = [
  {
    name: 'anti-light',
    range: [3, 4],
    description: 'Standard anti-infantry — bolters, lasguns, basic melee',
    woundsOn2Plus: 'T2 (gretchin)',
    woundsOn3Plus: 'T3 (guard, eldar)',
    woundsOn4Plus: 'T4 (marines)',
  },
  {
    name: 'anti-infantry',
    range: [5, 6],
    description: 'Enhanced anti-infantry — heavy bolters, power weapons',
    woundsOn2Plus: 'T3 (guard, eldar)',
    woundsOn3Plus: 'T4-5 (marines, heavy infantry)',
    woundsOn4Plus: 'T5-6 (gravis, custodes)',
  },
  {
    name: 'anti-elite',
    range: [7, 8],
    description: 'Anti-elite / light anti-vehicle — plasma, melta (low)',
    woundsOn2Plus: 'T4 (marines)',
    woundsOn3Plus: 'T6-7 (custodes, light vehicles)',
    woundsOn4Plus: 'T7-8 (dreadnoughts)',
  },
  {
    name: 'anti-vehicle',
    range: [9, 12],
    description: 'Anti-vehicle — lascannons, melta, heavy melee',
    woundsOn2Plus: 'T5-6 (heavy infantry, custodes)',
    woundsOn3Plus: 'T8-10 (vehicles, monsters)',
    woundsOn4Plus: 'T9-12 (heavy vehicles, knights)',
  },
  {
    name: 'anti-titanic',
    range: [13, 99],
    description: 'Anti-titanic — volcano lances, macro weapons',
    woundsOn2Plus: 'T7+ (most vehicles)',
    woundsOn3Plus: 'T12+ (super-heavies)',
    woundsOn4Plus: 'T13+ (titans)',
  },
]

export interface SaveTier {
  name: string
  save: number        // the characteristic (2, 3, 4, 5, 6)
  description: string
  /** AP needed to degrade to 4+ (the "break even" point) */
  apBreakpoint: number
}

export const SAVE_TIERS: SaveTier[] = [
  { name: 'heavy-armour', save: 2, description: '2+ save — needs AP-1+ to degrade, AP-4 to seriously threaten', apBreakpoint: 2 },
  { name: 'power-armour', save: 3, description: '3+ save — standard elite save, AP-1 brings to 4+', apBreakpoint: 1 },
  { name: 'medium-armour', save: 4, description: '4+ save — moderate protection, already at the break point', apBreakpoint: 0 },
  { name: 'light-armour', save: 5, description: '5+ save — minimal protection, AP is mostly wasted', apBreakpoint: -1 },
  { name: 'no-armour', save: 6, description: '6+ or worse — effectively no save, AP irrelevant', apBreakpoint: -2 },
]

/**
 * Invulnerable save analysis.
 * The invuln caps effective save, making AP above a certain value wasted.
 * For example: 3+ save with 4++ invuln → AP-2 gets you to 5+ (below invuln),
 * but AP-3 would get you to 6+ which is worse than the 4++ invuln,
 * so the model uses the 4++ instead. AP-2 is the "useful AP cap".
 */
export function usefulApCap(baseSave: number, invuln: number): number {
  // AP that would degrade base save to exactly the invuln value
  // Beyond this, extra AP is wasted because invuln kicks in
  return baseSave - invuln
}

/** Get the save tier for a given save characteristic. */
export function getSaveTier(save: number): SaveTier | undefined {
  return SAVE_TIERS.find(t => t.save === save) ?? SAVE_TIERS[SAVE_TIERS.length - 1]
}

/** Get the toughness tier for a given toughness value. */
export function getToughnessTier(toughness: number): ToughnessTier | undefined {
  return TOUGHNESS_TIERS.find(t => toughness >= t.range[0] && toughness <= t.range[1])
}

/** Get the strength tier for a given strength value. */
export function getStrengthTier(strength: number): StrengthTier | undefined {
  return STRENGTH_TIERS.find(t => strength >= t.range[0] && strength <= t.range[1])
}

/** Calculate wound roll needed for a given S vs T. */
export function woundRollNeeded(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2
  if (strength > toughness) return 3
  if (strength === toughness) return 4
  if (strength * 2 <= toughness) return 6
  return 5
}

/** Calculate average damage per attack for a weapon against a target. */
export function avgDamagePerAttack(
  attacks: number,
  skill: number,     // BS/WS as the number needed (e.g., 3 for 3+)
  strength: number,
  toughness: number,
  ap: number,
  save: number,      // base save characteristic (e.g., 3 for 3+)
  damage: number,
  invuln?: number,   // invulnerable save (e.g., 4 for 4+)
): number {
  const hitProb = (7 - skill) / 6
  const woundNeeded = woundRollNeeded(strength, toughness)
  const woundProb = (7 - woundNeeded) / 6
  const modifiedSave = save + ap  // ap is positive (e.g., 4 for AP-4), makes save worse
  const effectiveSave = invuln ? Math.min(modifiedSave, invuln) : modifiedSave
  const saveProb = effectiveSave >= 2 ? (7 - effectiveSave) / 6 : 0
  const unsavedProb = 1 - saveProb

  return attacks * hitProb * woundProb * unsavedProb * damage
}
