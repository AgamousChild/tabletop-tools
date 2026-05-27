# Tournament + BCP Data Model — Design Spec (PRELIMINARY)

> Status: **DRAFT — for Micah's review.** Not locked.
> Grounded in: the **real Turso data** (215 BCP-scraped `meta_events`, 30k players, 75k pairings; the `tournaments`/`tournament_players` app tables empty and free-string), the **BCP run-a-tournament flow** (screenshots), and the existing **bcp-scraper** (OAuth + Bearer against `newprod-api.bestcoastpairings.com`).
> Consumes the List + Game Tracker models (configured-unit `list_unit`, the per-game `match`).

---

## 0. The core principle — two data sets, one seam

This session's key realization: **the tournament source and the meta analytics are two different sets of data, not one.**

- **Tournament (source)** = *operational* data — how an event is **run**: config, scorecard, metric stacks, roster, check-in, pairings, live scoring. Rich lifecycle.
- **Meta (analytics)** = the *settled outcome* — events/players/pairings keyed to the canonical dimensions, placements, matchups, the cube.

They do **not** share rows. They touch at **one seam**:
1. the canonical **faction/detachment registry** (`dim_faction` / `dim_subfaction` / `dim_detachment`), and
2. **placement + results**, plus the BCP **`source_id`** key.

A finished source event **derives** into meta across that seam (internally, within the one DB — not a cross-app export pipeline). This *refines* CLAUDE.md rule #9: the spirit ("a tournament you run and a BCP tournament both become analyzable; no clunky import/export") holds, but the operational source and the analytics are deliberately distinct shapes joined at the seam, not the same rows.

### Three relationships a tournament event can have

| Kind | What we store | Who runs it |
|---|---|---|
| **Native** | full operational source (this spec, §1–§3) | us |
| **Passthrough** | a thin BCP reference (id + card + link), §4 | BCP |
| **Meta** | the derived/scraped analytics (existing `meta_*`) | derived |

---

## 1. Native tournament — operational source

Grounded in BCP's create/run flow. Faction/detachment are **`dim_*` FKs, not free strings** (fixes the rule #10 break in today's schema).

```
tournament                  -- an event we run (the operational source)
  id PK
  organizer_user_id FK -> user
  name
  status                    -- 'draft' | 'registration' | 'check_in' | 'in_progress' | 'complete'
  kind                      -- 'native'  (vs passthrough, §4)
  event_date, start_time, end_time
  location, latitude, longitude
  format                    -- 'GT' | 'RTT' | ...
  battle_size               -- Strike Force, etc.
  event_type                -- 'singles' | 'doubles' | 'teams'
  total_rounds
  round_length_minutes
  require_pairings_published
  pairing_style             -- 'swiss' | ...
  table_mode                -- 'random' | 'ranked'
  starting_table
  -- list rules
  list_text_only, list_required_at_checkin, list_editing_disabled, list_submission_disabled, hide_lists
  hide_roster, hide_placings, hide_player_count
  -- registration
  registration_mode         -- 'manual' | 'online'
  check_in_mode             -- 'self' | 'in_person'
  private_access_code?
  -- soft scoring
  paint_scoring             -- ties to the game-tracker paint toggle
  require_photos
  scorecard_id FK -> scorecard
  created_at

tournament_player           -- a registered competitor
  id PK
  tournament_id FK -> tournament
  user_id FK? -> user        -- nullable: a TO can enter a roster of non-users
  display_name
  club_team?
  faction_id FK -> dim_faction          -- canonical registry (NOT a free string)
  subfaction_id FK? -> dim_subfaction
  detachment_id FK? -> dim_detachment
  list_id FK? -> list        -- link to a list-builder list (the structured army)
  list_text?                 -- the pasted/exported text (what BCP-style submission needs)
  list_locked
  checked_in
  dropped
  placement?                 -- derived at completion
  registered_at

round
  id PK
  tournament_id FK -> tournament
  round_number
  status                    -- 'pending' | 'active' | 'complete'
  start_time?

pairing
  id PK
  round_id FK -> round
  table_number
  player1_id FK -> tournament_player
  player2_id FK? -> tournament_player    -- null = bye
  mission                   -- the round's mission (a primary_objective ref; see game-tracker)
  player1_score, player2_score
  result                    -- 'p1' | 'p2' | 'draw' | 'bye'
  reported_by?, confirmed, to_override

tournament_card             -- discipline (yellow/red)
  id PK; tournament_id FK; player_id FK; issued_by FK -> user; card_type; reason; issued_at

tournament_award
  id PK; tournament_id FK; name; description?; recipient_id FK? -> tournament_player
```

