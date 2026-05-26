# Versus Data Model — Design Spec

> Status: **approved** (design locked in brainstorming session, 2026-05-26)
> Scope: the Versus combat simulator's data model. Replaces the single `simulations` blob table.

---

## 1. Problem

The Versus simulator stores each run as **one `simulations` row** with structured data crammed into JSON `TEXT` columns:

- `result` — a JSON blob of 7 fixed metrics
- `weapon_config` — an opaque JSON blob (selected weapons + rules + model counts + leader)
- `config_hash` — a hash workaround that exists only because the config can't be queried
- `attacker_content_id` / `defender_content_id` — string refs to content not in the database

Consequences: nothing about a run is queryable (can't filter by weapon, ability, stat, or metric), and — the headline bug — the **total attack/shot count has been unreliable**: the same unit would simulate 1, 5, or 10 weapons inconsistently because the model-count factor was being dropped.

---

## 2. Content model (referenced)

Versus reads game content. These content tables are **shared platform content** and belong to the broader content-model redesign; they are defined here as what Versus consumes.

Weapons are **datasheet-scoped**. The same weapon *name* has different profiles across units — evidence from current data (Space Marines): `Power weapon` = 7 distinct profiles, `Close combat weapon` = 7, `Thunder hammer` = 5, `Power fist` = 4. A weapon means nothing without its unit. Weapon IDs already encode this (`weapon:{datasheetId}:{slug}`).

```
datasheet (the unit)
  id PK
  faction_id FK
  name
  M, T, Sv, W, invuln, OC

weapon
  id PK
  datasheet_id FK -> datasheet
  name            -- NOT unique across units

ranged_profile
  id PK
  weapon_id FK -> weapon
  name            -- e.g. "Supercharge"
  range
  A               -- Attacks (may be a dice expression)
  BS              -- Ballistic Skill
  S               -- Strength
  AP              -- Armor Penetration
  D               -- Damage

melee_profile
  id PK
  weapon_id FK -> weapon
  name            -- e.g. "Strike"
  A               -- Attacks
  WS              -- Weapon Skill
  S               -- Strength
  AP              -- Armor Penetration
  D               -- Damage

profile_ability                 -- the INDICATORS, per profile
  id PK
  profile_kind    -- 'ranged' | 'melee'
  profile_id      -- -> ranged_profile | melee_profile
  key             -- e.g. SUSTAINED_HITS, LETHAL_HITS, TORRENT
  value           -- e.g. "1"

unit_ability                    -- the INDICATORS, per datasheet
  id PK
  datasheet_id FK -> datasheet
  name
  key
  value
```

### Content rules (locked)

- **WS (Weapon Skill, melee), BS (Ballistic Skill, ranged), and S (Strength) are three distinct stats.** Never merge WS/BS into one field; never collapse them into a generic "skill"; never confuse them with S.
- `BS` lives **only** on `ranged_profile`; `WS` lives **only** on `melee_profile`. No nullable hit stat, no field "applicable to both".
- A weapon may have **0..N ranged profiles AND 0..N melee profiles** (standard/supercharge, combi-weapons that are both ranged and melee, etc.). WS and BS for the same weapon can differ — they live on different profiles.
- `profile_ability` / `unit_ability` are **indicators**, not effects. They are read at sim time and resolved into `simulation_modifier` rows.

---

## 3. Simulation tables (Versus-owned)

```
simulation                      -- one row per run; headline result as REAL COLUMNS
  id PK
  user_id FK -> user
  label                         -- optional, user-given
  attacker_datasheet_id FK -> datasheet
  attacker_models
  leader_datasheet_id FK -> datasheet   -- nullable
  defender_datasheet_id FK -> datasheet
  defender_models
  data_version                  -- which dataslate produced this result
  expected_wounds
  expected_models_removed
  survivors
  worst_wounds, worst_models
  best_wounds,  best_models
  created_at

simulation_weapon               -- one row per weapon profile fired
  id PK
  simulation_id FK -> simulation
  profile_kind                  -- 'ranged' | 'melee'
  profile_id                    -- -> ranged_profile | melee_profile (the exact profile fired)
  model_count                   -- models firing this profile
  weapons_per_model             -- usually 1
  attacks_per_weapon            -- A, resolved (dice -> expected value)
  total_attacks                 -- = model_count * weapons_per_model * attacks_per_weapon  (STORED)
  expected_wounds               -- this profile's contribution
  expected_models_removed

simulation_modifier             -- resolved effects active in this run
  id PK
  simulation_id FK -> simulation
  side                          -- 'ATTACK' | 'DEFENSE'
  source                        -- 'weapon' | 'unit' | 'stratagem' | 'manual' | 'defensive'
  key                           -- e.g. sustained_hits, cover, fnp, reroll_hits
  value                         -- e.g. "1", "5+", "+1"
```

---

## 4. Invariants (MUST be test-enforced)

1. **Attack count is exact.** For every `simulation_weapon` row:
   `total_attacks == model_count * weapons_per_model * attacks_per_weapon`.
   This is the recurring bug — the model-count factor was being dropped. Storing every factor *and* the product, and asserting the equality in tests, makes it impossible to regress silently.
2. `attacks_per_weapon` = the **expected value** of the profile's `A` (D6→3.5, 2D3→4, D6+1→4.5, fixed→itself).
3. `BS` only on `ranged_profile`; `WS` only on `melee_profile`.
4. Every `simulation_modifier` has a `source`.

### Worked attack-count examples
| Unit | model × weapons/model × A | total |
|---|---|---|
| 10 Intercessors · Bolt rifle (A2) | 10 × 1 × 2 | 20 |
| 5 Intercessors · Bolt rifle (A2) | 5 × 1 × 2 | 10 |
| 3 Aggressors · 2× gauntlet (A: D6→3.5) | 3 × 2 × 3.5 | 21 |
| 1 Captain · Power fist (A5 melee) | 1 × 1 × 5 | 5 |

---

## 5. Resolution flow (abilities → modifiers)

```
profile_ability + unit_ability + active toggles (stratagems, detachment rules,
  cover, FNP, ±hit)
        |  resolved at sim time
        v
simulation_modifier rows  ->  applied to the math
```

- The ability is the **indicator** (it lives on the profile/unit). The modifier is the **applied effect** (the per-run record of what hit the math).
- `RAPID FIRE` / `BLAST` and similar **add** attacks. They ride through `simulation_modifier` and adjust `total_attacks` — but only after the base `model_count × weapons_per_model × A` is correct.

---

## 6. What this removes

| Old | New |
|---|---|
| `result` JSON blob | metric columns on `simulation` |
| `weapon_config` JSON blob | `simulation_weapon` + `simulation_modifier` rows |
| `config_hash` | gone (optional cache key only) |
| string `*_content_id` | FKs to `datasheet` / weapon profiles |

---

## 7. Open / deferred decisions

- **Content refs as FK vs string IDs** — depends on the broader content-model redesign (the canonical content tables). Recommendation: real FKs.
- **Reproducibility** — `data_version` stamp (recommended) vs a full stat snapshot per run (deferred; YAGNI for a personal tool).
- **Bidirectional melee** (defender also deals damage) — deferred. Would add `side` to `simulation_weapon` + defender-result columns.
- **Polymorphic profile reference** (`profile_kind` + `profile_id`) — accepted as the cost of keeping ranged and melee profiles in separate tables.

---

## 8. Test plan

- Attack-count invariant (§4.1) over representative units: 5-model, 10-model, multi-weapon, dice-`A`, multi-profile (ranged+melee on one weapon).
- `A`-expectation parser: D6, 2D3, D6+1, fixed values.
- Modifier resolution: sustained hits, lethal hits, devastating wounds, RAPID FIRE adding attacks, cover/FNP on the defense side.
