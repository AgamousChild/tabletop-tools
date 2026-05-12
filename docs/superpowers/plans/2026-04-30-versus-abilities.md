# Versus: Strat/Detachment/Ability Integration (#41)

## Goal

Combat simulator currently does pure math: hit → wound → save → damage. Needs to factor in stratagems, detachment rules, army rules, and unit abilities automatically.

## Current State

- `apps/versus/client/src/lib/rules/pipeline.ts` — pure math simulation
- User manually enters weapon stats, no ability awareness
- No detachment selection, no stratagem selection

## Design

### Unit Selection Flow

1. User picks faction (from game-data-store)
2. User picks detachment (filtered to faction)
3. User picks attacking unit (datasheet from game-data-store)
4. User picks defending unit (any faction)
5. UI shows available stratagems for the attacker's detachment
6. User toggles which stratagems/abilities are active
7. Simulation runs with all modifiers applied

### Ability Types to Handle

EXTEND the existing `WeaponAbility` union — do not replace it. Add new union members: `FEEL_NO_PAIN`, `INVULN_SAVE`, `LANCE`, `EXTRA_ATTACKS`. The existing 21 types remain unchanged. Stratagems and army rules inject into the same abilities array that weapons already use.

| Type | Example | Effect on Pipeline |
|---|---|---|
| TORRENT | Flamers | Auto-hit, no roll needed |
| TWIN_LINKED | Twin-linked weapons | Re-roll all wound rolls |
| BLAST | Blast weapons | Minimum 3 attacks vs 6+ models |
| REROLL_HITS_OF_1 | Various stratagems | Re-roll hit rolls of 1 |
| ANTI | Anti-Infantry 4+ | Wound crits on 4+ vs target keyword |
| MELTA | Melta X | +X damage within half range |
| PRECISION | Precision | Allocate wounds to non-leader models |
| ATTACKS_MOD | Various | +X / -X attacks |
| STRENGTH_MOD | Various | +X / -X strength |
| TOUGHNESS_MOD | Frenzied Resilience (WE) | +X / -X toughness |
| SUSTAINED_HITS | Martial Excellence (WE) | Add X hits per crit |
| LETHAL_HITS | Warp Blades (WE) | Crits auto-wound |
| DEVASTATING_WOUNDS | Decapitating Strikes (WE) | Wound crits bypass saves → mortal wounds |
| REROLL_HITS | Various | Re-roll failed/all hit rolls |
| REROLL_WOUNDS | Various | Re-roll failed/all wound rolls |
| HIT_MODIFIER | Beacons of Rage (Eightbound) | +1 / -1 to hit roll |
| WOUND_MODIFIER | Various | +1 / -1 to wound roll |
| DAMAGE_MODIFIER | Various | +X / -X to damage |
| AP_MODIFIER | Hack and Slash (WE) | Improve AP by X |
| FEEL_NO_PAIN | Disgustingly Resilient (DG) | Post-save damage reduction (new) |
| INVULN_SAVE | Various | Alternative save, not modified by AP (new) |
| LANCE | On charge, +1S | Modify strength on charge turn (new) |
| EXTRA_ATTACKS | Various | Bonus attacks (new) |

### Data Access Path

Versus client fetches ability data from the brain Worker via the gateway proxy at `/brain/api/browse/unit/:id` and `/brain/api/browse/detachment/:id`. These endpoints already exist and return structured node data.

The mapping from brain node content to `WeaponAbility` happens client-side with a parser that extracts known patterns from EFFECT text (e.g., `'Sustained Hits 1'` → `{ type: 'SUSTAINED_HITS', value: 1 }`). Unknown abilities show as toggleable text chips with no auto-simulation — manual entry fallback.

### Stacking Rules

- Hit/wound roll modifiers cap at +1/-1 total (per 40K core rules)
- Re-rolls happen before modifiers
- Invuln saves are not modified by AP
- Feel No Pain applies after damage is assigned
- Multiple sources of the same ability: use the best value (e.g., two sources of re-roll hits → re-roll all, not re-roll ones)

### Pipeline Modifiers

The `WeaponAbility` union is extended, not replaced. New members follow the same discriminated union pattern as existing types. Stratagems and army rules produce `WeaponAbility` values and are appended to the existing `abilities` array on the weapon stats object.

### UI

- **Attacker panel:** Unit card + toggleable ability/stratagem chips
- **Defender panel:** Unit card + toggleable defensive abilities
- **Results:** Same damage output chart but now shows "with abilities" vs "raw stats"

### Saved Simulation Results

Saved simulation result JSON must include: `active_abilities` array, `faction_id`, `detachment_id`. No DB migration needed — the `result` column is already `TEXT`/`JSON`.

### Default Ability State

Auto-detect abilities from datasheet via brain fetch. Manual toggle as override. Default: all datasheet abilities active, stratagems off (user toggles on).

## Estimated effort

16-24 hours total:
- Data access spike (brain fetch + ability parser): 4h
- Pipeline extension (new union members + modifier logic): 4h
- Ability text parser (EFFECT → WeaponAbility, 20+ known patterns): 4h
- UI (faction/detachment/unit selection + stratagem toggles): 4-6h
- Tests: 4h

## Test Plan

- Test modifier stacking interactions (cap at +1/-1 for hit/wound modifiers)
- Test each new ability type through the pipeline (FEEL_NO_PAIN, INVULN_SAVE, LANCE, EXTRA_ATTACKS)
- Mock brain fetch responses for UI tests
- Test ability text parser against 20 known stratagem EFFECT texts
