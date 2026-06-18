# ETL — App Workers (tRPC + Hono)

> Application Workers that serve user requests and read/write Turso + R2.
> Related schema docs: [schema-turso.md](schema-turso.md), [schema-indexeddb-game-data.md](schema-indexeddb-game-data.md)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Gateway (Cloudflare Pages)                      │
│                                                                         │
│  tabletop-tools.net/                                                   │
│    ├── /auth/**         → auth-server Worker                           │
│    ├── /admin/trpc/**   → admin Worker                                 │
│    ├── /no-cheat/trpc/**→ no-cheat Worker                             │
│    ├── /versus/trpc/**  → versus Worker                                │
│    ├── /list-builder/trpc/** → list-builder Worker                    │
│    ├── /game-tracker/trpc/** → game-tracker Worker                    │
│    ├── /tournament/trpc/**   → tournament Worker                      │
│    ├── /new-meta/trpc/**     → new-meta Worker                        │
│    ├── /data-import/api/**   → data-import Worker                     │
│    └── /brain/api/**         → brain Worker                            │
│                                                                         │
│  Service bindings (zero-latency intra-CF routing)                      │
└─────────────────────────────────────────────────────────────────────────┘
                        │
                        ▼
         ┌──────────────────────────┐
         │  Turso (Single SQLite)   │
         │  49 tables               │
         │  All Workers share       │
         │  same DB instance        │
         └──────────────────────────┘
```

---

## 1. auth-server

**File:** `apps/auth-server/src/worker.ts`
**Type:** Hono Worker (Better Auth handler)
**Route:** `tabletop-tools.net/auth/**`

### Data Flow

```
Client (any app)
    → POST /auth/api/auth/sign-up/email
    → POST /auth/api/auth/sign-in/email
    → POST /auth/api/auth/sign-out
    → GET  /auth/api/auth/session
        │
        ▼
    ┌───────────────────┐
    │ Better Auth        │
    │   adapter          │
    └───────┬───────────┘
            ▼
    ┌───────────────────┐
    │ Turso             │
    │   user            │ ← read/write
    │   session         │ ← read/write
    │   account         │ ← read/write
    │   verification    │ ← read/write
    └───────────────────┘
```

### Turso Tables

| Table | Read | Write | Operations |
|-------|------|-------|------------|
| `user` | Yes | Yes | Create on signup, read on signin/session |
| `session` | Yes | Yes | Create on signin, delete on signout, read on session check |
| `account` | Yes | Yes | Create on signup (stores hashed password) |
| `verification` | Yes | Yes | Email verification tokens |

---

## 2. admin

**Files:** `apps/admin/server/src/routers/stats.ts`
**Type:** tRPC Worker (via server-core)
**Route:** `tabletop-tools.net/admin/trpc/**`

### Data Flow

```
Admin UI (email whitelist check)
    │
    ▼
┌────────────────────────────────────────────────────────┐
│ stats router (all adminProcedure)                      │
│                                                        │
│ overview()     → COUNT from all domain tables           │
│ recentUsers()  → SELECT user ORDER BY created_at DESC  │
│ activeSessions()→ SELECT session WHERE not expired     │
│ appActivity()  → COUNT per app domain tables           │
│ ingestJobs()   → SELECT ingest_jobs                    │
│ revokeSession()→ DELETE session                         │
│ deleteUser()   → DELETE user (cascades all data)       │
│ banUser()      → INSERT user_bans                       │
│ unbanUser()    → DELETE user_bans                       │
└────────────────────────────────────────────────────────┘
```

### Functions

| Function | File | Line | Description |
|----------|------|------|-------------|
| `stats.overview` | `apps/admin/server/src/routers/stats.ts` | — | Aggregate counts across all tables |
| `stats.recentUsers` | `apps/admin/server/src/routers/stats.ts` | — | Recent user signups |
| `stats.activeSessions` | `apps/admin/server/src/routers/stats.ts` | — | Non-expired sessions |
| `stats.revokeSession` | `apps/admin/server/src/routers/stats.ts` | — | Delete session by ID |
| `stats.deleteUser` | `apps/admin/server/src/routers/stats.ts` | — | Delete user + cascade |
| `stats.banUser` | `apps/admin/server/src/routers/stats.ts` | — | Insert user_bans row |
| `stats.unbanUser` | `apps/admin/server/src/routers/stats.ts` | — | Remove ban |
| `stats.ingestJobs` | `apps/admin/server/src/routers/stats.ts` | — | List content ingestor jobs |

### Turso Tables

| Table | Read | Write | Operations |
|-------|------|-------|------------|
| `user` | Yes | Yes (delete) | Count, list, delete |
| `session` | Yes | Yes (delete) | Count, list, revoke |
| `user_bans` | Yes | Yes | Ban/unban |
| `ingest_jobs` | Yes | No | List jobs |
| All domain tables | Yes (COUNT) | No | Stats overview |

---

## 3. no-cheat

**Files:** `apps/no-cheat/server/src/routers/diceSet.ts`, `session.ts`, `training.ts`
**Type:** tRPC Worker (via server-core)
**Route:** `tabletop-tools.net/no-cheat/trpc/**`

### Data Flow

```
User captures dice rolls
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│ diceSet router                                           │
│   create(name) → INSERT dice_sets                        │
│   list()       → SELECT dice_sets WHERE user_id          │
│                                                          │
│ session router                                           │
│   start(diceSetId) → INSERT sessions                     │
│   addRoll(sessionId, pipValues)                          │
│     → INSERT rolls                                       │
│     → compute Z-score (statistical engine)               │
│   undoLastRoll(sessionId) → DELETE last roll, recompute  │
│   close(sessionId) → UPDATE sessions (z_score, verdict)  │
│   savePhoto(sessionId, imageData)                        │
│     → R2 put EVIDENCE_BUCKET/no-cheat/{id}.jpg           │
│     → UPDATE sessions.photo_url                          │
│                                                          │
│ training router                                          │
│   saveExample(label, features, ...) → INSERT training_ex │
│   saveFrame(imageUrl, boxes) → INSERT training_frames    │
│   getExamples(diceSetId) → SELECT training_examples      │
│   getFrames(diceSetId) → SELECT training_frames          │
└──────────────────────────────────────────────────────────┘
```

### Functions

| Function | File | Description |
|----------|------|-------------|
| `diceSet.create` | `apps/no-cheat/server/src/routers/diceSet.ts` | Create dice set |
| `diceSet.list` | `apps/no-cheat/server/src/routers/diceSet.ts` | List user's dice sets |
| `session.start` | `apps/no-cheat/server/src/routers/session.ts` | Start rolling session |
| `session.addRoll` | `apps/no-cheat/server/src/routers/session.ts` | Record roll + compute stats |
| `session.undoLastRoll` | `apps/no-cheat/server/src/routers/session.ts` | Undo last roll |
| `session.close` | `apps/no-cheat/server/src/routers/session.ts` | Close session with verdict |
| `session.savePhoto` | `apps/no-cheat/server/src/routers/session.ts` | Upload evidence photo to R2 |
| `session.list` | `apps/no-cheat/server/src/routers/session.ts` | List sessions |
| `session.get` | `apps/no-cheat/server/src/routers/session.ts` | Get session + all rolls |
| `training.saveExample` | `apps/no-cheat/server/src/routers/training.ts` | Save ML training example |
| `training.saveFrame` | `apps/no-cheat/server/src/routers/training.ts` | Save training frame |

### Turso Tables

| Table | Read | Write |
|-------|------|-------|
| `dice_sets` | Yes | Yes |
| `sessions` | Yes | Yes |
| `rolls` | Yes | Yes (insert + delete) |
| `training_examples` | Yes | Yes |
| `training_frames` | Yes | Yes |

---

## 4. versus

**Files:** `apps/versus/server/src/routers/simulate.ts`
**Type:** tRPC Worker (via server-core)
**Route:** `tabletop-tools.net/versus/trpc/**`

### Data Flow

```
Client runs simulation (client-side pipeline)
    → save result to server
    │
    ▼
┌──────────────────────────────────────────────┐
│ simulate router                              │
│   save(attacker, defender, result, config)    │
│     → INSERT simulations                     │
│   history()                                   │
│     → SELECT simulations WHERE user_id       │
│   get(id)                                     │
│     → SELECT simulations WHERE id            │
└──────────────────────────────────────────────┘
```

### Functions

| Function | File | Description |
|----------|------|-------------|
| `simulate.save` | `apps/versus/server/src/routers/simulate.ts` | Save simulation result |
| `simulate.history` | `apps/versus/server/src/routers/simulate.ts` | List user's simulations |
| `simulate.get` | `apps/versus/server/src/routers/simulate.ts` | Get single simulation |

### Turso Tables

| Table | Read | Write |
|-------|------|-------|
| `simulations` | Yes | Yes |

---

## 5. list-builder

**Files:** `apps/list-builder/server/src/routers/rating.ts`, `list.ts`
**Type:** tRPC Worker (via server-core)
**Route:** `tabletop-tools.net/list-builder/trpc/**`

### Functions

| Function | File | Description |
|----------|------|-------------|
| `rating.get` | `apps/list-builder/server/src/routers/rating.ts` | Get unit rating by content ID |
| `rating.byFaction` | `apps/list-builder/server/src/routers/rating.ts` | All ratings for a faction |
| `list.sync` | `apps/list-builder/server/src/routers/list.ts` | Sync single list to server |
| `list.syncAll` | `apps/list-builder/server/src/routers/list.ts` | Batch sync all lists |
| `list.getAll` | `apps/list-builder/server/src/routers/list.ts` | Get all user's lists |
| `list.delete` | `apps/list-builder/server/src/routers/list.ts` | Delete list + units |

### Turso Tables

| Table | Read | Write |
|-------|------|-------|
| `unit_ratings` | Yes | No |
| `lists` | Yes | Yes |
| `list_units` | Yes | Yes |

---

## 6. game-tracker

**Files:** `apps/game-tracker/server/src/routers/match.ts`, `turn.ts`, `secondary.ts`
**Type:** tRPC Worker (via server-core, extended context with R2)
**Route:** `tabletop-tools.net/game-tracker/trpc/**`

### Functions

| Function | File | Description |
|----------|------|-------------|
| `match.start` | `apps/game-tracker/server/src/routers/match.ts` | Create match |
| `match.get` | `apps/game-tracker/server/src/routers/match.ts` | Get match + turns + secondaries |
| `match.list` | `apps/game-tracker/server/src/routers/match.ts` | List user's matches |
| `match.close` | `apps/game-tracker/server/src/routers/match.ts` | Close match, compute result |
| `match.startFromPairing` | `apps/game-tracker/server/src/routers/match.ts` | Create match from tournament pairing |
| `match.hide` | `apps/game-tracker/server/src/routers/match.ts` | Soft-delete match |
| `turn.add` | `apps/game-tracker/server/src/routers/turn.ts` | Add turn data |
| `turn.update` | `apps/game-tracker/server/src/routers/turn.ts` | Update turn data |
| `secondary.set` | `apps/game-tracker/server/src/routers/secondary.ts` | Set secondary objective |
| `secondary.score` | `apps/game-tracker/server/src/routers/secondary.ts` | Score VP for a round |
| `secondary.list` | `apps/game-tracker/server/src/routers/secondary.ts` | List match secondaries |
| `secondary.remove` | `apps/game-tracker/server/src/routers/secondary.ts` | Remove secondary |

### Turso Tables

| Table | Read | Write |
|-------|------|-------|
| `matches` | Yes | Yes |
| `turns` | Yes | Yes |
| `match_secondaries` | Yes | Yes |
| `stratagem_log` | Yes | Yes |
| `pairings` | Yes (for startFromPairing) | No |

---

## 7. tournament

**Files:** `apps/tournament/server/src/routers/tournament.ts`, `player.ts`, `round.ts`, `result.ts`, `elo.ts`, `card.ts`, `award.ts`
**Type:** tRPC Worker (via server-core)
**Route:** `tabletop-tools.net/tournament/trpc/**`

### Functions

| Function | File | Description |
|----------|------|-------------|
| `tournament.create` | `apps/tournament/server/src/routers/tournament.ts` | Create tournament |
| `tournament.get` | `apps/tournament/server/src/routers/tournament.ts` | Get tournament details |
| `tournament.listMine` | `apps/tournament/server/src/routers/tournament.ts` | List user's tournaments |
| `tournament.advanceStatus` | `apps/tournament/server/src/routers/tournament.ts` | Advance tournament state |
| `tournament.standings` | `apps/tournament/server/src/routers/tournament.ts` | Compute standings with SOS |
| `player.register` | `apps/tournament/server/src/routers/player.ts` | Register for tournament |
| `player.updateList` | `apps/tournament/server/src/routers/player.ts` | Submit/update army list |
| `player.checkIn` | `apps/tournament/server/src/routers/player.ts` | Check in at event |
| `player.drop` | `apps/tournament/server/src/routers/player.ts` | Drop from tournament |
| `round.generatePairings` | `apps/tournament/server/src/routers/round.ts` | Swiss pairing algorithm |
| `result.report` | `apps/tournament/server/src/routers/result.ts` | Report match result |
| `result.confirm` | `apps/tournament/server/src/routers/result.ts` | Confirm reported result |
| `result.override` | `apps/tournament/server/src/routers/result.ts` | TO override result |
| `elo.get` | `apps/tournament/server/src/routers/elo.ts` | Get player ELO |
| `elo.leaderboard` | `apps/tournament/server/src/routers/elo.ts` | ELO leaderboard |
| `card.issue` | `apps/tournament/server/src/routers/card.ts` | Issue yellow/red card |
| `award.create` | `apps/tournament/server/src/routers/award.ts` | Create custom award |
| `award.assign` | `apps/tournament/server/src/routers/award.ts` | Assign award to player |

### Turso Tables

| Table | Read | Write |
|-------|------|-------|
| `tournaments` | Yes | Yes |
| `tournament_players` | Yes | Yes |
| `rounds` | Yes | Yes |
| `pairings` | Yes | Yes |
| `tournament_cards` | Yes | Yes |
| `tournament_awards` | Yes | Yes |
| `player_elo` | Yes | Yes |
| `elo_history` | Yes | Yes |

---

## 8. new-meta

**Files:** `apps/new-meta/server/src/routers/meta.ts`, `player.ts`, `source.ts`, `admin.ts`
**Type:** tRPC Worker (via server-core)
**Route:** `tabletop-tools.net/new-meta/trpc/**`

### Functions

| Function | File | Description |
|----------|------|-------------|
| `meta.factions` | `apps/new-meta/server/src/routers/meta.ts` | Faction win rates |
| `meta.faction` | `apps/new-meta/server/src/routers/meta.ts` | Single faction deep stats |
| `meta.detachments` | `apps/new-meta/server/src/routers/meta.ts` | Detachment stats |
| `meta.matchups` | `apps/new-meta/server/src/routers/meta.ts` | Faction matchup matrix |
| `player.leaderboard` | `apps/new-meta/server/src/routers/player.ts` | Glicko-2 leaderboard |
| `player.profile` | `apps/new-meta/server/src/routers/player.ts` | Player rating history |
| `player.search` | `apps/new-meta/server/src/routers/player.ts` | Search players by name |
| `source.tournaments` | `apps/new-meta/server/src/routers/source.ts` | List imported tournaments |
| `admin.import` | `apps/new-meta/server/src/routers/admin.ts` | Import tournament CSV |
| `admin.recomputeGlicko` | `apps/new-meta/server/src/routers/admin.ts` | Recompute all Glicko-2 ratings |

### Turso Tables

| Table | Read | Write |
|-------|------|-------|
| `meta_events` | Yes | No (written by bcp-scraper) |
| `meta_event_players` | Yes | No |
| `meta_pairings` | Yes | No |
| `meta_top` | Yes | No (written by bcp-scraper pipeline) |
| `meta_for` | Yes | No |
| `fact_game_results` | Yes | No |
| `dim_faction` | Yes | No |
| `dim_subfaction` | Yes | No |
| `dim_detachment` | Yes | No |
| `imported_tournament_results` | Yes | Yes (admin.import) |
| `player_glicko` | Yes | Yes (admin.import, recomputeGlicko) |
| `glicko_history` | Yes | Yes |

---

## Gateway Proxy Functions

**Location:** `apps/gateway/functions/`

Each Pages Function strips the app prefix from the URL path and forwards to the bound Worker:

| File | Binding | Pattern |
|------|---------|---------|
| `functions/admin/trpc/[[path]].ts` | `ADMIN_API` | `/admin/trpc/*` → `/*` |
| `functions/no-cheat/trpc/[[path]].ts` | `NO_CHEAT_API` | `/no-cheat/trpc/*` → `/*` |
| `functions/versus/trpc/[[path]].ts` | `VERSUS_API` | `/versus/trpc/*` → `/*` |
| `functions/list-builder/trpc/[[path]].ts` | `LIST_BUILDER_API` | `/list-builder/trpc/*` → `/*` |
| `functions/game-tracker/trpc/[[path]].ts` | `GAME_TRACKER_API` | `/game-tracker/trpc/*` → `/*` |
| `functions/tournament/trpc/[[path]].ts` | `TOURNAMENT_API` | `/tournament/trpc/*` → `/*` |
| `functions/new-meta/trpc/[[path]].ts` | `NEW_META_API` | `/new-meta/trpc/*` → `/*` |
| `functions/data-import/api/[[path]].ts` | `DATA_IMPORT_API` | `/data-import/api/*` → `/*` |
| `functions/brain/api/[[path]].ts` | `BRAIN_API` | `/brain/api/*` → `/*` |
