# CLAUDE.md — NoCheat

> Read SOUL.md first. Every decision here flows from it.

---

## What This Project Is

NoCheat analyzes photos or video of dice rolls to detect loaded dice using statistical analysis. It is a single-user tool at its core, tracking named dice sets and sessions per user over time.

---

## Platform: Tabletop Tools

NoCheat is the first app in the **Tabletop Tools** platform — a monorepo of tools for tabletop gamers. One login. Shared UI. Each tool deploys independently.

```
tabletop-tools/
  packages/
    ui/       ← shared components, dark theme, Geist, shadcn
    auth/     ← shared Better Auth — one login across all tools
    db/       ← shared Turso schema and Drizzle client
  apps/
    nocheat/  ← dice cheat detection (this project)
    ...       ← future tools
```

---

## Architecture: Two-Tier with tRPC

```
┌─────────────────────────────────┐
│  Tier 1: React Client           │
│  - Login / Auth UI              │
│  - Camera / file upload         │
│  - Session results display      │
│  - tRPC client (type-safe)      │
└────────────────┬────────────────┘
                 │ tRPC over HTTP
┌────────────────▼────────────────┐
│  Tier 2: tRPC Server            │
│  - Auth router                  │
│  - Session router               │
│  - CV layer (pip reader)        │
│  - Statistical engine (Z-score) │
│  - SQLite via Turso (edge DB)   │
└─────────────────────────────────┘
```

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Throughout — front to back, no exceptions |
| Runtime | Node.js | Stable, full ecosystem compatibility |
| Package Manager | pnpm | Fast, strict, disk-efficient — no hoisting surprises |
| Bundler | Vite | Best DX for React, fast HMR, esbuild under the hood |
| Test Runner | Vitest | Pairs naturally with Vite, same config, fast |
| API | tRPC + Zod | Type-safe end-to-end, no REST boilerplate |
| UI | React | Clean, uncluttered, easy to use |
| Database | Turso (libSQL/SQLite) | Edge-compatible, lean, no heavy ORM |
| ORM | Drizzle | Lightweight, type-safe, SQLite-native |
| Auth | Better Auth | TypeScript-first, self-hosted |
| Deploy | Cloudflare Workers + Pages | Free tier covers personal use — near-zero cost |
| Statistics | simple-statistics | Z-score, chi-squared, mean, std deviation |
| CV | TensorFlow.js (@tensorflow/tfjs) | Pip detection in the browser — image never leaves the device |

---

## Database Schema

```typescript
// users
id            TEXT PRIMARY KEY
email         TEXT UNIQUE NOT NULL
username      TEXT UNIQUE NOT NULL
password_hash TEXT NOT NULL
created_at    INTEGER NOT NULL

// dice_sets
id         TEXT PRIMARY KEY
user_id    TEXT NOT NULL  -- references users.id
name       TEXT NOT NULL
created_at INTEGER NOT NULL

// sessions
// One session = one sitting (one opponent, one dice set, many rolls)
id            TEXT PRIMARY KEY
user_id       TEXT NOT NULL     -- references users.id
dice_set_id   TEXT NOT NULL     -- references dice_sets.id
opponent_name TEXT              -- optional: who they were playing against
z_score       REAL              -- computed when session is closed
is_loaded     INTEGER           -- 1 = loaded, 0 = fair, null = in progress
photo_url     TEXT              -- null unless loaded + user saves evidence (Cloudflare R2)
created_at    INTEGER NOT NULL
closed_at     INTEGER           -- null while session is open

// rolls
// Each roll is one photo → pip values captured within a session
id          TEXT PRIMARY KEY
session_id  TEXT NOT NULL  -- references sessions.id
pip_values  TEXT NOT NULL  -- JSON array: [3,5,2,6,1,4,...]
created_at  INTEGER NOT NULL
```

---

## tRPC Routers

```typescript
// Auth
auth.register(email, username, password)
auth.login(email, password)     → session token
auth.me()                       → current user

// Dice Sets
diceSet.create(name)
diceSet.list()

// Sessions
session.start({ diceSetId, opponentName? })   → session
session.addRoll({ sessionId, pipValues })      → { rollCount, zScoreSoFar }
session.close({ sessionId, savePhoto? })       → { zScore, isLoaded }
session.list(diceSetId?)
session.get(id)                                → session + all rolls
```

