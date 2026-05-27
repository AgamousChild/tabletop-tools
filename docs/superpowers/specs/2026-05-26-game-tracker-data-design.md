# Game Tracker Data Model — Design Spec (PRELIMINARY)

> Status: **DRAFT — preliminary, for Micah's review.** Not locked.
> Grounded in `2026-05-26-11th-edition-game-flow.md` (creator transcripts) and consistent with the List + Versus models (configured-unit reuse, per-side primaries, no scratch rows, real names).

---

## 0. Principles carried in

- **Consumes the list model.** A side's army is a **`list`** of **`list_unit`** (configured units). Casualties/state reference `list_unit` — one unit definition everywhere.
- **No single game primary, and no shared pool.** Each side has its **own pool** of available primaries (force-disposition/matchup driven) and picks its **own** chosen primary from that pool, scoring only its own. (per the flow-doc correction)
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
  attacker_side             -- which match_player is attacker
  first_turn_side           -- which match_player goes first
  result                    -- 'P1_WIN' | 'P2_WIN' | 'DRAW'; set out of process — individual games: the user picks the winner; tournament: the ORGANIZER selects the tie-break/winner; otherwise DRAW. No tie-break logic in the model.
  date
  location
  tournament_id FK?         -- if part of a tournament (soft link / FK)
  pairing_id FK?            -- the tournament pairing this came from
  require_photos
  paint_scoring             -- "paint scoring on?" toggle: player-set for individual games; set by the tournament when the match is part of one
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
  available_primaries       -- THIS side's OWN pool of available primaries (force-disposition / matchup driven; separate per side)
  primary_mission_id        -- the side's CHOSEN primary (from its own pool, above)
  is_attacker
  goes_first
  final_primary_vp          -- snapshot at game end
  final_secondary_vp
  paint_score               -- judged value when paint_scoring is on; defaults to 10 (free points) when off
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
  cp_start, cp_gained, cp_spent         -- active player's CP economy for the turn
  photo_url
  notes
  created_at
  -- VP is NOT stored here: scoring is recorded per-window in score_event (§3)
```

---

## 3. Scoring (per window), CP, stratagems, secondaries

```
score_event                 -- VP scored AT a specific scoring window (track EACH window — per Micah)
  id PK
  round_id FK -> round
  match_player_id FK -> match_player    -- who scored (each side scores its own)
  window                    -- 'end_of_command' | 'end_of_turn' | 'end_of_round' | 'end_of_game'
  category                  -- 'primary' | 'secondary'
  source                    -- the primary mission, or the secondary card name, that scored
  vp
-- turn/match VP totals derive from score_event rows.

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

### Mission scoring objects (each mission has its OWN specific interface)

Mission scoring is **encoded, not free-entry VP.** Each mission — every **primary** and every **secondary** — is its own **scoring object** with a **mission-specific interface**: its own parameters, its own interface elements, its own scoring logic. There is **no single shared interface** — Purge the Foe, Assassinate, and Bring It Down each expose different parameters and score differently. The only thing they have in common is that each emits `score_event` rows into the scoring table.

```
<MissionScoringObject>            -- specific PER mission (not a single shared contract)
  parameters                      -- THIS mission's own selectable mode/params -> THIS mission's interface elements
  score(player-selected mode/params, window, side) -> score_event[]
```

- **One scoring object per individual mission.** Purge the Foe is one object; Assassinate is another; Bring It Down another — each defines the interface specific to itself.
- **Concrete set = the 10th-edition Chapter Approved missions** (**not** Pariah Nexus). Build out each **Chapter Approved** primary and secondary mission as its own object now — documented and stable, already parsed at `C:\R\sync-data\tools\ChapterApproved\`. Many 11th-edition objectives are similar, so 11th missions reuse most of these objects (or extend them) — built once here.

**Each object's specific interface = its own mission parameters → its own interface elements:**

| Mission (Chapter Approved) | Its specific parameters / interface elements |
|---|---|
| Purge the Foe | enemy units **destroyed** (kill tally, per scoring window) |
| Assassinate | enemy **CHARACTERS** destroyed |
| Bring It Down | enemy **MONSTERS / VEHICLES** destroyed (by wounds bracket) |

Each object owns its parameter set; the tracker renders that mission's specific interface elements, and **the player selects the mode/params** for that mission. That selection **sets the score value**, which the object records as a `score_event`. The selectable params differ per mission — Assassinate: how many enemy CHARACTERS were killed; Bring It Down: which MONSTERS/VEHICLES (by wounds bracket); Purge the Foe: the kill tally for the window. **The player enters/selects these; the tracker does not derive them from tracked board state.** (Auto-scoring from board state would be nice, but it's too far for now.) The object's only job is to turn the player's selected mode/params into VP.
- At each scoring `window`, the tracker invokes the relevant object for a `side`; the object reads the captured board state (`objective_state`, `unit_casualty`, `unit_state` — §4/§5) and **emits the `score_event` rows** above. The tracker never hard-codes a mission's math.
- Mission **definitions are content** (they live with the content model); `match_player.primary_mission_id` and `match_secondary.card_name` reference them. The interface is the seam between recorded board state and mission rules.
- `score_event.source` records **which** scoring object produced the VP.

---

## 4. Casualties & board state

```
unit_casualty               -- units LOST and units DESTROYED (many objectives compare the two)
  id PK
  turn_id FK -> turn
  owner_id FK -> match_player        -- whose unit
  list_unit_id FK -> list_unit       -- NOT NULL: the configured unit (both sides have full lists)
  unit_name                          -- denormalized display cache
  kind                               -- 'LOST' | 'DESTROYED'
  destroyed_by_unit_id FK? -> list_unit   -- who killed it (optional)

