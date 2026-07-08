import { describe, expect, it } from 'vitest'

import { BATTLE_SIZES } from './armyRules'

// validateArmy behavior tests moved to
// packages/game-content/src/rules/army-validation.test.ts — the engine now
// lives there so both client and server can import it (W2 roadmap Phase 2,
// list-builder verdict §2a). This file keeps only the client-local
// BATTLE_SIZES data and the re-export wiring.
describe('BATTLE_SIZES', () => {
  it('has 4 battle sizes', () => {
    expect(BATTLE_SIZES).toHaveLength(4)
  })

  it('Incursion is 500pts with max 1 duplicate', () => {
    expect(BATTLE_SIZES[0]).toMatchObject({ points: 500, maxDuplicates: 1 })
  })

  it('Strike Force 2000 has max 3 duplicates', () => {
    expect(BATTLE_SIZES[2]).toMatchObject({ points: 2000, maxDuplicates: 3 })
  })
})
