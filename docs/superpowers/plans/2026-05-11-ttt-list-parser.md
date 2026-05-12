# TTT List Parser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse raw BCP army list text into structured TTT package JSON (Layer 1 Meta + Layer 2 List), storing the result in `meta_event_players.list_ttt`. Runs incrementally after each scrape.

**Architecture:** Parser lives in `apps/bcp-scraper/server/src/lib/`. Format detector identifies GW App vs BattleScribe format, delegates to the appropriate parser. Both output the same `TTTPackage` interface. Triggered by the scraper Worker after pairings are written, or manually via admin. Uses existing `faction-map.ts` for faction normalization.

**Tech Stack:** TypeScript, regex-based parsing, Drizzle ORM, existing bcp-scraper Worker.

**Specs:** `docs/superpowers/specs/2026-05-11-ttt-list-parser-design.md`, `docs/superpowers/plans/2026-04-30-ttt-list-format.md`

---

## Critical Context: Input Format

The scraped list text from BCP has **no newlines** in GW App format — the Playwright scraper's `innerText` extraction collapsed them. The text looks like:

```
Wu-Tang it (1990 Points)Adeptus MechanicusHaloscreed Battle CladeStrike Force (2,000 Points)CHARACTERSBelisarius Cawl (210 Points)  • Warlord  • 1x Solar Atomiser
```

The parser must split on structural markers (role headers, bullet characters, points patterns) rather than newlines.

BattleScribe format retains structure via `+` prefixes and `[Npts]` patterns.

Some list text is actually scraped HTML (`<div>`, `body {`, etc.) — these should be detected and marked as `failed`.

---

## File Structure

### New files in `apps/bcp-scraper/server/src/lib/`

```
ttt-types.ts           — TTTPackage, TTTUnit interfaces (from TTT format doc)
format-detector.ts     — Detect GW App vs BattleScribe vs unknown
gw-parser.ts           — Parse GW App/New Recruit format
bs-parser.ts           — Parse BattleScribe format
list-parser.ts         — Orchestrator: detect format → parse → return TTTPackage
parse-lists.ts         — Batch processor: read unparsed rows, parse, write back

format-detector.test.ts
gw-parser.test.ts
bs-parser.test.ts
list-parser.test.ts
parse-lists.test.ts
```

### Modified files

```
packages/db/src/schema.ts              — Add list_ttt column to metaEventPlayers
apps/bcp-scraper/server/src/worker.ts  — Call parseLists after pipeline
apps/admin/server/src/routers/stats.ts — Add parse status + trigger endpoint
apps/admin/client/src/pages/ScraperPage.tsx — Add parse stats + button
```

---

## Task 1: TTT Type Definitions

**Files:**
- Create: `apps/bcp-scraper/server/src/lib/ttt-types.ts`

Define the TTTPackage and TTTUnit interfaces from the TTT format doc, Layer 1 + 2 only.

- [ ] **Step 1: Create type file**

```typescript
// ttt-types.ts
export interface TTTPackage {
  version: 1
  parsedWith: string          // 'gw-app-v1' | 'battlescribe-v1' | 'unknown'
  parseStatus: 'ok' | 'partial' | 'failed'
  parseError?: string

  meta: {
    name: string
    totalPoints: number
    edition: '10th' | '11th'
    battleSize: 'Combat Patrol' | 'Incursion' | 'Strike Force' | 'Onslaught' | 'unknown'
    source: 'bcp-import'
  }

  list: {
    factionId: string
    factionName: string
    subfactionId?: string
    subfactionName?: string
    detachmentId?: string
    detachmentName?: string
    units: TTTUnit[]
  }

  exports?: {
    rawSource: string           // original unparsed text
  }
}

export interface TTTUnit {
  name: string
  role: 'Epic Hero' | 'Character' | 'Battleline' | 'Other' | 'Dedicated Transport' | 'Fortification' | 'Allied' | 'unknown'
  models: number
  points: number
  wargear: string[]
  enhancement?: string
  isWarlord?: boolean
}
```

- [ ] **Step 2: Commit**

---

## Task 2: Format Detector

**Files:**
- Create: `apps/bcp-scraper/server/src/lib/format-detector.ts`
- Create: `apps/bcp-scraper/server/src/lib/format-detector.test.ts`

Examines the first ~200 characters of list text and returns `'gw-app' | 'battlescribe' | 'html' | 'unknown'`.

- [ ] **Step 1: Write failing tests**

