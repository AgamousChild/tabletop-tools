// Army validation engine lives in @tabletop-tools/game-content so both the
// client and the server (Phase 3 hard-gate) can import it. Imported from the
// browser-safe /rules subpath — the package's root barrel pulls in Node-only
// BSData adapters and would break Vite's browser build.
export type { BattleSize, ListUnit, ValidationError } from '@tabletop-tools/game-content/rules'
export { validateArmy } from '@tabletop-tools/game-content/rules'

import type { BattleSize } from '@tabletop-tools/game-content/rules'

// Canonical battle-size data. Hardcoded here today; a `battle_size` DB table
// is being introduced separately (W2 roadmap Phase 2/3) — once it lands,
// this constant is replaced by a query and callers are unaffected because
// validateArmy takes BattleSize as a parameter, not an import.
export const BATTLE_SIZES: BattleSize[] = [
  { name: 'Incursion', points: 500, maxDuplicates: 1, description: 'Small-scale skirmish' },
  { name: 'Strike Force', points: 1000, maxDuplicates: 2, description: 'Standard matched play' },
  { name: 'Strike Force', points: 2000, maxDuplicates: 3, description: 'Tournament standard' },
  { name: 'Onslaught', points: 3000, maxDuplicates: 3, description: 'Large-scale battle' },
]
