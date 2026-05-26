# List Data Model — Design Spec

> Status: **approved** (locked in brainstorming session, 2026-05-26)
> Scope: the list-builder data model — TTT package **Layers 1–2** (Meta + List), normalized.
> The `list_unit` ("configured unit") defined here is the **shared unit definition** consumed by Versus, Game Tracker, and Tournament. The list builder is built from this spec.

---

## 1. Context

A list is a TTT package (see `docs/superpowers/plans/2026-04-30-ttt-list-format.md`). This spec covers the **persisted core** — Meta + List. Layers 3–7 (Rules, TTS, BOM, PDF, Exports) are enriched/generated on demand and are not persisted here.

Targets **11th edition**. Four 11th-edition realities shape the model:
1. **Loadouts cost points** (per-loadout costs are back) → points are derived, never a flat field.
2. A unit can attach **a Leader and a Support Character** (up to two).
3. **Attachments are declared in the list** (build time), not at battle time.
4. **A Leader/Support character's abilities are always active** regardless of whether it is leading — attachment only scopes the buff.

---

## 2. Content referenced (shared; dataslate-versioned cost layer)

Defined by the content model (R2-resident, referenced by ID). The **cost layer is versioned per dataslate**.

```
datasheet (unit)        id, faction_id, name, M, T, Sv, W, Ld, OC, invuln
weapon                  id, datasheet_id, name            -- datasheet-scoped
ranged_profile          id, weapon_id, range, A, BS, S, AP, D     (see Versus spec)
melee_profile           id, weapon_id, A, WS, S, AP, D            (see Versus spec)
enhancement             id, detachment_id, name, points, effect
faction / subfaction / detachment   (selection dims)
can_lead                leader_datasheet_id -> bodyguard_datasheet_id   -- which characters CAN lead which units

unit_cost               id, datasheet_id, dataslate_id, model_count, points   -- base cost by size, per dataslate
wargear_option          id, datasheet_id, dataslate_id, weapon_id, points     -- per-loadout cost, per dataslate
```

---

## 3. List tables (user data, relational)

```
list                         -- TTT Meta + selection
  id PK
  user_id FK -> user
  name
  author?
  edition                    -- '10th' | '11th'
  faction_id FK
  subfaction_id FK?
  detachment_id FK
  battle_size                -- Combat Patrol | Incursion | Strike Force | Onslaught | unknown
  total_points               -- SAVED snapshot (see §4)
  dataslate_id FK            -- the dataslate this list is costed under
  source                     -- 'list-builder' | 'bcp-import' | ...
  created_at
  updated_at

list_unit                    -- THE CONFIGURED UNIT (shared with Versus/Game Tracker/Tournament)
  id PK
  list_id FK -> list         -- NOT NULL: a row exists only inside a real list (no scratch rows)
  datasheet_id FK -> datasheet
  enhancement_id FK?         -> enhancement
  is_warlord
  points                     -- SAVED snapshot for this unit
  attached_to_unit_id FK?    -> list_unit   -- if a Character: its bodyguard (self-ref)
  attach_role?               -- 'leader' | 'support'   (<=1 leader + <=1 support per bodyguard)

list_unit_loadout            -- a model group: N models sharing one loadout (TTT modelLoadouts)
  id PK
  list_unit_id FK -> list_unit
  model_count

list_unit_loadout_weapon     -- the weapons in that model group
  id PK
  loadout_id FK -> list_unit_loadout
  weapon_id FK -> weapon     -- a weapon of THIS unit's datasheet
  count                      -- weapons per model (usually 1)
```

---

## 4. Points: saved snapshot + contextual validity

The cost data (`unit_cost`, `wargear_option`) is the **points layer**, versioned per dataslate. Points are **derived**, then **saved as a snapshot**:

```
list_unit.points  = unit_cost(datasheet, total models) + Σ(loadout wargear_option costs) + enhancement.points
list.total_points = Σ list_unit.points
```

The list stores the snapshot **+ its date + the `dataslate_id` it was costed under**.

**Validity is contextual and derived — there is NO `is_valid` column:**

| Context | Behavior |
|---|---|
| **Editor** (incl. list-of-lists *in* the editor) | On every view, **recompute** points against the **current** dataslate. Where it differs from the saved snapshot, show the diff in **red**. The list is **invalid until re-processed** (re-costed + re-saved under the current dataslate). |
| **Read-only** (tournament viewer, Versus, any data-only consumer) | The saved snapshot is **authoritative — valid as-is**. No recompute. The saved date + `dataslate_id` are **context** ("legal under the March dataslate"), not re-validation. |

---

## 5. Attachments (Leader + Support)

- Self-referential on `list_unit`: a Character `list_unit` points at its bodyguard via `attached_to_unit_id` + `attach_role` (`leader` | `support`).
- A bodyguard may have **≤1 Leader and ≤1 Support** attached.
- **Declared in the list at build time** — every downstream consumer reads it; none sets it.
- Gated by the content `can_lead` ref (which characters *may* lead which units).
- (If a third attachment type ever appears, promote to a `list_unit_attachment` table — no data migration needed.)

---

## 6. Abilities (resolution-layer)

A Leader/Support character's abilities are **always active** — never gated on attachment. In any consumer that resolves abilities into effects (Versus modifiers, Game Tracker, Brain analysis), a character's abilities always fire; the attachment only determines **scope** (the combined unit if attached, itself if solo). No "applies-while-leading" flag in the model.

---

## 7. Transient vs persisted (no scratch rows)

- The configured unit is a **shared shape**. Ad-hoc use (e.g. an unsaved Versus sim) instantiates it **in memory** and discards it — **no rows**.
- `list_unit` rows exist **only inside a real list** (`list_id` NOT NULL).
- Persistence happens **only on explicit save** — and the unit is saved into a **real list**, not a scratch container.

---

## 8. Shared with Versus / Game Tracker / Tournament

`list_unit` (+ its loadout + attachments) **is** the unit definition everywhere. Versus references `list_unit` as attacker/defender; its loadout drives the attack-count math; its attachments bring the Leader/Support weapons + buffs. No app re-defines a unit. (See the revised Versus spec.)

---

## 9. Test plan

- Points derivation: `list_unit.points` = base + loadouts + enhancement, against representative units (single loadout, sergeant split, enhancement, multi-loadout).
- Editor validity: snapshot vs current-dataslate recompute → drift flagged; re-process clears it.
- Read-only validity: a saved list under an old dataslate reads as valid with its stored snapshot.
- Attachment constraints: ≤1 leader + ≤1 support per bodyguard; `can_lead` respected.
- No-scratch-row invariant: ad-hoc sim creates zero `list_unit` rows.
