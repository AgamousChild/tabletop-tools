# Game Tracker Data Model — Design Spec (PRELIMINARY)

> Status: **DRAFT — preliminary, for Micah's review.** Not locked.
> Grounded in `2026-05-26-11th-edition-game-flow.md` (creator transcripts) and consistent with the List + Versus models (configured-unit reuse, per-side primaries, no scratch rows, real names).

---

## 0. Principles carried in

- **Consumes the list model.** A side's army is a **`list`** of **`list_unit`** (configured units). Casualties/state reference `list_unit` — one unit definition everywhere.
- **No single game primary.** Each side has its **own** chosen primary (from the available pool) and scores its own. (per the flow-doc correction)
- **Per-half-turn, per-side, separate primary + secondary VP** — never a single score field.
- **Two sides per match** (`match_player`) so the model is symmetric and reusable by Tournament — even though Game Tracker is "you vs an opponent," the opponent is just the other `match_player`.
- **No scratch rows.** A `match` is a real saved game; nothing transient persisted.

---

## 1. Match + sides

```
match                       -- one tracked game
  id PK
  user_id FK -> user        -- the tracking user
  status                    -- 'setup' | 'in_progress' | 'complete'
  deployment_type           -- shared
  terrain_layout            -- shared
  available_primaries       -- the primary pool / mission pack in play (each side picks from this)
  attacker_side             -- which match_player is attacker
  first_turn_side           -- which match_player goes first
  result                    -- 'P1_WIN' | 'P2_WIN' | 'DRAW' (derived from final VP)
  date
  location
  tournament_id FK?         -- if part of a tournament (soft link / FK)
  pairing_id FK?            -- the tournament pairing this came from
  require_photos
  created_at
  closed_at

match_player                -- exactly two per match (you + opponent)
  id PK
  match_id FK -> match
  seat                      -- 'P1' | 'P2'  (P1 = the tracking user by convention)
  is_you
  list_id FK?  -> list      -- the army (configured units). nullable: opponent may be partial
  faction                   -- denormalized (used when no full list, esp. opponent)
  detachment                -- denormalized
  primary_mission_id        -- the side's CHOSEN primary (from match.available_primaries)
  is_attacker
  goes_first
  final_primary_vp          -- snapshot at game end
  final_secondary_vp
  paint_score
```

---

## 2. Rounds & turns

11th: game = up to **5 battle rounds**; each battle round = **two player turns**. Scoring happens per turn at the mission's windows (end of command phase / end of turn / end of round).

```
round                       -- a battle round
  id PK
  match_id FK -> match
  round_number              -- 1..5

turn                        -- one player's turn within a round (the "half-turn")
  id PK
  round_id FK -> round
  active_player_id FK -> match_player   -- whose turn
  primary_vp                -- scored THIS turn (against the active player's own primary)
  secondary_vp              -- scored THIS turn
  cp_start, cp_gained, cp_spent         -- active player's CP economy for the turn
  photo_url
  notes
  created_at
```

---

## 3. CP, stratagems, secondaries

```
stratagem_use               -- one stratagem firing (incl. REACTIVE on the opponent's turn)
  id PK
  turn_id FK -> turn        -- the turn during which it fired
  used_by_id FK -> match_player   -- WHO used it (may be the non-active player — Overwatch, etc.)
  stratagem_name
  cp_cost
  phase

match_secondary             -- a side's secondary cards across the game
  id PK
  match_player_id FK -> match_player
  card_name                 -- e.g. 'Engage on All Fronts', 'Bring It Down', 'Cleanse'
  drawn_round
  status                    -- 'active' | 'scored' | 'discarded'   (discarded = ditched for CP / New Orders swap)
  vp_scored
  scored_round
```

Notes (from flow doc): secondaries are **2 drawn per turn, unbounded hand**, can be kept / scored / discarded-for-CP / swapped via New Orders. CP includes reactive spends during the opponent's turn — hence `stratagem_use.used_by_id` is independent of the turn's active player.

---

## 4. Casualties & board state

```
unit_casualty               -- units LOST and units DESTROYED (many objectives compare the two)
  id PK
  turn_id FK -> turn
  owner_id FK -> match_player        -- whose unit
  list_unit_id FK? -> list_unit      -- which configured unit (nullable if opponent untracked)
  unit_name                          -- denormalized fallback
  kind                               -- 'LOST' | 'DESTROYED'
  destroyed_by_unit_id FK? -> list_unit   -- who killed it (optional)

objective_state             -- per-round board control at a scoring window
  id PK
  round_id FK -> round
  match_player_id FK -> match_player
  objectives_controlled              -- count (or JSON of marker ids controlled)
  oc_on_contested                    -- optional, for tie-breaks
```

---

## 5. Persistent per-unit token state (OPEN — see §7)

11th leans hard on persistent tokens (battle-shock, hidden, marked/auspex, in-progress actions, sticky objectives). Candidate:

```
unit_state
  id PK
  match_player_id FK -> match_player
  list_unit_id FK -> list_unit
  state_key                 -- 'battle_shock' | 'hidden' | 'marked' | 'action_in_progress' | 'sticky_objective'
  value                     -- e.g. action name, target id
  since_round
```

Flagged as open because it borders on transient state — decide how much of in-game token state the tracker should persist vs hold in UI memory.

---

## 6. What this replaces / fixes (vs current `matches`/`turns`)

- `matches.mission` (single) → **per-side `primary_mission_id`** + a shared `available_primaries` pool.
- `your_*` / `their_*` columns crammed onto `matches`/`turns` → symmetric **`match_player`** + per-turn rows.
- `your_units_lost` / `their_units_lost` JSON blobs → **`unit_casualty`** rows (LOST vs DESTROYED, by unit).
- `match_secondaries.vp_per_round` JSON → kept, but reconciled with per-turn `secondary_vp` and per-card `match_secondary`.
- `stratagem_log` → `stratagem_use` with `used_by_id` (captures reactive spends).
- Army = a `list` of `list_unit`s, not free-text — casualties/state reference the real configured units.

---

## 7. Open questions (for review)

1. **Per-unit token state (§5):** persist it, or keep live token state in UI and only persist round-boundary snapshots? (transient-state rule tension)
2. **Opponent granularity:** require the opponent's full `list` (configured units), or allow faction/detachment + free unit names when you don't have their list?
3. **Scoring windows:** model the exact window (end-of-command / end-of-turn / end-of-round) on `turn`, or just record VP deltas per turn?
4. **Objectives:** count of controlled markers vs explicit marker ids + OC — how much board state to capture?
5. **Mission VP rules:** the published Chapter Approved primary/secondary values aren't pinned yet (batreps were custom) — do we encode mission scoring rules as data, or just record the VP the user enters?
6. **Paint/soft scores + tournament tie-breaks:** confirm what feeds the tournament side.
