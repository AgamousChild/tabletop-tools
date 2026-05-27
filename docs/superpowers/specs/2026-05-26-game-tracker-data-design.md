# Game Tracker Data Model — Design Spec (PRELIMINARY)

> Status: **DRAFT — preliminary, for Micah's review.** Not locked.
> Grounded in **two** sources, integrated:
> 1. The **Tabletop Battles** app (10th-edition scoreboard — screenshots, the "very good" app we're copying). This is the proven, working **core**.
> 2. The **11th-edition creator transcripts** (`2026-05-26-11th-edition-game-flow.md`) — board state, destroyed units, token state.
> Consistent with the List + Versus models (configured-unit reuse, no scratch rows, real names).

---

## 0. What we model — the game as it is

We're copying **how game-tracking works**, not cloning a specific app. The Tabletop Battles app and the TTS on-screen tracker are two views of the same thing: **the state of a 40K game as it's played**. We model that game state; our own views read from it.

**One unified model — no "scoreboard vs extras" split.** The mission, the sides, the rounds, CP, the scoring, **and what's happening on the board** (units destroyed, units lost, token states) are all just parts of the same game state — recorded the same way, presented the same way. The board-state and destroyed-unit data are **not a feature that announces itself**; they're the game, the way CP and VP are the game. They feed meta analysis the same way scores do. No visual or conceptual difference between "the score" and "the board."

**One hard line stays:** scoring is **player-entered, not derived** from the board state. The player tells the tracker what they scored through each mission's own interface; we don't compute VP from tracked casualties/objectives (too far for now). Board state is recorded because it *is* the game and it's worth persisting — not to drive scoring.

How the game works (10th — the concrete target):
- One **shared** primary (a Mission card = primary + deployment + rule); per-side Tactical/Fixed secondaries.
- Scoring is **per round, per side**, capped **50 primary / 40 secondary / 10 battle-ready = 100**.
- 11th isn't fully known; where it diverges (per-side primaries) the seam exists, but 10th writes the shared value to both sides. No 11th-only speculation modeled yet.

Carried-in: consumes the list model (`list` / `list_unit`); **no scratch rows** (a `match` is a real saved game); real names. **Integration is the point** — lists flow in, results + game state flow out to new-meta, tournament links are first-class.

---

## 1. Match + sides + the Mission card

```
match                       -- one tracked game
  id PK
  user_id FK -> user        -- the tracking user
  status                    -- 'setup' | 'in_progress' | 'complete'
  mission_id FK -> mission   -- the chosen Mission CARD (primary + deployment + rule), or a 'custom' mission row
  attacker_side             -- which match_player is Defender/Attacker (roll-off: Defender picks side, deploys first)
  first_turn_side           -- which match_player takes the first turn
  conclusion                -- 'played_to_end' | 'conceded' | 'time' | ...  (app: "Game conclusion")
  result                    -- 'P1_WIN' | 'P2_WIN' | 'DRAW'; set out of process — individual: user picks; tournament: organizer picks; else DRAW. No tie-break logic.
  date
  location
  tournament_id FK?         -- if part of a tournament
  pairing_id FK?            -- the tournament pairing this came from
  require_photos
  paint_scoring             -- "paint scoring on?" toggle: player-set for individual games; tournament-set when part of one
  created_at
  closed_at

match_player                -- exactly two per match (you + opponent)
  id PK
  match_id FK -> match
  seat                      -- 'P1' | 'P2'  (P1 = the tracking user by convention)
  is_you
  list_id FK -> list        -- NOT NULL: the army (configured units). The opponent's list is recorded too — always available.
  faction                   -- denormalized display cache (derived from the list)
  detachment                -- denormalized display cache
  primary_mission_id FK -> primary_objective  -- 10th: SAME as the other side (shared, from match.mission). 11th seam: may diverge per side.
  secondary_mode            -- 'tactical' (draw random as the game goes) | 'fixed' (pick 2 up front)
  is_attacker
  goes_first
  battle_ready              -- "Army is Battle Ready" → +10 when paint_scoring is OFF (the app's default 10 free pts)
  paint_score               -- when paint_scoring is ON: the judged value; when OFF: 10 (free), via battle_ready
  final_primary_vp          -- snapshot at game end (≤ 50)
  final_secondary_vp        -- snapshot at game end (≤ 40)
```

### Mission card + its content (referenced; lives with the content model)

A 10th **Mission** is a bundled card: a **primary objective** + a **deployment** + a **mission rule** (e.g. "Mission H: Supply Drop, Hammer And Anvil"). "Custom" lets you pick the parts separately.

```
mission                     -- a Chapter Approved mission CARD (or 'custom')
  id PK
  name                      -- 'Mission H' | 'Custom'
  primary_objective_id FK -> primary_objective
  deployment_id FK -> deployment
  mission_rule              -- e.g. 'Tipping Point'

primary_objective           -- the shared primary, with its scoring object (§3)
  id PK
  name                      -- 'Supply Drop' | 'Purge The Foe' | ...
  cap                       -- 50
  -- its per-mission scoring interface is the scoring object in §3

deployment                  -- real content (the app shows the map)
  id PK
  name                      -- 'Hammer And Anvil'
  layout                    -- 'GW Chapter Approved 2025-26 Layout 7'
  objective_count           -- e.g. 5
  -- objective positions + measurements: content detail, modeled with the content model
```

---

## 2. Rounds (per side) + CP

The in-game screen is **per battle round, per side**: CP gained/spent, primary entry, secondary entries. The scoring grain is `round_player` (round × match_player) — which **is** the half-turn: one player's turn within a battle round (a battle round = two player turns). "Half-turn" and "per player per round" are the same thing.

```
round                       -- a battle round
  id PK
  match_id FK -> match
  round_number              -- 1..5

round_player                -- per side, per round (the app's round screen for one player)
  id PK
  round_id FK -> round
  match_player_id FK -> match_player
  cp_gained
  cp_spent
  -- net CP derives from gained/spent; scoring entries (§3) hang off this row

stratagem_use               -- which stratagems were fired (game state + strong meta data)
  id PK
  round_id FK -> round
  used_by_id FK -> match_player     -- who spent the CP (may be the NON-active player: Overwatch, reactive moves, …)
  active_side_id FK -> match_player -- whose turn it was used during
  stratagem_name
  cp_cost
  phase                             -- when in the turn
```

`cp_gained` / `cp_spent` stay the authoritative per-side per-round totals (not every CP spend is a stratagem). `stratagem_use` is the itemized detail — which stratagems fired, by whom, including reactive use on the opponent's turn (`used_by_id` ≠ `active_side_id`).

---

## 3. Scoring — per round, per side, per mission (capped)

Scoring is **player-selected via each mission's own interface**, recorded per `round_player`, and **capped** by the mission definition. The player's **selections are persisted** (not just the VP) — that's the meta data the standalone app discards.

```
score_event                 -- one mission's scoring for one side in one round
  id PK
  round_player_id FK -> round_player
  category                  -- 'primary' | 'secondary'
  mission_ref               -- the primary_objective, or the match_secondary card, scored
  vp                        -- resolved total for this mission this round (respects the mission cap)

score_selection             -- WHAT the player selected (normalized — no JSON blob)
  id PK
  score_event_id FK -> score_event
  element_key               -- 'objectives_controlled' | 'condition:more_objectives_than_opponent' | 'tier:4_quarters' | ...
  element_value             -- the count entered, or 1 for a ticked condition
  points                    -- the pts this element contributed
```

Caps: `primary_objective.cap` = 50; each secondary card has its own cap (Assassination 5, Bring It Down 4, …) and the per-side secondary total caps at 40; battle-ready/paint caps at 10. **Match totals derive from `score_event`, clamped to the caps** (`final_primary_vp`, `final_secondary_vp` are end-of-game snapshots).

### Mission scoring objects (each mission has its OWN specific interface) — validated by the app

Each mission — every **primary** and every **secondary** — is its own **scoring object** with a **mission-specific interface**: its own parameters, its own interface elements, its own scoring logic. **Primaries and secondaries are displayed and scored identically** — each opens the same kind of scoring view: a current/cap indicator (0/50, 0/5, 0/4 …) plus that mission's own interface elements. Scoring a secondary works exactly like scoring a primary — tap the card, the same view opens, the player selects the mode/params, and the result is recorded the same way (`score_event` + `score_selection`). There are **four distinct interface shapes** in play:

| Shape | Example | Interface | Persisted as |
|---|---|---|---|
| **Number stepper × per-round multiplier** | Supply Drop | enter "objectives in No Man's Land you control"; pts/obj scale by round (R2 5 · R3 5 · R4 8 · R5 15) | `score_selection(objectives_controlled, n, pts)` |
| **Summed checkboxes** | Purge the Foe (4×4pts), Assassination (2×5pts) | tick each condition met | one `score_selection` per ticked condition |
| **Graduated tiers** | Engage on All Fronts (2/3/4 quarters → 1/2/4pts) | pick the highest tier reached | `score_selection(tier:…, 1, pts)` |
| **Single checkbox** | Bring It Down (1+ VEHICLE/MONSTER killed) | one tick | one `score_selection` |

- **One scoring object per individual mission** — no single shared interface.
- **Concrete set = the 10th-edition Chapter Approved missions** (already parsed at `C:\R\sync-data\tools\ChapterApproved\`). Built out now; many 11th objectives are similar and reuse these.
- **The player selects the mode/params; the object turns the selection into VP.** The tracker does **not** derive VP from the board-state layer (§4) — that would be nice but is too far for now.
- `score_event.mission_ref` + `score_selection` record *which* object scored and *what* was chosen.

### Secondary card lifecycle

```
match_secondary             -- a side's secondary cards across the game (the CARD; VP lives in score_event)
  id PK
  match_player_id FK -> match_player
  card_name                 -- 'Assassination' | 'Bring It Down' | 'Engage On All Fronts' | ...
  mode                      -- 'tactical' | 'fixed'  (mirrors match_player.secondary_mode)
  drawn_round
  status                    -- 'active' | 'scored' | 'discarded'
  discard_timing            -- 'command_phase' | 'end_of_turn'  (when discarded; the app distinguishes)
```

Single source of truth: `match_secondary` owns the **card lifecycle**; `score_event` owns the **VP**. (Fixes the earlier double-bookkeeping.)

---

## 4. Additive meta layer — board state & destroyed units (NOT in the app)

**Optional. Recorded alongside the scoreboard, never a scoring input.** The standalone app tracks none of this; we keep it because it's interesting to persist and feed new-meta. The scoreboard (§1–§3) is fully usable without any of it.

```
unit_casualty               -- destroyed / lost units (the "destroyed units" idea Micah wants kept)
  id PK
  round_player_id FK -> round_player   -- whose, which round
  list_unit_id FK -> list_unit         -- the configured unit
  kind                                 -- 'LOST' | 'DESTROYED'
  destroyed_by_unit_id FK? -> list_unit -- who killed it (optional)
```

(Objective counts are **not** a separate table — they're captured as `score_selection(objectives_controlled, …)` on the primary's `score_event`, exactly where the player enters them in the mission modal.)

---

## 5. Additive meta layer — persistent per-unit token state (NOT in the app)

**Optional, additive.** 11th leans on persistent tokens (battle-shock, hidden, marked, in-progress actions, sticky objectives). Recorded for meta exploration; a `match` is a saved game, so its token state can be saved too (not the transient/ad-hoc case the no-rows rule covers).

```
unit_state
  id PK
  match_player_id FK -> match_player
  list_unit_id FK -> list_unit
  state_key                 -- 'battle_shock' | 'hidden' | 'marked' | 'action_in_progress' | 'sticky_objective'
  value                     -- e.g. action name, target marker/unit id
  active                    -- on/off (battle-shock regroups, an action completes)
  since_round               -- when it took effect
  cleared_round             -- when it ended (nullable) — keeps the history
```

---

## 6. What this replaces / fixes (vs current `matches`/`turns`)

- `matches.mission` (single string) → a real **`mission` card** (primary + deployment + rule), shared by both sides.
- `your_*` / `their_*` columns crammed on `matches`/`turns` → symmetric **`match_player`** + **`round_player`** rows.
- per-turn VP / `match_secondaries.vp_per_round` JSON → **`score_event`** (per round, per side, per mission) + **`score_selection`** (the granular choice) + **`match_secondary`** (card lifecycle). Capped 50/40/10.
- `your_units_lost` / `their_units_lost` JSON blobs → **`unit_casualty`** rows (additive meta layer).
- `stratagem_log` → CP gained/spent on `round_player` (the app's grain); per-stratagem logging deferred.
- Army = a `list` of `list_unit`s, not free-text — casualties/state reference the real configured units.

---

## 7. Integration points (the reason to build our own)

- **IN:** `match_player.list_id` → `list` / `list_unit` (your configured units; the opponent's too).
- **OUT (meta):** `score_event` + `score_selection` + `unit_casualty` + `stratagem_use` → new-meta. The per-mission selections, destroyed units, and stratagem usage are the granular game data that meta and gameplay-trend analysis run on.
- **Tournament:** `match.tournament_id` / `pairing_id`; result set by the organizer; `paint_scoring` set by the tournament.

---

## 8. Open questions (post-app)

1. **11th per-side primaries:** the `match_player.primary_mission_id` seam is in place (10th writes the shared value to both). A per-side *pool* is not modeled until 11th is real. Confirm that's the right amount of 11th-readiness.
2. **Stratagem-level logging: RESOLVED — log which stratagems were used** (`stratagem_use`, §2). It helps meta and surfaces **gameplay trends** (which stratagems fire, when, by whom). CP gained/spent totals stay authoritative; the stratagem rows are the itemized detail, including reactive use on the opponent's turn.
3. **Deployment/mission content depth:** objective positions + measurements are shown by the app — how much of that do we model now vs defer to the content model?
4. **Token-state granularity:** per-round (`since_round`/`cleared_round`) — enough, or do some tokens need per-phase timing?
```
