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
|  - Match router                 |
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
```

---

## tRPC Routers

```typescript
// Matches
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

**196 tests** (58 server + 138 client), all passing.

```
server/src/
  lib/
    scoring/result.ts / result.test.ts              <- 3 tests
    storage/r2.ts / r2.test.ts                       <- 6 tests
  routers/
    match.test.ts                                    <- 20 tests: start, list, get, close, startFromPairing
    turn.test.ts                                     <- 9 tests: add (with V3 fields + stratagems), update
    secondary.test.ts                                <- 14 tests: set, score, list, remove
  server.test.ts                                     <- 6 tests: HTTP session integration

client/src/components/
  GameTrackerScreen.test.tsx               <- 13 tests: screen router, wizard flow, navigation
  MatchSetupScreen.test.tsx                <- 10 tests: fields, validation, tournament toggle
  MissionSetupScreen.test.tsx              <- 11 tests: mission/deployment/terrain, twist/challenger/photos
  PregameScreen.test.tsx                   <- 7 tests: attacker/defender, who goes first
  BattleScreen.test.tsx                    <- 9 tests: scoreboard, round wizard, end game
  EndGameScreen.test.tsx                   <- 13 tests: result, per-player stats, secondaries, rounds
  battle/
    VpStepper.test.tsx                     <- 6 tests: increment/decrement, min/max
    Scoreboard.test.tsx                    <- 4 tests: round number, VP, CP, opponent
    StratagemPicker.test.tsx               <- 7 tests: add/remove, input validation
    UnitPicker.test.tsx                    <- 7 tests: add/remove, custom label
    SecondaryPicker.test.tsx               <- 8 tests: add/remove/score, VP display
    PhotoCaptureScreen.test.tsx            <- 6 tests: capture, skip, required
    CommandPhaseScreen.test.tsx            <- 9 tests: CP, VP, secondaries, stratagems
    ActionPhaseScreen.test.tsx             <- 8 tests: units, stratagems, notes
    TurnFlow.test.tsx                      <- 5 tests: phase transitions, photo flow
    RoundSummary.test.tsx                  <- 8 tests: per-player data, confirm/back
    RoundWizard.test.tsx                   <- 7 tests: turn order, save, back
```

```bash
cd apps/game-tracker/server && pnpm test   # 58 server tests
cd apps/game-tracker/client && pnpm test   # 138 client tests
```