```typescript
describe('detectFormat', () => {
  it('detects GW App format — name followed by points in parens', () => {
    expect(detectFormat('Wu-Tang it (1990 Points)Adeptus Mechanicus...')).toBe('gw-app')
  })
  it('detects BattleScribe format — +++ header', () => {
    expect(detectFormat('+++++++ FACTION KEYWORD: Chaos...')).toBe('battlescribe')
  })
  it('detects HTML — starts with tags or body/div', () => {
    expect(detectFormat('You need to enable JavaScript...<div')).toBe('html')
    expect(detectFormat('  body { background-image...')).toBe('html')
  })
  it('returns unknown for unrecognizable text', () => {
    expect(detectFormat('just some random words')).toBe('unknown')
  })
  it('handles empty string', () => {
    expect(detectFormat('')).toBe('unknown')
  })
})
```

- [ ] **Step 2: Implement**

Detection rules:
1. If contains `+++` or `FACTION KEYWORD:` or `DETACHMENT:` → `battlescribe`
2. If contains `<div` or `<body` or `body {` or `enable JavaScript` → `html`
3. If matches `/^.{1,80}\(\d[\d,]*\s*[Pp]oints?\)/` → `gw-app`
4. Otherwise → `unknown`

- [ ] **Step 3: Run tests, commit**

---

## Task 3: GW App Parser

**Files:**
- Create: `apps/bcp-scraper/server/src/lib/gw-parser.ts`
- Create: `apps/bcp-scraper/server/src/lib/gw-parser.test.ts`

The most complex task. Parses the no-newline GW App format.

- [ ] **Step 1: Write failing tests with real 2026 BCP data**

Use these exact samples from production:

**Sample 1 (Tyranids):**
```
Unearthing My First (1995 Points)TyranidsSubterranean AssaultStrike Force (2,000 Points)CHARACTERSHive Tyrant (215 Points)  • Warlord  • 1x Heavy venom cannon  • 1x Monstrous bonesword and lash whip  • Enhancements: Tremor SensesHyperadapted Raveners (165 Points)  • 1x Ravener Prime     ◦ 1x Prime claws and talons  • 4x Raveners     ◦ 4x Ravener heavy claws and talons     ◦ 1x Venom bolt
```

Expected output:
- name: "Unearthing My First"
- totalPoints: 1995
- factionName: "Tyranids", factionId: "tyranids"
- detachmentName: "Subterranean Assault"
- battleSize: "Strike Force"
- units: Hive Tyrant (215, Character, warlord), Hyperadapted Raveners (165, Other)

**Sample 2 (Grey Knights):**
```
Grey Knight List (1990)Grey KnightsStrike Force (2000 points)Warpbane Task ForceCHARACTERSCastellan Crowe (90 points)  • Warlord  • 1x Black Blade of Antwyr
```

Note: detachment appears AFTER battle size here. Parser must handle both orders.

**Sample 3 (Imperial Knights — no detachment line before battle size):**
```
.plan D (1990 Points)When in doubt, shoveImperial KnightsQuestoris CompanionsStrike Force (2,000 Points)CHARACTERS
```

Note: "When in doubt, shove" is a subtitle/flavor text between name and faction. Parser needs to find faction by matching against known faction names.

- [ ] **Step 2: Implement GW App parser**

Parsing strategy (no newlines available):

1. **Extract name + points** from start: match `/^(.+?)\s*\((\d[\d,]*)\s*[Pp]oints?\)/`
2. **Find faction** by scanning for known faction names (use `BCP_FACTION_TO_SLUG` keys)
3. **Find battle size** by matching `(Strike Force|Incursion|Onslaught|Combat Patrol)\s*\(\d`
4. **Find detachment** — text between faction and battle size (or between battle size and first role header)
5. **Split into role sections** at `CHARACTERS`, `OTHER DATASHEETS`, `BATTLELINE`, `ALLIED UNITS`, `DEDICATED TRANSPORTS`, `FORTIFICATIONS`
6. **Parse each unit** within a section:
   - Unit name + points: match against `([A-Z][\w\s'-]+)\s*\((\d+)\s*[Pp]oints?\)`
   - Wargear: `•` bullet items, `◦` sub-items
   - Enhancement: `Enhancement[s]?: (.+)` or `Enhancements: (.+)`
   - Warlord: standalone `Warlord` bullet
   - Model count: `(\d+)x` prefix on unit name

- [ ] **Step 3: Run tests, iterate until all samples parse correctly**
- [ ] **Step 4: Commit**

---

## Task 4: BattleScribe Parser

**Files:**
- Create: `apps/bcp-scraper/server/src/lib/bs-parser.ts`
- Create: `apps/bcp-scraper/server/src/lib/bs-parser.test.ts`

- [ ] **Step 1: Write failing tests with real BattleScribe data**

**Sample:**
```
++++++++++++++++++++++++++++++++++++++++++++++++ FACTION KEYWORD: Chaos - Chaos Space Marines+ DETACHMENT: Pactbound Zealots (Marks of Chaos)+ TOTAL ARMY POINTS: 2000pts++ WARLORD: Char1: Abaddon the Despoiler+ ENHANCEMENT: Intoxicating Elixir (on Char4: Lord Discordant on Helstalker)+ NUMBER OF UNITS: 16Char1: 1x Abaddon the Despoiler (270 pts): Warlord, Drach'nyen, Talon of Horus
```