**A `pairing` is one game.** The game-tracker `match` (its rich per-round scoring, casualties, stratagems, token state — see the game-tracker spec) links to a `pairing` via `match.pairing_id`, enriching that game without duplicating it.

---

## 2. Scorecard + ranking metric stacks (the operational ranking config)

BCP defines a **Scorecard** plus **two ordered, toggleable metric stacks** — *Pairing Metrics* (how players are paired) and *Placing Metrics* (final standings tiebreakers). These are pure source — meta never sees them. They are **ordered rows, not a JSON blob.**

```
ranking_metric              -- canonical catalog of metrics (define ONCE, reference everywhere)
  id PK
  key                       -- 'wins' | 'battle_points' | 'sos_wins' | 'margin_of_victory' | 'random' | ...
  label
  description

scorecard
  id PK
  name                      -- 'Warhammer 40k Default' | custom
  owner_user_id FK?         -- null = system default

tournament_pairing_metric   -- the ordered pairing tiebreaker stack for an event
  id PK
  tournament_id FK -> tournament
  ranking_metric_id FK -> ranking_metric
  sort_order
  enabled

tournament_placing_metric   -- the ordered standings tiebreaker stack
  id PK
  tournament_id FK -> tournament
  ranking_metric_id FK -> ranking_metric
  sort_order
  enabled
```

(`scorecard` can later carry default metric stacks that a tournament copies on creation; kept minimal for now.)

---

## 3. Standings (derived)

Standings are **computed** from `pairing` results ordered by the `tournament_placing_metric` stack — not stored as a separate authoritative table. `tournament_player.placement` is the **saved snapshot at completion** (the value meta reads). Live standings are recomputed on view (same pattern as list points: derived live, snapshotted on finalize).

---

## 4. Passthrough events — the BCP directory

We list **all** BCP events as a discovery feed; **every aspect passes through to BCP.** We store only the **keys + a display card**, harvested by a light front-end listing scrape (the event id is exposed in the public listing — no auth needed for the keys).

```
passthrough_event           -- a thin reference to a BCP-hosted event
  id PK
  bcp_event_id              -- THE KEY (== meta_events.source_id when it lands in meta)
  name, event_date, location, game_system, player_count   -- cached card for the feed
  registration_url
  last_synced_at
```

- All operations (register, roster, pairings, results, lists) happen **on BCP** — we don't ingest them.
- When the event finishes, the existing scraper lands it in `meta_events` (`source='bcp'`, `source_id = bcp_event_id`), so a `passthrough_event` joins straight to its analytics record by the shared key.
- In-app render vs link-out is a UI decision; the data is the same thin reference either way.

---

## 5. BCP list-drop — register + submit a list on the user's behalf (BUILD BOTH)

Capability: the user picks a passthrough (BCP) event + one of their list-builder lists → we register them and submit the list to BCP.

### 5.0 Transparency & consent — be explicit, hide nothing

We deliberately do **not** lean on "users will allow anything." The opposite: any action that touches a user's BCP account is **explicit, specific, scoped, and opt-in.** Be clear: *this does that, click here to allow.*

- **Say exactly what it will do, then ask.** e.g. *"This will register you for **NOVA Open 2026** on BestCoastPairings and submit your list **'Cult Ambush 2000'**."* → a single **[Allow]**.
- **Per-action consent.** One allow = one event + one list. No standing broad grant, no background actions, no surprise writes — the next submission asks again.
- **Nothing hidden.** The user always sees what the action is and where their credentials go, and the **result (success/failure) is surfaced plainly** — never a silent success they have to assume.

### 5.1 Cleanly separated capabilities

The two things are distinct features with distinct permission levels — **never bundled**:

| Capability | Auth | Consent | Touches BCP account? |
|---|---|---|---|
| **Browse** the BCP directory (§4) | none | none | no — reads public listings only |
| **Register + drop a list** on a BCP event | the user's BCP login | explicit per-action Allow (§5.0) | yes — acts as the user |

Browsing never requires a login or a consent click. Acting on the user's behalf always does. They are not entangled.

### 5.2 Two mechanisms (build both)

