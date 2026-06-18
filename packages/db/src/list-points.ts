/**
 * Pure-TypeScript points-derivation engine for list_unit.
 * No DB calls — receives pre-loaded cost data and computes points.
 * Shared between server-side router and client-side editor preview.
 *
 * Formula:
 *   list_unit.points = unit_cost(datasheet, total_models)
 *                    + Σ(loadout wargear_option costs)
 *                    + enhancement.points
 *
 * See docs/superpowers/specs/2026-05-26-list-data-model-design.md §4
 */

/** Base cost for a unit at a given model count, per dataslate. */
export interface UnitCostRecord {
  datasheetId: string
  dataslateId: string
  modelCount: number
  points: number
}

/** Per-weapon cost per model, per dataslate. */
export interface WargearOptionRecord {
  datasheetId: string
  dataslateId: string
  weaponId: string
  points: number
}

/** Enhancement cost (detachment-scoped, no FK lookup needed here). */
export interface EnhancementRecord {
  id: string
  points: number
}

/** An in-memory loadout group: N models sharing one set of weapons. */
export interface InMemoryLoadout {
  modelCount: number
  weapons: Array<{ weaponId: string; count: number }>
}

/** Full input to derive a single list_unit's points. */
export interface PointsDerivationInput {
  datasheetId: string
  dataslateId: string
  loadouts: InMemoryLoadout[]
  enhancementId?: string
  /** All unit_cost records for this datasheet + dataslate (may include multiple model bands). */
  unitCosts: UnitCostRecord[]
  /** All wargear_option records for this datasheet + dataslate. */
  wargearOptions: WargearOptionRecord[]
  enhancements: EnhancementRecord[]
}

/**
 * Derive points for a single list_unit.
 *
 * Band costing: picks the UnitCostRecord with the largest modelCount <= totalModels.
 * Returns 0 gracefully if no matching cost record exists (missing cost data).
 */
export function deriveListUnitPoints(input: PointsDerivationInput): number {
  const {
    datasheetId,
    dataslateId,
    loadouts,
    enhancementId,
    unitCosts,
    wargearOptions,
    enhancements,
  } = input

  const totalModels = loadouts.reduce((sum, l) => sum + l.modelCount, 0)

  // Band costing: find the largest record where modelCount <= totalModels
  const relevantCosts = unitCosts
    .filter(
      (c) =>
        c.datasheetId === datasheetId &&
        c.dataslateId === dataslateId &&
        c.modelCount <= totalModels,
    )
    .sort((a, b) => b.modelCount - a.modelCount)

  if (relevantCosts.length === 0) return 0

  const baseCost = relevantCosts[0]!.points

  // Wargear cost: per weapon × count × models in loadout
  let wargearCost = 0
  for (const loadout of loadouts) {
    for (const weapon of loadout.weapons) {
      const option = wargearOptions.find(
        (w) =>
          w.datasheetId === datasheetId &&
          w.dataslateId === dataslateId &&
          w.weaponId === weapon.weaponId,
      )
      if (option) {
        wargearCost += option.points * weapon.count * loadout.modelCount
      }
    }
  }

  // Enhancement cost
  const enhancementCost = enhancementId
    ? (enhancements.find((e) => e.id === enhancementId)?.points ?? 0)
    : 0

  return baseCost + wargearCost + enhancementCost
}

/**
 * Derive total_points for a list as Σ deriveListUnitPoints across all units.
 */
export function deriveListTotalPoints(unitInputs: PointsDerivationInput[]): number {
  return unitInputs.reduce((sum, u) => sum + deriveListUnitPoints(u), 0)
}