---

## User Flow (Frictionless by Design)

```
Login (once)
  → Tap your dice set
  → Start session (opponent name optional)
  → Live camera opens (rear-facing, getUserMedia)

  LOOP — repeat for each roll:
    → Point at dice → tap to capture frame
    → TensorFlow.js reads pips (browser-side)
    → Frame discarded
    → Pip values sent to server
    → Running Z-score shown ("Roll 4 of your session")

  CLOSE SESSION:
    → Tap "Done"
    → Final Z-score computed across all rolls

    IF FAIR:
      → "These dice look fair" — session saved

    IF LOADED:
      → "These dice are loaded"
      → Prompt: "Save evidence photo?"
          YES → Capture one final frame → upload to Cloudflare R2
          NO  → Session saved without photo
```

No session naming. No manual input required. Sessions are labeled automatically per dice set.
Photos are only ever stored when dice are flagged as loaded AND the user explicitly chooses to save them.

### Camera Integration

```javascript
// Rear-facing live stream — works in Safari on iOS 11+, requires HTTPS
navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
```

Cloudflare provides HTTPS automatically. No native app required — runs in the browser on iPhone.

---

## Future Apps (Tabletop Tools Platform)

### Combat Simulator (`apps/versus`)
Pit two Warhammer 40K units against each other — ranged or melee — and calculate the statistical outcome.

**Attack sequence (40K):**
```
Attacks
  → Hit rolls     (hit on X+, rerolls if applicable)
  → Wound rolls   (wound on X+ from Strength vs Toughness table)
  → Save rolls    (armor save or invulnerable save)
  → Damage        (wounds applied, models removed)
  → Survivors
```

**Output:** Expected wounds dealt, models removed, survivors — plus full best/worst case distribution.

**Unit data source: BSData (github.com/BSData)**
- Community-maintained 40K army data files (`.cat`, `.gst` XML format)
- Covers all factions, unit profiles, weapons, abilities
- Actively maintained after GW shut down BattleScribe
- Parse XML → transform to JSON → load into shared Turso DB
- Periodic sync as new codexes and balance dataslates release

**Target system:** Warhammer 40K only.

---

### Meta List Builder (`apps/listbuilder`)
A smart army list builder where every unit in a codex carries a live performance rating based on real GT+ tournament data. As you build a list, the tool surfaces higher-rated alternatives at the same points cost.

**How ratings work:**
- Every unit is scored by win-rate contribution and points efficiency from GT+ event results
- Ratings are rolling and current — they update as new tournament data comes in
- Ratings reset when GW releases a new balance dataslate or codex update
- Old data is discarded — only the current meta window counts

**Data source: BCP (Best Coast Pairings) — GT and larger events only**
- Scraped from BCP using a personal account
- GT+ filter ensures player skill is consistent enough for unit performance data to be meaningful
- Local and small events excluded — too much skill variance
- Scraper runs on a schedule, ingests new GT results, recalculates all ratings

**List builder behavior:**
```
User adds unit → tool shows:
  Unit: Redemptor Dreadnought  85pts  Rating: C+
  Suggestion: Brutalis Dreadnought  90pts  Rating: A-
              (+5pts, significantly higher win contribution)
```

**Unit profiles:** Sourced from BSData (shared with Combat Simulator — same DB table).

---

### Match Tracker (`apps/tracker`)
A live game companion. Records the full match turn by turn — one photo per turn of the board state, plus what happened that turn.

**Per turn:**
```
Turn N
  📷 One photo — board state
  Units destroyed (you)    → tapped from your loaded army list
  Units destroyed (them)   → tapped from opponent's faction units
  Primary objectives scored
  Secondary objectives scored
  CP spent
```

**Match setup:**
- Your list loaded from the list builder
- Opponent's faction selected from BSData
- Mission selected

**End of match:**
- Final score, win/loss/draw
- Full turn-by-turn history with photos
- Feeds personal win rate data back into list builder ratings

**Ties to NoCheat:**
- If dice seem suspicious mid-match, one tap opens a dice check session, then returns to the match

**Photos:** One per turn — stored per match. Unlike NoCheat, these are kept intentionally as the match record.

---

### Combat Simulator — How It Differs from Unit Crunch

Unit Crunch is the community benchmark. The Versus app is not a replacement — it's a different product.