Why two exist (and why the server one works): **CORS is a browser rule, not a network rule** — server-to-server calls aren't subject to it, a browser page is. So the server path is technically trivial; the browser/agent path exists purely for **credential custody**. Each is presented to the user with a clear statement of where their credentials go.

**Path A — server-side (ephemeral token).** Our Worker reuses the scraper's BCP client (`/oauth/authorize` → `/oauth/token` → Bearer) with **the user's** token, calling BCP's register + submit-list endpoints. No CORS; token held in memory for the call and **never persisted**. *Told to the user:* "a temporary token from your BCP login, used for this action and never stored."

**Path B — browser / agent.** The user's browser (or a browser agent in their logged-in BCP session) performs login + register + paste-list — the real "Add List" flow (faction + text + Upload). The session **never leaves the user**; CORS is moot. *Told to the user:* "the agent acts in your own BCP session; we never see your login."

Both produce the same outcome and the same local record:

```
bcp_registration            -- our thin local pointer (the truth lives on BCP)
  id PK
  user_id FK -> user
  bcp_event_id              -- the passthrough event
  list_id FK -> list        -- the structured list we submitted
  method                    -- 'server' | 'agent'
  status                    -- 'submitted' | 'failed'
  submitted_at
```

**Payoff for meta:** because we know this user submitted **this structured list** to BCP event X, when that event scrapes into meta we can attach the *structured* `list` to their `meta_event_player` record — richer than the parsed `list_text` the scraper gets for everyone else.

**Risks (unchanged by which path):**
- **ToS** — automating registration on BCP on a user's behalf is between the user and BCP; BCP could disallow it. Product/legal call.
- **Credential custody** — Path A briefly holds the user's ephemeral BCP token (never stored); Path B holds nothing. Never store the user's BCP password in either path.
- **Drift** — Path A breaks if BCP's API shape changes (silent, high-consequence — a failed submit a user thinks succeeded); Path B breaks if BCP's DOM changes (an agent adapts better). Either way, **surface submit success/failure explicitly** (§5.0).

---

## 6. The seam to meta (how source feeds analytics)

- **Faction/detachment**: both native and BCP resolve to `dim_*`. BCP's faction picker is grouped exactly like `dim_faction(allegiance)` / `dim_subfaction`, so the registry already aligns.
- **Native completion** → derive `meta_event` + `meta_event_players` (placement, W/L/D, structured list) + `meta_pairings` + `fact_game_results` from the native source. Internal derive, not a cross-app pipeline.
- **BCP completion** → existing scrape (`source='bcp'`), joined to its `passthrough_event` by `source_id`.
- Everything converges in `meta_*`, from both directions.

---

## 7. What changes vs the current schema

- `tournament_players.faction` free string → **`dim_faction` FK** (rule #10 fix). Same for detachment.
- `tournaments.mission_pool` JSON → structured (rounds carry mission refs).
- New: **`scorecard` + `ranking_metric` + the two ordered metric-stack tables** (replacing any JSON metric config).
- New: **`passthrough_event`** (BCP directory) + **`bcp_registration`** (the list-drop pointer).
- `pairing` keeps its confirmation workflow (reported_by/confirmed/override) — already close.
- A native game links to the rich per-game data via `match.pairing_id` (game-tracker spec).

---

## 8. Open questions / risks

1. **BCP write ToS** — the one real external risk for §5. Product/legal decision before shipping the list-drop.
2. **BCP CORS** — decides whether Path B can fetch BCP's API directly from the browser or must operate the UI via an agent. Untested (scraper is server-side). Worth a quick probe.
3. **Native → meta derive timing** — on `status='complete'`, or a nightly job? (Lean: on completion.)
4. **rule #9 refinement** — confirm the "two data sets joined at a seam, internal derive" reading is the intended evolution of "one data model / no import-export."

---

## 9. Test plan

- Faction/detachment resolve to `dim_*` for native registration; unknown faction is rejected, not free-typed.
- Standings: recompute from pairings against a placing-metric stack; reorder the stack → standings reorder; finalize → `placement` snapshot.
- Passthrough: listing scrape yields `bcp_event_id`; the same id matches a later scraped `meta_event.source_id`.
- BCP list-drop (both paths): a `bcp_registration` row is created with the right `method`; failure surfaces as `status='failed'` (never a silent success).
- Native → meta derive: a completed native tournament produces `meta_event` + players (with structured list) + pairings + `fact_game_results` keyed to `dim_*`.
