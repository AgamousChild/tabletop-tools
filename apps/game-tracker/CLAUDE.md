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

## Features required to be considered functional

1. This integrates with the tournament tracker. Whatever we do here, this is the SAME interface for recording matches in a tournament.
2. If not supplied by the tournament tracker, these are the required inputs at the start of the game:
    a. Date (Auto, but can be edited  if not a part of a tournament)
    b. Location (Auto from tournament data, but optional  if not a part of a tournament)
    c. Tournament Name (Auto from tournament data, but optional if not a part of a tournament)
    d. These extra fields are only shown if in a tournament, set automatically (current round, current place for each player, current record for each player)
    e. Opponent Name (Auto from tournament)
    f. Your name is set from login.
    g. Opponent faction (Auto from tournament)
    f. Opponent detachment (Auto from tournament)
    g. Opponent list (Auto from tournament, but optional if not a part of a tournament)
    h. Show Current selected list from list builder, and if not a part of a tournament, allow for a change to pick a different list.
3. The second screen should be the following.
    a. Dropdown for mission selection (Auto from tournament, otherwise allow selection)
    b. Dropdown for Terrain layout (Auto from tournament, otherwise allow selection)
    c. Checkboxes for the following: Include Twists, Include Challenger Cards (Auto selected if a part of a tournament from tournament data)
    d. Require photos (Auto from Tournament)
4. The next screen should include two selectors, one for Attacker/Defender and another for Who goes first.
5. The next screen should be a total ripoff of TableTop Battles
except ours will work.
    a. CP tracking will use the standard rule (each player gets one at the start of each half turn, and allow for special rule additions, when a player adds a CP, the unit or rule used should be selected based opun their faction,detachment,units in their list, or this can be ignored)
    b. When a user uses a CP, the list of strategems is presented, and the user can select one or ignore.
    c. The user can select their secondaries randomly, or choose which is active for the round.
    d. Special mission rules for primary, twists, or other modifying rules are all shown based upon the selected items, and modify primary score.
    e. Secondary scoring is done from each secondary chosen.
    f. Score can be modified by hand.
    g. Each half round requires photos of the board if required, and each round has it's own set of data.
6. The result at the end needs to be verified in the tournament tracker by the opponent if in a tournament.

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
opponent_name       TEXT              -- opponent display name
opponent_detachment TEXT              -- opponent detachment name
your_faction        TEXT              -- your faction
your_detachment     TEXT              -- your detachment
terrain_layout      TEXT              -- terrain layout name
deployment_zone     TEXT              -- deployment zone name
attacker_defender   TEXT              -- YOU_ATTACK | YOU_DEFEND
who_goes_first      TEXT              -- YOU | THEM
date                INTEGER           -- match date (epoch)
location            TEXT              -- location string
tournament_name     TEXT              -- tournament name (denormalized)
tournament_id       TEXT              -- FK to tournaments (optional)

// turns
id                TEXT PRIMARY KEY
match_id          TEXT NOT NULL     -- references matches.id
turn_number       INTEGER NOT NULL
photo_url         TEXT              -- Cloudflare R2
your_units_lost   TEXT NOT NULL     -- JSON: [{ contentId, name }]
their_units_lost  TEXT NOT NULL     -- JSON: [{ contentId, name }]
primary_scored    INTEGER NOT NULL
secondary_scored  INTEGER NOT NULL
cp_spent          INTEGER NOT NULL
notes             TEXT
created_at        INTEGER NOT NULL
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
  attackerDefender?, whoGoesFirst?,
  date?, location?, tournamentName?, tournamentId?
})                                                -> match
match.get(id)                                     -> match + all turns
match.list()                                      -> match[]
match.close({ matchId, yourScore, theirScore })   -> { result, yourScore, theirScore }
match.startFromPairing({ pairingId })             -> match (auto-populated from tournament pairing)

// Turns
turn.add({ matchId, turnNumber, yourUnitsLost, theirUnitsLost, primaryScored, secondaryScored, cpSpent, notes?, photoDataUrl })
turn.update({ turnId, ...fields })
```

---

## Testing

**97 tests** (40 server + 57 client), all passing.

```
server/src/
  lib/
    scoring/result.ts / result.test.ts
    storage/r2.ts / r2.test.ts
  routers/                                 <- router integration tests
server/src/server.test.ts                  <- HTTP session integration tests

client/src/components/
  GameTrackerScreen.test.tsx               <- 13 tests: screen router, wizard flow, navigation
  MatchSetupScreen.test.tsx                <- 10 tests: fields, validation, tournament toggle
  MissionSetupScreen.test.tsx              <- 7 tests: mission/deployment/terrain selectors
  PregameScreen.test.tsx                   <- 7 tests: attacker/defender, who goes first
  BattleScreen.test.tsx                    <- 9 tests: round tracking, VP/CP, end game
  EndGameScreen.test.tsx                   <- 11 tests: result, scores, stats, round breakdown
```

```bash
cd apps/game-tracker/server && pnpm test   # 40 server tests
cd apps/game-tracker/client && pnpm test   # 57 client tests
```
