# apps/versus/client/src/lib/rules/pipeline.ts

> The core simulation engine — resolves Warhammer 40K combat mathematically and via Monte Carlo.

## Prompt

Write the complete Warhammer 40K 10th Edition combat simulation engine. This is a pure math module with zero dependencies beyond the `WeaponAbility` and `WeaponProfile` types from `@tabletop-tools/game-content`. It runs client-side in the browser.

The engine has two modes:
1. **Analytical (expected value)**: Calculates exact expected outcomes using probability
2. **Monte Carlo**: Rolls thousands of simulated combats to produce a damage distribution with percentiles

### Dice helpers

**`resolveAttacks(attacks: number | string): number`** — Parse dice notation (D6, 2D6, D3+1, etc.) to expected average value. Flat numbers pass through. Use regex `/^(\d*)D(\d+)([+-]\d+)?$/i`.

**`resolveMin(value)` / `resolveMax(value)`** — Same parsing but return min/max possible value. Min: count + modifier (floor 1). Max: count × sides + modifier.

### Wound target table

**`woundTarget(strength, toughness): number`** — Standard 40K wound roll table:
- S >= 2×T → 2+
- S > T → 3+
- S == T → 4+
- T < 2×S → 5+
- T >= 2×S → 6+

### Hit resolution

**`resolveHits(attacks, skill, abilities): HitResult`** — Returns `{ normalHits, lethalHits }`.

Processing order:
1. **TORRENT**: auto-hit all attacks, return immediately
2. **HIT_MOD**: adjust effective skill (clamp 2-6)
3. Calculate base hit rate: `(7 - effectiveSkill) / 6`
4. **REROLL_HITS**: `hitRate + missRate × hitRate` (reroll all misses)
5. **REROLL_HITS_OF_1**: `hitRate + (1/6) × hitRate` (reroll natural 1s)
6. Track six-rate separately (for LETHAL/SUSTAINED triggers on unmodified 6s)
7. **LETHAL_HITS**: 6s become auto-wounds (go to `lethalHits`, removed from `normalHits`)
8. **SUSTAINED_HITS N**: each 6 generates N extra `normalHits`

### Wound resolution

**`resolveWounds(normalHits, lethalHits, S, T, abilities, defenderKeywords?): WoundResult`** — Returns `{ wounds, mortals }`.

1. Calculate wound target from S vs T
2. **WOUND_MOD**: adjust effective target (clamp 2-6)
3. **ANTI-[keyword] X+**: if defender has matching keyword, use lower of normal target or anti value
4. Calculate base wound rate
5. **REROLL_WOUNDS / TWIN_LINKED**: `woundRate + missRate × woundRate`
6. **DEVASTATING_WOUNDS**: 6s to wound become mortal wounds (bypass saves), tracked in `mortals`
7. `lethalHits` are auto-wounds — add directly to `wounds` (they already bypassed hit/wound rolls)

### Save resolution

**`effectiveSave(save, ap, invulnSave?): number`** — AP modifies armor save (AP is stored as negative, e.g., -2). Compare modified armor vs invuln, take the better (lower). Cap at 7 (impossible to save).

**`resolveSaves(wounds, mortals, ap, save, invulnSave?, fnp?): number`** — Returns total damage dealt. `mortals` bypass armor/invuln saves but are subject to FNP. FNP check: `(7 - fnp) / 6` pass rate.

### Monte Carlo simulation

Implement `rollD6()`, `rollDice(notation)` helpers using `Math.random()`.

**`mcRollHits`**, **`mcRollWounds`**, **`mcRollSaves`** — Dice-rolling versions of the analytical functions. Key difference: DEVASTATING_WOUNDS in Monte Carlo converts to mortal wounds equal to the weapon's rolled damage (not 1).

**`mcRollRawDamage`** — Like mcRollSaves but returns raw damage without HP cap (used for per-weapon breakdown).

**`runMonteCarlo(weapons[], defenderStats, iterations=5000, ...): DistributionData`** — Run `iterations` full combats with all weapons firing. When `characterProfile` is provided, implement Precision targeting: Precision weapons damage the character first (bypassing Look Out, Sir), non-Precision weapons damage bodyguards first. Track two HP pools: `bodyguardHp` and `characterHp`.

Return a `DistributionData` with:
- `histogram: Map<number, number>` — damage → frequency
- `percentiles: { p10, p25, median, p75, p90 }`
- `mean: number`
- `iterations: number`

### Per-weapon analytical simulation

**`simulateWeapon(weapon, defenderStats, attackerModelCount?): SimResult`** — Full analytical pipeline for one weapon. Applies: BLAST (min 3 attacks vs 6+ models), ATTACKS_MOD, STRENGTH_MOD, TOUGHNESS_MOD, MELTA bonus. Returns `{ expectedWounds, expectedModelsRemoved, survivors, worstCase, bestCase }`.

Best/worst cases use the through-rate (fail save × fail FNP probability) applied to max/min damage rolls.

### Exported types

```typescript
interface HitResult { normalHits: number; lethalHits: number }
interface WoundResult { wounds: number; mortals: number }
interface DistributionData { histogram: Map<number, number>; percentiles: {...}; mean: number; iterations: number }
interface CharacterProfile { wounds: number; save: number; invulnSave?: number; fnp?: number }
interface SimResult { expectedWounds: number; expectedModelsRemoved: number; survivors: number; worstCase: {...}; bestCase: {...} }
```

## Dependencies

- `@tabletop-tools/game-content` — `WeaponAbility`, `WeaponProfile` (types only)

## Key design decisions

- The engine is client-side only — no Node.js dependencies, no server calls
- Analytical mode gives exact expected values; Monte Carlo gives distributions
- All weapon abilities are handled via discriminated union type guards (`.filter((a): a is {...} => a.type === '...')`)
- Model counts multiply attacks (each model fires the weapon independently)
- Monte Carlo defaults to 5000 iterations — good balance of speed and accuracy
