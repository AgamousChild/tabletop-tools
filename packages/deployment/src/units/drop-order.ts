import type { DeploymentUnit, TacticalRole } from '../types'

// ── Priority Tiers ────────────────────────────────────────────────────────────
//
// Lower tier number = deploy earlier (reveals less strategic intent).
// Tier 7 groups hammer + counter-charge together — both are reactive melee pieces.
// Tier 8 = infiltrators (react to enemy setup after most is known).
// Tier 9 = deep-strike (held in reserves — listed last as a convention).
// Tier 10 = scouts (deploy in zone but pre-game move destination matters — place late).

const TIER: Record<TacticalRole, number> = {
  holder: 1,
  transport: 2,
  screen: 3,
  gunline: 4,
  'mid-range-shooter': 5,
  anchor: 6,
  hammer: 7,
  'counter-charge': 7,
  infiltrator: 8,
  'deep-strike': 9,
  scout: 10,
}

const DEFAULT_TIER = 3 // unrecognised role → treat like a screen

function tierOf(unit: DeploymentUnit): number {
  if (unit.tacticalRole === undefined) return DEFAULT_TIER
  return TIER[unit.tacticalRole] ?? DEFAULT_TIER
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sort units by deployment drop order.
 * Returns an array of unit IDs: first in array = first to deploy.
 * Within the same priority tier, cheaper units deploy first (less to reveal).
 */
export function computeDropOrder(units: DeploymentUnit[]): string[] {
  return [...units]
    .sort((a, b) => {
      const tierDiff = tierOf(a) - tierOf(b)
      if (tierDiff !== 0) return tierDiff
      return a.points - b.points
    })
    .map((u) => u.id)
}
