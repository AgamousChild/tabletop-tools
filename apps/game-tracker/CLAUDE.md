# CLAUDE.md — game-tracker

> Read the root CLAUDE.md for platform-wide conventions.

---

## What This App Is

game-tracker is a live game companion for Warhammer 40K matches. Multi-screen wizard flow:
match setup, mission setup, pre-game selections, round-by-round battle tracking, end-game summary.
Match data feeds back into list-builder ratings.

**Port:** 3004 (server), Vite dev server proxies `/trpc` -> `:3004`

---

## Architecture

```
+---------------------------------+
|  Tier 1: React Client           |
|  - Match setup (multi-screen)   |
|  - Mission setup                |
|  - Pre-game (atk/def, first)   |
|  - Battle (round tracking)     |
|  - End-game summary            |
|  - IndexedDB (factions, lists) |
|  - tRPC client (type-safe)      |
+----------------+----------------+
                 | tRPC over HTTP
+----------------v----------------+
|  Tier 2: tRPC Server            |
|  - Match router (v1 legacy)     |
|  - MatchV2 router               |
|  - Mission router               |
|  - Turn router                  |
|  - Photo storage (R2)           |
|  - SQLite via Turso             |
+----------------+----------------+
                 |
    @tabletop-tools/server-core
```

Server uses `@tabletop-tools/server-core` for base tRPC, Hono, and Worker handler.
Client uses `@tabletop-tools/ui` for AuthScreen, auth client, tRPC links, and Tailwind preset.
Client uses `@tabletop-tools/game-data-store` for factions, detachments, and lists from IndexedDB.
Photo storage uses Workers R2 binding API (not S3 SDK).

---

## Client Screen Flow

```
List Screen → Match Setup → Mission Setup → Pre-Game → Battle → End Game Summary
     ↑                                                              |
     └──────────────────────────────────────────────────────────────┘
```

**Screen components:**
- `GameTrackerScreen.tsx` — screen router (like list-builder pattern)
- `MatchSetupScreen.tsx` — date, location, your faction/detachment/list, opponent info, tournament toggle
- `MissionSetupScreen.tsx` — mission, deployment zone, terrain layout dropdowns
- `PregameScreen.tsx` — attacker/defender, who goes first selection buttons
- `BattleScreen.tsx` — round-by-round VP/CP/units-lost entry, end game flow
- `EndGameScreen.tsx` — result card, stats (CP used, units lost/killed), round breakdown

---

## Features

### Match Setup (Screen 1: MatchSetupScreen)
- Date, location, your faction/detachment/list, opponent info
- Tournament toggle: auto-populates from tournament data when enabled
- `match.startFromPairing` for tournament integration

### Mission Setup (Screen 2: MissionSetupScreen)
- Mission, deployment zone, terrain layout dropdowns
- **Twist cards checkbox** + selection (auto from tournament if applicable)
- **Challenger cards checkbox** + selection (auto from tournament if applicable)
- **Require photos checkbox** (auto from tournament if applicable)

### Pre-Game (Screen 3: PregameScreen)
- Attacker/defender selection
- Who goes first selection

### Battle (Screen 4: BattleScreen)
Per-turn phase-based tracking. Each round has 2 turns (one per player):

**Command Phase** per turn:
- CP gain (+1 auto, override for special rules)
- Primary VP scoring (stepper)
- Secondary mission picker + VP per round
- Stratagem picker (from IndexedDB faction data, or free-text)

**Action Phase** per turn:
- Unit destruction picker (from army list in IndexedDB)
- Stratagem picker
- Notes

**Photo** per turn (if require photos is enabled):
- Camera/file upload, preview, skip option

**Round flow:**
```
Round N
  ├─ Your turn: Command Phase → Action Phase → Photo
  ├─ Their turn: Command Phase → Action Phase → Photo
  └─ Round Summary → Confirm & Save
```

**Scoreboard** — persistent header showing your VP vs their VP, CP for both, round number.
CP carries forward across rounds: `start + gained - spent`.