Expected:
- factionName: "Chaos Space Marines", factionId: "chaos-space-marines"
- detachmentName: "Pactbound Zealots"
- totalPoints: 2000
- units: Abaddon the Despoiler (270, Epic Hero, warlord)

- [ ] **Step 2: Implement BattleScribe parser**

Parsing strategy:
1. Extract faction from `FACTION KEYWORD: (.+)` — strip "Chaos - " prefix if present
2. Extract detachment from `DETACHMENT: (.+?)(?:\s*\(|$)`
3. Extract total points from `TOTAL ARMY POINTS: (\d+)pts`
4. Extract warlord from `WARLORD: .+?: (.+)`
5. Split units at `Char\d+:` or `\w+\d+:` prefixes
6. For each unit: name, points `(\d+) pts`, wargear after colon

- [ ] **Step 3: Run tests, commit**

---

## Task 5: List Parser Orchestrator

**Files:**
- Create: `apps/bcp-scraper/server/src/lib/list-parser.ts`
- Create: `apps/bcp-scraper/server/src/lib/list-parser.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('parseList', () => {
  it('parses GW App format and returns TTTPackage', () => {
    const result = parseList('Wu-Tang it (1990 Points)Adeptus Mechanicus...')
    expect(result.parseStatus).toBe('ok')
    expect(result.parsedWith).toBe('gw-app-v1')
    expect(result.list.factionId).toBe('adeptus-mechanicus')
  })
  it('parses BattleScribe format', () => {
    const result = parseList('++++ FACTION KEYWORD: Chaos...')
    expect(result.parsedWith).toBe('battlescribe-v1')
  })
  it('returns failed for HTML', () => {
    const result = parseList('<div>some html</div>')
    expect(result.parseStatus).toBe('failed')
  })
  it('returns failed for unknown format', () => {
    const result = parseList('random text')
    expect(result.parseStatus).toBe('failed')
    expect(result.exports?.rawSource).toBe('random text')
  })
})
```

- [ ] **Step 2: Implement** — detect format, delegate to parser, normalize faction/detachment, return TTTPackage
- [ ] **Step 3: Run tests, commit**

---

## Task 6: Database — Add list_ttt Column

**Files:**
- Modify: `packages/db/src/schema.ts` — add `listTtt` column to `metaEventPlayers`
- Generate migration
- Update test CREATE TABLE SQL

- [ ] **Step 1: Add column**

```typescript
// In metaEventPlayers table definition, after listText:
listTtt: text('list_ttt'),
```

- [ ] **Step 2: Generate migration**: `cd packages/db && pnpm drizzle-kit generate`
- [ ] **Step 3: Apply to production**: `ALTER TABLE meta_event_players ADD COLUMN list_ttt TEXT`
- [ ] **Step 4: Update test SQL, run tests**
- [ ] **Step 5: Commit**

---

## Task 7: Batch Processor

**Files:**
- Create: `apps/bcp-scraper/server/src/lib/parse-lists.ts`
- Create: `apps/bcp-scraper/server/src/lib/parse-lists.test.ts`

Reads unparsed rows from `meta_event_players`, parses them, writes back.

- [ ] **Step 1: Write failing tests**

Test with in-memory DB: insert a player with `list_text` but no `list_ttt`, run processor, verify `list_ttt` is populated.

- [ ] **Step 2: Implement**

```typescript
export async function parsePendingLists(db: Db): Promise<{
  parsed: number
  partial: number
  failed: number
  skipped: number
}> {
  // Select rows where list_ttt IS NULL AND list_text IS NOT NULL
  // Filter to 2026 events only (join meta_events on date)
  // For each row: parseList(list_text), update list_ttt with JSON result
  // Process in chunks of 100 to stay within Worker limits
}
```

- [ ] **Step 3: Run tests, commit**

---

## Task 8: Wire into Worker + Admin

**Files:**
- Modify: `apps/bcp-scraper/server/src/worker.ts` — call `parsePendingLists` after pipeline
- Modify: `apps/admin/server/src/routers/stats.ts` — add parse stats endpoint
- Modify: `apps/admin/client/src/pages/ScraperPage.tsx` — show parse stats

- [ ] **Step 1: Add to worker.ts** — after `runPipeline(db)`, call `parsePendingLists(db)`
- [ ] **Step 2: Add admin endpoint** — `listParserStatus` query returning parsed/pending/failed counts
- [ ] **Step 3: Add to ScraperPage** — show parse stats card, "Parse Lists" button
- [ ] **Step 4: Run all tests**
- [ ] **Step 5: Deploy and verify**
- [ ] **Step 6: Commit**