**Unit Crunch:** A standalone calculator. You type every stat, every rule, every modifier. It calculates. That's it.

**Versus:** A tool that knows your army, knows the meta, and tells you things you didn't know to ask.

| | Unit Crunch | Versus |
|---|---|---|
| Unit stats | Manual entry | Auto-loaded from BSData |
| Special rules | Manual entry | Auto-loaded from BSData |
| Army context | None | Lives inside your list |
| Rule updates | Whatever you typed | Syncs with BSData automatically |
| Meta context | None | GT win rates wrapped around the math |

**Rules engine — modifier pipeline:**
```typescript
type WeaponAbility =
  | { type: 'SUSTAINED_HITS'; value: number }  // extra hits on unmodified 6
  | { type: 'LETHAL_HITS' }                    // auto-wound on unmodified 6 to hit
  | { type: 'DEVASTATING_WOUNDS' }             // mortal wound on unmodified 6 to wound
  | { type: 'TORRENT' }                        // auto-hit, skip hit roll
  | { type: 'TWIN_LINKED' }                    // re-roll wound rolls
  | { type: 'BLAST' }                          // minimum 3 hits vs 6+ models
  | { type: 'REROLL_HITS_OF_1' }
  | { type: 'REROLL_HITS' }
  | { type: 'REROLL_WOUNDS' }
  | { type: 'HIT_MOD'; value: number }
  | { type: 'WOUND_MOD'; value: number }

simulate(attacker, defender):
  → resolveAttacks()   // flat or dice average
  → resolveHits()      // TORRENT, HIT_MOD, REROLL_HITS, SUSTAINED_HITS, LETHAL_HITS
  → resolveWounds()    // WOUND_MOD, REROLL_WOUNDS, DEVASTATING_WOUNDS
  → resolveSaves()     // armor save, invuln save, FNP
  → resolveDamage()    // flat or dice average
```

Rules are sourced from BSData XML and mapped to typed ability objects. Free-text abilities require manual mapping to enum values — known challenge.

---

## Open Decisions

- **Hardware path**: Arduino + camera module is a future option, not MVP.

---

## UI

### Component Library
**shadcn/ui + Tailwind CSS** — components you own, not a dependency. Built on Radix UI primitives. TypeScript-native, Vite-compatible, include only what you use.

### Theme: Dark, clean, data-forward
```
Background:    slate-950  (#0f172a)  — near black
Surface:       slate-900  (#0f172a)  — cards, panels
Border:        slate-800  (#1e293b)  — subtle separation
Text:          slate-100  (#f1f5f9)  — primary
Muted text:    slate-400  (#94a3b8)  — labels, secondary

Accent:        amber-400  (#fbbf24)  — buttons, highlights, active states

Result FAIR:   emerald-400 (#34d399) — all clear
Result LOADED: red-400    (#f87171)  — caught
```

### Typography
**Geist** — clean, modern, readable at small sizes. Free. Excellent for data-heavy UIs.

### Result Screen
The result must be bold, immediate, and unambiguous:
```
┌─────────────────────────┐
│                         │
│   ● LOADED DICE         │  ← red-400, large
│                         │
│   Z-score: 2.84         │
│   Expected: 16.7%       │
│   Observed: 34.2% (6s)  │
│                         │
│  [ Save Evidence ]      │  ← amber button
│  [ Dismiss ]            │  ← ghost button
│                         │
└─────────────────────────┘
```

---

## Rules for Every Session

- Plan before touching anything — understand every layer first.
- No features that aren't needed yet.
- Validate statistically before claiming anything.
- Keep the stack shallow. Don't add layers.
- Stop when it works. Don't polish what doesn't need polishing.

---

## Testing: TDD Required

**Tests are written before the code. No exceptions.**

The workflow for every change:

1. Write the test — define what the code must do
2. Run it — confirm it fails (red)
3. Write the code — make it pass
4. Run it again — confirm it passes (green)
5. Refactor if needed — tests still pass

```bash
pnpm test --watch   # keep this running during development
```

Tests live next to the code they test:
```
src/
  lib/
    stats/
      zscore.ts
      zscore.test.ts
    cv/
      pipReader.ts
      pipReader.test.ts
```

The statistical engine especially must be fully tested. Z-score calculations, distribution checks, loaded/fair thresholds — all covered before any of that code ships.