### End Game (Screen 5: EndGameScreen)
- Per-player VP/CP breakdown
- Secondary mission summary (which secondaries, VP per round)
- Stratagem usage summary
- Photos per round (if captured)
- Result card (WIN/LOSS/DRAW)

### Tournament Integration
- Same UI for tournament and casual matches
- Tournament result verified by opponent in tournament tracker

## Database Schema

```typescript
// matches
id                  TEXT PRIMARY KEY
user_id             TEXT NOT NULL
list_id             TEXT              -- optional: references lists.id
opponent_faction    TEXT NOT NULL     -- user-entered string
mission             TEXT NOT NULL
result              TEXT              -- WIN | LOSS | DRAW -- null while in progress
your_final_score    INTEGER
their_final_score   INTEGER
is_tournament       INTEGER NOT NULL DEFAULT 0
created_at          INTEGER NOT NULL
closed_at           INTEGER
opponent_name       TEXT
opponent_detachment TEXT
your_faction        TEXT
your_detachment     TEXT
terrain_layout      TEXT
deployment_zone     TEXT
twist_cards         TEXT              -- JSON (V3)
challenger_cards    TEXT              -- JSON (V3)
require_photos      INTEGER DEFAULT 0 -- V3
attacker_defender   TEXT              -- YOU_ATTACK | YOU_DEFEND
who_goes_first      TEXT              -- YOU | THEM
date                INTEGER
location            TEXT
tournament_name     TEXT
tournament_id       TEXT

// turns (one row per round — V3 per-player columns)
id                    TEXT PRIMARY KEY
match_id              TEXT NOT NULL
turn_number           INTEGER NOT NULL
photo_url             TEXT              -- legacy
your_units_lost       TEXT DEFAULT '[]' -- legacy JSON
their_units_lost      TEXT DEFAULT '[]' -- legacy JSON
primary_scored        INTEGER DEFAULT 0 -- legacy (= yourPrimary)
secondary_scored      INTEGER DEFAULT 0 -- legacy (= yourSecondary)
cp_spent              INTEGER DEFAULT 0 -- legacy (= yourCpSpent)
notes                 TEXT
your_cp_start         INTEGER DEFAULT 0
your_cp_gained        INTEGER DEFAULT 1
your_cp_spent         INTEGER DEFAULT 0
their_cp_start        INTEGER DEFAULT 0
their_cp_gained       INTEGER DEFAULT 1
their_cp_spent        INTEGER DEFAULT 0
your_primary          INTEGER DEFAULT 0
their_primary         INTEGER DEFAULT 0
your_secondary        INTEGER DEFAULT 0
their_secondary       INTEGER DEFAULT 0
your_photo_url        TEXT
their_photo_url       TEXT
your_units_destroyed  TEXT DEFAULT '[]' -- JSON
their_units_destroyed TEXT DEFAULT '[]' -- JSON
created_at            INTEGER NOT NULL

// match_secondaries (V3)
id              TEXT PRIMARY KEY
match_id        TEXT NOT NULL      -- references matches.id
player          TEXT NOT NULL      -- YOUR | THEIRS
secondary_name  TEXT NOT NULL
vp_per_round    TEXT DEFAULT '[]'  -- JSON: [r1, r2, r3, r4, r5]

// stratagem_log (V3)
id              TEXT PRIMARY KEY
turn_id         TEXT NOT NULL      -- references turns.id
player          TEXT NOT NULL      -- YOUR | THEIRS
stratagem_name  TEXT NOT NULL
cp_cost         INTEGER DEFAULT 1

// --- Phase 3 v2 relational tables (migration 0011) ---

// match_v2 — one row per game
id                  TEXT PRIMARY KEY
user_id             TEXT NOT NULL     -- references auth_user.id
list_id             TEXT              -- references lists.id
primary_mission_id  TEXT              -- references scoring_mission.id
deployment_id       TEXT              -- references deployment.id
opponent_name       TEXT NOT NULL
opponent_faction    TEXT NOT NULL
status              TEXT NOT NULL DEFAULT 'active'  -- active | complete
result              TEXT              -- WIN | LOSS | DRAW
conclusion          TEXT              -- normal | concede | timeout
is_tournament       INTEGER NOT NULL DEFAULT 0
tournament_id       TEXT
date                INTEGER
location            TEXT
created_at          INTEGER NOT NULL
closed_at           INTEGER

// match_player — one row per participant (2 per match)
id          TEXT PRIMARY KEY
match_id    TEXT NOT NULL   -- references match_v2.id
user_id     TEXT            -- null for opponent
is_you      INTEGER NOT NULL DEFAULT 0
display_name TEXT NOT NULL

// battle_round — one row per round played
id            TEXT PRIMARY KEY
match_id      TEXT NOT NULL   -- references match_v2.id
round_number  INTEGER NOT NULL
created_at    INTEGER NOT NULL

// round_player — per-player per-round scoring
id            TEXT PRIMARY KEY
round_id      TEXT NOT NULL   -- references battle_round.id
player_id     TEXT NOT NULL   -- references match_player.id
primary_vp    INTEGER NOT NULL DEFAULT 0
secondary_vp  INTEGER NOT NULL DEFAULT 0
cp_gained     INTEGER NOT NULL DEFAULT 1
cp_spent      INTEGER NOT NULL DEFAULT 0
notes         TEXT

// score_event — immutable scoring audit trail
id            TEXT PRIMARY KEY
match_id      TEXT NOT NULL
round_number  INTEGER NOT NULL
player_id     TEXT NOT NULL
primary_vp    INTEGER NOT NULL DEFAULT 0
secondary_vp  INTEGER NOT NULL DEFAULT 0
cp_gained     INTEGER NOT NULL DEFAULT 0
cp_spent      INTEGER NOT NULL DEFAULT 0
notes         TEXT
created_at    INTEGER NOT NULL

// Also: game_state_event, match_secondary_v2, unit_casualty, unit_state, stratagem_use
// See packages/db/src/match-schema.ts for full definitions
```

