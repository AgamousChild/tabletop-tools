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
- **11th is the target by release.** Everyone tracks 10th today, but we won't ship before 11th is out — so we build the 11th structure now, as far as the transcripts let us: **per-side primaries chosen from per-side available pools** (force-disposition / matchup driven) and persistent token state (§5). The **scoring objects we build are the 10th Chapter Approved missions** (§3) — 11th reuses most. 10th's structure is the constrained case (both sides' pool = the one shared primary). Unknowns (official tools, exact scoring values) stay out; **caps and scoring values live in the mission data (§3), so they flex per edition with no schema change.**

Carried-in: consumes the list model (`list` / `list_unit`); **no scratch rows** (a `match` is a real saved game); real names. **Integration is the point** — lists flow in, results + game state flow out to new-meta, tournament links are first-class.

---

## 1. Match + sides + the Mission card

```
match                       -- one tracked game
  id PK
  user_id FK -> user        -- the tracking user
  status                    -- 'setup' | 'in_progress' | 'complete'
  deployment_id FK -> deployment        -- SHARED: the deployment zones both sides play (static overlay)
  terrain_layout_id FK -> terrain_layout -- SHARED: the terrain layout (static overlay)
  mission_rule              -- SHARED: e.g. 'Tipping Point'
  mission_card_id FK?       -- optional label when it's a named 10th card ('Mission H'); 11th picks primaries per side instead
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
  primary_objective_id FK -> scoring_mission  -- this side's CHOSEN primary (11th: per side, from its own pool below; 10th: both sides pick the same one)
  secondary_mode            -- 'tactical' (draw random as the game goes) | 'fixed' (pick 2 up front)
  is_attacker
  goes_first
  battle_ready              -- "Army is Battle Ready" → +10 when paint_scoring is OFF (the app's default 10 free pts)
  paint_score               -- when paint_scoring is ON: the judged value; when OFF: 10 (free), via battle_ready
  final_primary_vp          -- snapshot at game end (≤ 50)
  final_secondary_vp        -- snapshot at game end (≤ 40)

match_player_primary_option   -- this side's AVAILABLE primary pool (11th: force-disposition / matchup driven; 10th: the one shared primary)
  id PK
  match_player_id FK -> match_player
  primary_objective_id FK -> scoring_mission
```

### Mission content (referenced; lives with the content model)

The structural parts are a **deployment** + **terrain layout** (both **shared** — the board both sides play) and **primary objectives** (chosen **per side** in 11th). A 10th named **Mission card** ("Mission H: Supply Drop, Hammer And Anvil") is just a convenient pairing of one primary + deployment + rule; 11th drops the bundle and each side picks its primary from its own pool.

**Deployment zones and terrain layouts are static and set** — a fixed published catalog — so they're modeled as **reference overlays**, not per-game geometry. A `match` references the named deployment + terrain layout it used; the overlay (zones, objective markers, terrain pieces, measurements) is fixed content rendered over a standard board.

```
-- primaries are `scoring_mission` rows (kind='primary'); the full catalog (primary + secondary) is in §3.

deployment                  -- a static deployment overlay (e.g. 'Hammer And Anvil')
  id PK
  name
  zone_overlay              -- the fixed zone overlay (attacker / no-man's-land / defender) + its measurements

deployment_objective        -- the fixed objective-marker positions for that deployment (queryable)
  id PK
  deployment_id FK -> deployment
  label                     -- marker id / name
  x, y                      -- position on the board

terrain_layout              -- a static terrain overlay (e.g. 'GW Chapter Approved 2025-26 Layout 7')
  id PK
  name
  source                    -- 'GW Chapter Approved 2025-26'
  terrain_overlay           -- the fixed terrain overlay (positioned pieces)

mission_card                -- optional 10th named pairing (label / convenience)
  id PK
  name                      -- 'Mission H'
  primary_objective_id FK -> scoring_mission
  deployment_id FK -> deployment
  mission_rule              -- e.g. 'Tipping Point'
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

## 3. Scoring — two separate things, deliberately

**(a) The score — simple.** Per round, per side, each mission has a VP number for that round. The player **enters it**; we keep a round-by-round running total. **No multiplicative computation in the model — score the round as is.** Caps: primary 50, secondary aggregate 40, paint 10 → 100.

```
score_event                 -- one mission's score, for one side, in one round (player-entered)
  id PK
  round_player_id FK -> round_player
  scoring_mission_id FK -> scoring_mission   -- the primary or secondary scored
  vp                        -- the round's VP for this mission (entered as-is; capped by scoring_mission.cap)
```

`scoring_mission` is **one catalog for both primaries and secondaries** — they score identically (a primary like Purge the Foe is a checklist; a secondary like Engage is tiers). Match totals derive from `score_event`, clamped to the caps.

```
scoring_mission             -- catalog: a primary OR a secondary
  id PK
  name                      -- our own functional name
  kind                      -- 'primary' | 'secondary'
  side                      -- 'symmetric' | 'attacker' | 'defender'   (asymmetric missions exist)
  cap                       -- this mission's VP cap (data — flexes per edition)
  ui_pattern                -- render hint: 'count' | 'checklist' | 'tier' | 'action' | 'zoned_count' | …
                            --   open-ended: there are MORE than a few patterns; a new one is a new hint, not a schema change
```

**(b) The game states — the useful info.** Every identifiable, recurring fact of play is a **canonical definition, written once** in our own functional words (mechanics/methods of play aren't copyrightable — only GW's card text is, so we don't copy it). The same fact is reused by many missions: *control an objective in No Man's Land* is shared by Supply Drop, Secure No Man's Land, The Ritual, …; *an enemy MONSTER/VEHICLE was destroyed* by Bring It Down and others.

```
game_state                  -- a canonical fact of play — define ONCE, reference everywhere
  id PK
  key                       -- stable slug, e.g. 'control_objective_no_mans_land'
  label                     -- our functional wording (NOT GW card text)
  category                  -- 'objective_control' | 'unit_destroyed' | 'position' | 'action_completed' | 'comparative' | …

mission_game_state          -- which game_states a mission scores, and what each is declared worth
  id PK
  scoring_mission_id FK -> scoring_mission
  game_state_id FK -> game_state
  points                    -- declared VP for this state in this mission (reference; shown in the scorer)
  count_mode                -- 'flag' | 'per_objective' | 'per_unit' | 'tier'
  sort_order
```

When the player scores a mission, they assert which of its game states were true (tick / count). That both helps them reach the round VP **and** records the facts:

```
game_state_event            -- which canonical game-states were true for this side this round (the useful data)
  id PK
  round_player_id FK -> round_player
  game_state_id FK -> game_state    -- a POINTER to the canonical definition (countable across all games)
  score_event_id FK?                -- the mission score it fed, when it came from scoring
  count                             -- how many (e.g. 3 objectives); 1 for a flag
```

**Why this is the whole point:** because every occurrence points at the *same* `game_state` row, "how often did anyone control more objectives than their opponent?" is a single join across all games — not a scan of loose text. It's the canonical-entity rule (your "one source per thing") applied to **facts of play**. The score stays player-entered and authoritative; the game-state events are the correlated, queryable record — **not** used to recompute the score.

(Note: *unit destroyed* game states overlap with `unit_casualty` (§4), but at different grains — `game_state_event` is the scoring-relevant fact, `unit_casualty` is the specific unit. They corroborate; neither derives the other.)

### The interface per mission

A mission's scoring view is rendered from its `ui_pattern` + its `mission_game_state` rows — a small set of generic renderers (count → stepper, checklist → checkboxes, tier → exclusive options, action → completion toggle, zoned_count → per-zone counters, …), driven by data. **A new mission is data** (a `scoring_mission` + its `mission_game_state` links), not new code. Primaries and secondaries use the same view — that's why "they score identically" is literally true.

### Secondary card lifecycle

```
match_secondary             -- a side's secondary CARDS across the game (the card instance; VP lives in score_event)
  id PK
  match_player_id FK -> match_player
  scoring_mission_id FK -> scoring_mission   -- which secondary
  mode                      -- 'tactical' | 'fixed'  (mirrors match_player.secondary_mode)
  drawn_round
  status                    -- 'active' | 'scored' | 'discarded'
  discard_timing            -- 'command_phase' | 'end_of_turn'
```

Single source of truth: `match_secondary` owns the **card lifecycle**; `score_event` owns the **VP**; `game_state_event` owns the **facts**.

---

## 4. Board state — destroyed & lost units

Part of the game state, recorded like everything else — not a separate feature waving its hand. Destroyed and lost units are the game as it is, and persisting them feeds new-meta. **One rule:** recorded alongside, never a scoring input (scoring stays player-entered — §0).

```
unit_casualty               -- destroyed / lost units (the "destroyed units" idea Micah wants kept)
  id PK
  round_player_id FK -> round_player   -- whose, which round
  list_unit_id FK -> list_unit         -- the configured unit
  kind                                 -- 'LOST' | 'DESTROYED'
  destroyed_by_unit_id FK? -> list_unit -- who killed it (optional)
```

(Objective counts are captured as a `game_state_event` — a pointer to the canonical *control objective in {zone}* state with a `count` — tied to the primary's `score_event`, exactly where the player enters them in the mission scorer.)

---

## 5. Token state on units

Also part of the game state. 11th leans on persistent tokens (battle-shock, hidden, marked, in-progress actions, sticky objectives); recording them is just tracking the game. A `match` is a saved game, so its token state is saved with it (not the transient/ad-hoc case the no-rows rule covers). Like §4: recorded, never a scoring input.

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

- `matches.mission` (single string) → **shared `deployment` + `terrain_layout` + rule** (static overlays) with a **per-side primary** (a `scoring_mission`; each side picks from its own `match_player_primary_option` pool). 10th = both pools/picks identical; optional `mission_card` names the 10th pairing.
- `your_*` / `their_*` columns crammed on `matches`/`turns` → symmetric **`match_player`** + **`round_player`** rows.
- per-turn VP / `match_secondaries.vp_per_round` JSON → **`score_event`** (per round, per side, per mission, entered as-is) + **`game_state_event`** (the canonical facts) + **`match_secondary`** (card lifecycle). Capped 50/40/10.
- `your_units_lost` / `their_units_lost` JSON blobs → **`unit_casualty`** rows (part of the game state).
- `stratagem_log` → CP gained/spent on `round_player` + **`stratagem_use`** (which stratagems fired, incl. reactive).
- Army = a `list` of `list_unit`s, not free-text — casualties/state reference the real configured units.

---

## 7. Integration points (the reason to build our own)

- **IN:** `match_player.list_id` → `list` / `list_unit` (your configured units; the opponent's too).
- **OUT (meta):** `score_event` + `game_state_event` + `unit_casualty` + `stratagem_use` → new-meta. The canonical game-state facts, destroyed units, and stratagem usage are the granular data that meta and gameplay-trend analysis run on — and they line up across games because they point at shared definitions.
- **Tournament:** `match.tournament_id` / `pairing_id`; result set by the organizer; `paint_scoring` set by the tournament.

---

## 8. Decisions (all resolved)

1. **11th readiness: built now** (we won't release before 11th). Per-side primaries with per-side available pools (`match_player.primary_objective_id` + `match_player_primary_option`); shared deployment + terrain; persistent token state (§5). 10th is the constrained case. Unknowns (official tools, exact scoring values) stay out — caps/values live in mission data, so they flex without schema change.
2. **Stratagem-level logging: log which stratagems were used** (`stratagem_use`, §2). Helps meta and surfaces **gameplay trends** (which stratagems fire, when, by whom). CP gained/spent totals stay authoritative; the stratagem rows are the itemized detail, including reactive use on the opponent's turn.
3. **Deployment + terrain content: model now as static overlays.** Static, published, fixed → a reference catalog: `deployment` (zone overlay + `deployment_objective` positions + measurements) and `terrain_layout` (terrain overlay). A match references the named ones; the overlay renders over a standard board.
4. **Token-state granularity: round level is fine for now** (`since_round` / `cleared_round`). Per-phase timing not needed yet.