objective_state             -- per side, per scoring window: how many objectives controlled
  id PK
  round_id FK -> round
  match_player_id FK -> match_player
  window                             -- which scoring window this count is for
  objectives_controlled              -- the NUMBER of objectives controlled (a count)
  -- this count is the player-entered param that drives objective-primary scoring (§3).
  -- 11th will differ (new maps, objective scoring less clearly defined) — model the count for now.
```

---

## 5. Persistent per-unit token state — PERSISTED

**Persisted (per Micah).** 11th leans hard on persistent tokens (battle-shock, hidden, marked/auspex, in-progress actions, sticky objectives). The tracker records them as part of the saved game — a `match` is a saved game, so its token state is saved too (this is not the transient/ad-hoc case the no-rows rule covers).

```
unit_state
  id PK
  match_player_id FK -> match_player
  list_unit_id FK -> list_unit
  state_key                 -- 'battle_shock' | 'hidden' | 'marked' | 'action_in_progress' | 'sticky_objective'
  value                     -- e.g. action name, target marker/unit id
  active                    -- on/off (battle-shock can be regrouped, an action completes)
  since_round               -- when it took effect
  cleared_round             -- when it ended (nullable) — keeps the history
```

`active` + `since_round`/`cleared_round` let state toggle over the game and preserve when it started/ended, rather than just a current-snapshot flag.

---

## 6. What this replaces / fixes (vs current `matches`/`turns`)

- `matches.mission` (single) → **per-side `primary_mission_id`** + a **per-side `available_primaries` pool** (each side has its own — no shared pool).
- `your_*` / `their_*` columns crammed onto `matches`/`turns` → symmetric **`match_player`** + per-turn rows.
- `your_units_lost` / `their_units_lost` JSON blobs → **`unit_casualty`** rows (LOST vs DESTROYED, by unit).
- `match_secondaries.vp_per_round` JSON → **`score_event`** (per-window scoring) + per-card `match_secondary` (card lifecycle). No per-turn VP column.
- `stratagem_log` → `stratagem_use` with `used_by_id` (captures reactive spends).
- Army = a `list` of `list_unit`s, not free-text — casualties/state reference the real configured units.

---

## 7. Open questions (for review)

1. **Per-unit token state (§5): RESOLVED — persist it** (with `active` + round history; see §5).
2. **Opponent granularity: RESOLVED — opponent's full `list` is always available** (both `match_player`s have a real `list_id`; casualties reference real `list_unit`s). How it's captured (import vs manual) is a separate UX concern.
3. **Scoring windows: RESOLVED — track scoring at EACH window** via `score_event` (`end_of_command` / `end_of_turn` / `end_of_round` / `end_of_game`). Turn/match VP totals derive from these.
4. **Objective board state = the NUMBER of objectives controlled (per side, per window): RESOLVED.** That count is the player-entered param that drives objective-primary scoring (§3). `unit_casualty` + `unit_state` are the rest of the game log (record-only — no auto-derived VP). **11th will differ** (new maps, objective scoring less clearly defined) — model the count for now, revisit when 11th maps land.
5. **Mission VP rules: RESOLVED — each mission is its own scoring object with a mission-specific interface; the player selects the mode/params that set the score** (§3). Build out the 10th-edition **Chapter Approved** primaries + secondaries as objects. Not auto-derived, not a single shared interface, not a free-entry number — the player picks that mission's mode/params and the object turns them into VP. (11th reuses most of these.)
6. **Paint scoring: RESOLVED — gated by a `paint_scoring` toggle on the match** ("paint scoring on?"). Individual players set it themselves; a tournament sets it when the match belongs to one. When **on**, `paint_score` is the judged value; when **off**, paint contributes a default **10 free points** (so it never disadvantages a player). **Tie-breaks are handled out of process** — for individual games the user sets the winner; **in a tournament the organizer selects the tie-break/winner**; otherwise the result is a tie (`DRAW`). No tie-break logic in the model.