---

## tRPC Routers

```typescript
// Mission catalog (data-driven, server of truth)
mission.listPrimaries()                           -> scoringMission[] (kind='primary')
mission.listSecondaries()                         -> scoringMission[] (kind='secondary')
mission.getGameStates({ missionId })              -> missionGameState[]

// Matches v2 (relational, replaces flat v1 for new games)
matchV2.start({
  opponentName, opponentFaction, primaryMissionId?,
  deploymentId?, listId?, isTournament?,
  tournamentId?, date?, location?
})                                                -> matchV2
matchV2.get({ matchId })                          -> { match, players, rounds, roundPlayers, scoreEvents }
matchV2.addRound({ matchId })                     -> { round, roundPlayers }
matchV2.scoreRound({
  matchId, roundNumber, playerId,
  primaryVp, secondaryVp, cpGained, cpSpent, notes?
})                                                -> scoreEvent
matchV2.close({ matchId, result, conclusion? })   -> matchV2

// Matches (v1 — legacy, retained for historical data)
match.start({
  opponentFaction, mission, listId?,
  isTournament?, opponentName?, opponentDetachment?,
  yourFaction?, yourDetachment?,
  terrainLayout?, deploymentZone?,
  twistCards?, challengerCards?, requirePhotos?,
  attackerDefender?, whoGoesFirst?,
  date?, location?, tournamentName?, tournamentId?
})                                                -> match
match.get(id)                                     -> match + turns + secondaries
match.list()                                      -> match[]
match.close({ matchId, yourScore, theirScore })   -> { result, yourScore, theirScore }
match.startFromPairing({ pairingId })             -> match (auto-populated from tournament pairing)

// Turns (V3 — per-player fields)
turn.add({
  matchId, turnNumber,
  yourUnitsLost, theirUnitsLost, primaryScored, secondaryScored, cpSpent,  // legacy
  yourCpStart?, yourCpGained?, yourCpSpent?,
  theirCpStart?, theirCpGained?, theirCpSpent?,
  yourPrimary?, theirPrimary?, yourSecondary?, theirSecondary?,
  yourPhotoDataUrl?, theirPhotoDataUrl?,
  yourUnitsDestroyed?, theirUnitsDestroyed?,
  stratagems?: [{ player, stratagemName, cpCost }],
  notes?, photoDataUrl?
})
turn.update({ turnId, ...fields })

// Secondaries (V3)
secondary.set({ matchId, player, secondaryName })   -> matchSecondary
secondary.score({ secondaryId, roundNumber, vp })    -> matchSecondary
secondary.list({ matchId })                          -> matchSecondary[]
secondary.remove({ secondaryId })                    -> void
```

---

## Testing

Server and client suites run with Vitest; current counts come from the test run, not this doc.
match.test.ts generates its fixture DDL from the `packages/db` schema via `createTestTables`
(`@tabletop-tools/db/src/test-ddl`), so the fixture cannot drift from schema.ts. Prefer that
helper over hand-rolled CREATE TABLE fixtures in new server tests.

```
server/src/
  lib/
    scoring/result.ts / result.test.ts              <- 3 tests
    storage/r2.ts / r2.test.ts                       <- 6 tests
  routers/
    match.test.ts                                    <- 23 tests
    matchV2.test.ts                                  <- 8 tests: start, get, addRound, scoreRound, close
    mission.test.ts                                  <- 4 tests: listPrimaries, listSecondaries, getGameStates
    turn.test.ts                                     <- 9 tests: add (with V3 fields + stratagems), update
    secondary.test.ts                                <- 14 tests: set, score, list, remove
  server.test.ts                                     <- 6 tests: HTTP session integration

client/src/components/
  GameTrackerScreen.test.tsx               <- 13 tests: screen router, wizard flow, navigation
  MatchSetupScreen.test.tsx                <- 14 tests: fields, validation, tournament toggle
  MissionSetupScreen.test.tsx              <- 20 tests: mission/deployment/terrain, twist/challenger cards, photos, data-driven + fallback
  PregameScreen.test.tsx                   <- 7 tests: attacker/defender, who goes first
  BattleScreen.test.tsx                    <- 9 tests: scoreboard, round wizard, end game
  EndGameScreen.test.tsx                   <- 13 tests: result, per-player stats, secondaries, rounds
  battle/
    VpStepper.test.tsx                     <- 6 tests: increment/decrement, min/max
    Scoreboard.test.tsx                    <- 7 tests: round number, VP, CP, opponent, player labels, VP highlighting
    StratagemPicker.test.tsx               <- 6 tests: add/remove, input validation
    UnitPicker.test.tsx                    <- 7 tests: add/remove, custom label
    SecondaryPicker.test.tsx               <- 8 tests: add/remove/score, VP display
    PhotoCaptureScreen.test.tsx            <- 6 tests: capture, skip, required
    CommandPhaseScreen.test.tsx            <- 9 tests: CP, VP, secondaries, stratagems
    ActionPhaseScreen.test.tsx             <- 8 tests: units, stratagems, notes
    TurnFlow.test.tsx                      <- 5 tests: phase transitions, photo flow
    RoundSummary.test.tsx                  <- 8 tests: per-player data, confirm/back
    RoundWizard.test.tsx                   <- 7 tests: turn order, save, back
  mission/
    CountScorer.test.tsx                   <- 5 tests: render, increment, decrement, min, max
    ChecklistScorer.test.tsx               <- 3 tests: render, checked state, onChange
    TierScorer.test.tsx                    <- 3 tests: render tiers, selection, onChange
    ActionScorer.test.tsx                  <- 3 tests: label, completed state, onChange
    ZonedCountScorer.test.tsx              <- 2 tests: render zones, onChange
    MissionScorer.test.tsx                 <- 3 tests: count dispatch, checklist dispatch, unknown pattern
```

```bash
cd apps/game-tracker/server && pnpm test
cd apps/game-tracker/client && pnpm test   # 178 client tests
```
