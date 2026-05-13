# BCP Scraper & Meta Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automated weekly pipeline that discovers new 40K GT events on BCP, scrapes pairings/lists/scores via BCP's REST API, imports to 3NF, and rebuilds the analytics cube — all on Cloudflare Workers with no human intervention.

**Architecture:** Two Workers chained together. The BCP Scraper Worker runs Monday 4am UTC via cron trigger, authenticates against BCP's Cognito auth, discovers new GT events (20+ players, 5+ rounds), fetches event details + pairings + list text via `newprod-api.bestcoastpairings.com`, and writes raw data to Turso. When done it triggers the Meta Pipeline Worker (Monday 5am fallback cron), which runs 3NF import, detachment extraction, and cube rebuild — porting existing CLI logic from `apps/content-ingestor/src/meta/`. Admin dashboard gets a new page with status, history, and "Run Now" buttons for both.

**Tech Stack:** Cloudflare Workers (cron triggers, service bindings), Hono, Turso/libSQL, AWS Cognito `InitiateAuth` (USER_PASSWORD_AUTH flow), Drizzle ORM, tRPC (admin endpoints).

**Specs:** `docs/superpowers/specs/2026-05-11-bcp-scraper-and-meta-pipeline-design.md`

---

## File Structure

### New: `apps/bcp-scraper/server/`

```
apps/bcp-scraper/
  server/
    src/
      worker.ts              — Cloudflare Worker: cron handler + HTTP trigger endpoint
      lib/
        cognito.ts           — AWS Cognito USER_PASSWORD_AUTH login → Bearer token
        bcp-api.ts           — BCP REST API client (event search, event details, pairings, lists)
        scrape.ts            — Orchestrator: discover new events, fetch all data, write to Turso
        pipeline.ts          — Meta pipeline: 3NF import, detachment extraction, cube build
        faction-map.ts       — BCP_FACTION_TO_SLUG + SUBFACTION_PARENT (ported from seed-dimensions.ts)
        detachment-map.ts    — Detachment extraction from list text (ported from extract-detachments.ts)
      lib/
        cognito.test.ts
        bcp-api.test.ts
        scrape.test.ts
        pipeline.test.ts
        faction-map.test.ts
        detachment-map.test.ts
    wrangler.toml
    package.json
    tsconfig.json
```

### Modified: `apps/admin/`

```
apps/admin/
  server/src/routers/
    stats.ts                 — Add: bcpScraperStatus, bcpScraperHistory, triggerBcpScrape, triggerMetaPipeline
    stats.test.ts            — Add: tests for new endpoints
  client/src/
    App.tsx                  — Add: ScraperPage to nav
    pages/
      ScraperPage.tsx        — New: scraper status, history table, "Run Now" buttons
      ScraperPage.test.tsx
```

### Modified: `packages/db/`

```
packages/db/src/
  schema.ts                  — Add: bcpScrapeJobs table, list_ttt column on metaEventPlayers
```

---

## Task 1: Cognito Authentication Module

**Files:**
- Create: `apps/bcp-scraper/server/src/lib/cognito.ts`
- Create: `apps/bcp-scraper/server/src/lib/cognito.test.ts`

This module calls AWS Cognito's public `InitiateAuth` API to get a Bearer token using BCP email/password. No AWS SDK needed — it's a single HTTPS POST.

- [ ] **Step 1: Write the failing test**

```typescript
// cognito.test.ts
import { describe, it, expect, vi } from 'vitest'
import { authenticateBcp } from './cognito'

describe('authenticateBcp', () => {
  it('calls Cognito InitiateAuth and returns access token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        AuthenticationResult: {
          AccessToken: 'test-token-123',
          ExpiresIn: 3600,
        },
      }),
    })

    const token = await authenticateBcp({
      email: 'test@example.com',
      password: 'testpass',
      fetch: mockFetch,
    })

    expect(token).toBe('test-token-123')
    expect(mockFetch).toHaveBeenCalledOnce()

    const [url, opts] = mockFetch.mock.calls[0]!
    expect(url).toContain('cognito-idp.us-east-1.amazonaws.com')
    expect(opts.method).toBe('POST')

    const body = JSON.parse(opts.body)
    expect(body.AuthFlow).toBe('USER_PASSWORD_AUTH')
    expect(body.AuthParameters.USERNAME).toBe('test@example.com')
    expect(body.AuthParameters.PASSWORD).toBe('testpass')
    expect(body.ClientId).toBe('5083iih0nitpn5enl02fkpr9bc')
  })

  it('throws on auth failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ __type: 'NotAuthorizedException', message: 'Bad creds' }),
    })

    await expect(authenticateBcp({
      email: 'bad@example.com',
      password: 'wrong',
      fetch: mockFetch,
    })).rejects.toThrow('BCP auth failed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/bcp-scraper/server && pnpm vitest run src/lib/cognito.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// cognito.ts
const COGNITO_URL = 'https://cognito-idp.us-east-1.amazonaws.com/'
const CLIENT_ID = '5083iih0nitpn5enl02fkpr9bc'

interface AuthOptions {
  email: string
  password: string
  fetch?: typeof globalThis.fetch
}

export async function authenticateBcp(opts: AuthOptions): Promise<string> {
  const f = opts.fetch ?? globalThis.fetch

  const resp = await f(COGNITO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: opts.email,
        PASSWORD: opts.password,
      },
    }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(`BCP auth failed: ${(err as any).message || resp.status}`)
  }

  const data = await resp.json() as { AuthenticationResult: { AccessToken: string } }
  return data.AuthenticationResult.AccessToken
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/bcp-scraper/server && pnpm vitest run src/lib/cognito.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/bcp-scraper/
git commit -m "feat(bcp-scraper): Cognito auth module for BCP API"
```

---

## Task 2: BCP API Client

**Files:**
- Create: `apps/bcp-scraper/server/src/lib/bcp-api.ts`
- Create: `apps/bcp-scraper/server/src/lib/bcp-api.test.ts`

Wraps the three BCP REST API endpoints: event search, event details, and pairings. All use `fetch()` with Bearer token.

- [ ] **Step 1: Write the failing tests**

```typescript
// bcp-api.test.ts
import { describe, it, expect, vi } from 'vitest'
import { BcpApiClient } from './bcp-api'

function mockFetch(response: object) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  })
}

describe('BcpApiClient', () => {
  describe('searchEvents', () => {
    it('calls event search API with date range and filters', async () => {
      const f = mockFetch({ data: [{ id: 'ABC123', name: 'Test GT' }] })
      const client = new BcpApiClient('test-token', f)

      const events = await client.searchEvents({
        startDate: '2026-05-01',
        endDate: '2026-05-08',
        minPlayers: 20,
        minRounds: 5,
      })

      expect(f).toHaveBeenCalledOnce()
      const url = f.mock.calls[0]![0] as string
      expect(url).toContain('newprod-api.bestcoastpairings.com')
      expect(url).toContain('startDate=2026-05-01')
      expect(url).toContain('numberOfPlayers=20')
      expect(url).toContain('numberOfRounds=5')

      const headers = f.mock.calls[0]![1].headers
      expect(headers['authorization']).toBe('Bearer test-token')
      expect(headers['client-id']).toBe('web-app')
      expect(headers['env']).toBe('bcp')
    })
  })

  describe('getEvent', () => {
    it('fetches event details without auth', async () => {
      const f = mockFetch({
        id: 'ABC123',
        name: 'Test GT',
        dates: { start: '2026-05-03T14:00:00Z', end: '2026-05-04T23:00:00Z' },
        location: { city: 'Austin', state: 'TX', country: 'US', point: { latitude: 30.3, longitude: -97.7 } },
        status: { numberOfRounds: 6 },
        playerCounts: { total: 120 },
      })
      const client = new BcpApiClient('test-token', f)

      const event = await client.getEvent('ABC123')

      expect(event.id).toBe('ABC123')
      const headers = f.mock.calls[0]![1].headers
      // Event details endpoint doesn't require auth but we send it anyway
      expect(headers['client-id']).toBe('web-app')
    })
  })

  describe('getPairings', () => {
    it('fetches pairings for a round', async () => {
      const f = mockFetch({
        active: [{
          round: 1,
          table: 1,
          player1: { user: { firstName: 'Bob', lastName: 'Smith' }, faction: 'Orks', listId: 'L1' },
          player2: { user: { firstName: 'Jane', lastName: 'Doe' }, faction: 'Aeldari', listId: 'L2' },
          player1Game: { result: 2, points: 85 },
          player2Game: { result: 0, points: 60 },
        }],
      })
      const client = new BcpApiClient('test-token', f)

      const pairings = await client.getPairings('ABC123', 1)

      expect(pairings).toHaveLength(1)
      expect(pairings[0].player1.name).toBe('Bob Smith')
      expect(pairings[0].player1.faction).toBe('Orks')
      expect(pairings[0].player1Game.result).toBe(2)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/bcp-scraper/server && pnpm vitest run src/lib/bcp-api.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// bcp-api.ts
const API_BASE = 'https://newprod-api.bestcoastpairings.com'
const GAME_SYSTEM_40K = 'WGMSzfKFYA'

interface SearchParams {
  startDate: string
  endDate: string
  minPlayers: number
  minRounds: number
}

interface BcpEventRaw {
  id: string
  name: string
  dates: { start: string; end: string }
  location?: {
    city?: string; state?: string; country?: string
    point?: { latitude: number; longitude: number }
  }
  status: { numberOfRounds: number; started: boolean; ended: boolean }
  playerCounts: { total: number }
  format?: { teamEvent?: boolean }
}

interface BcpPairingRaw {
  round: number
  table: number
  player1: { user: { firstName: string; lastName: string }; faction: string; listId?: string }
  player2: { user: { firstName: string; lastName: string }; faction: string; listId?: string }
  player1Game: { result: number; points: number }
  player2Game: { result: number; points: number }
}

export interface BcpEvent {
  id: string
  name: string
  startDate: string
  endDate: string
  city?: string
  state?: string
  country?: string
  latitude?: number
  longitude?: number
  rounds: number
  playerCount: number
  isTeamEvent: boolean
}

export interface BcpPairing {
  round: number
  table: number
  player1: { name: string; faction: string; listId?: string }
  player2: { name: string; faction: string; listId?: string }
  player1Game: { result: number; points: number }
  player2Game: { result: number; points: number }
}

export class BcpApiClient {
  constructor(
    private token: string,
    private fetch: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  private headers(auth = true): Record<string, string> {
    const h: Record<string, string> = {
      'client-id': 'web-app',
      'env': 'bcp',
      'content-type': 'application/json',
    }
    if (auth) h['authorization'] = `Bearer ${this.token}`
    return h
  }

  async searchEvents(params: SearchParams): Promise<BcpEvent[]> {
    const qs = new URLSearchParams({
      gameSystemId: GAME_SYSTEM_40K,
      startDate: params.startDate,
      endDate: params.endDate,
      numberOfPlayers: String(params.minPlayers),
      numberOfRounds: String(params.minRounds),
      sortAsc: 'false',
      eventStatus: 'ended',
      sortKey: 'eventDate',
    })

    const resp = await this.fetch(`${API_BASE}/v1/events?${qs}`, {
      headers: this.headers(),
    })

    if (!resp.ok) throw new Error(`BCP event search failed: ${resp.status}`)

    const data = await resp.json() as { data: BcpEventRaw[] }
    return (data.data || []).map(mapEvent)
  }

  async getEvent(eventId: string): Promise<BcpEvent> {
    const resp = await this.fetch(`${API_BASE}/v2/events/${eventId}`, {
      headers: this.headers(),
    })

    if (!resp.ok) throw new Error(`BCP event fetch failed: ${resp.status}`)

    const raw = await resp.json() as BcpEventRaw
    return mapEvent(raw)
  }

  async getPairings(eventId: string, round: number): Promise<BcpPairing[]> {
    const resp = await this.fetch(
      `${API_BASE}/v1/events/${eventId}/pairings?eventId=${eventId}&round=${round}&pairingType=Pairing`,
      { headers: this.headers() },
    )

    if (!resp.ok) throw new Error(`BCP pairings fetch failed: ${resp.status}`)

    const data = await resp.json() as { active: BcpPairingRaw[] }
    return (data.active || []).map(mapPairing)
  }
}

function mapEvent(raw: BcpEventRaw): BcpEvent {
  return {
    id: raw.id,
    name: raw.name,
    startDate: raw.dates?.start || '',
    endDate: raw.dates?.end || '',
    city: raw.location?.city,
    state: raw.location?.state,
    country: raw.location?.country,
    latitude: raw.location?.point?.latitude,
    longitude: raw.location?.point?.longitude,
    rounds: raw.status?.numberOfRounds || 0,
    playerCount: raw.playerCounts?.total || 0,
    isTeamEvent: raw.format?.teamEvent || false,
  }
}

function mapPairing(raw: BcpPairingRaw): BcpPairing {
  return {
    round: raw.round,
    table: raw.table,
    player1: {
      name: `${raw.player1?.user?.firstName || ''} ${raw.player1?.user?.lastName || ''}`.trim(),
      faction: raw.player1?.faction || '',
      listId: raw.player1?.listId,
    },
    player2: {
      name: `${raw.player2?.user?.firstName || ''} ${raw.player2?.user?.lastName || ''}`.trim(),
      faction: raw.player2?.faction || '',
      listId: raw.player2?.listId,
    },
    player1Game: raw.player1Game || { result: 0, points: 0 },
    player2Game: raw.player2Game || { result: 0, points: 0 },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/bcp-scraper/server && pnpm vitest run src/lib/bcp-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/bcp-scraper/server/src/lib/bcp-api.*
git commit -m "feat(bcp-scraper): BCP REST API client"
```

---

## Task 3: Faction & Detachment Mapping

**Files:**
- Create: `apps/bcp-scraper/server/src/lib/faction-map.ts`
- Create: `apps/bcp-scraper/server/src/lib/faction-map.test.ts`
- Create: `apps/bcp-scraper/server/src/lib/detachment-map.ts`
- Create: `apps/bcp-scraper/server/src/lib/detachment-map.test.ts`

Port `BCP_FACTION_TO_SLUG`, `SUBFACTION_PARENT` from `apps/content-ingestor/src/meta/seed-dimensions.ts`, and detachment extraction from `apps/content-ingestor/src/meta/extract-detachments.ts`.

- [ ] **Step 1: Write failing tests for faction mapping**

```typescript
// faction-map.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeFaction, getSubfactionParent } from './faction-map'

describe('normalizeFaction', () => {
  it('maps standard faction names to slugs', () => {
    expect(normalizeFaction('Orks')).toBe('orks')
    expect(normalizeFaction('Space Marines (Astartes)')).toBe('space-marines')
    expect(normalizeFaction('T\'au Empire')).toBe('tau-empire')
  })

  it('maps chapter names to parent faction', () => {
    expect(normalizeFaction('Ultramarines')).toBe('space-marines')
    expect(normalizeFaction('Black Legion')).toBe('chaos-space-marines')
  })

  it('returns empty string for unknown factions', () => {
    expect(normalizeFaction('Unknown Army')).toBe('')
  })
})

describe('getSubfactionParent', () => {
  it('maps SM chapters to space-marines', () => {
    expect(getSubfactionParent('blood-angels')).toBe('space-marines')
    expect(getSubfactionParent('dark-angels')).toBe('space-marines')
  })

  it('returns undefined for non-subfactions', () => {
    expect(getSubfactionParent('orks')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Port BCP_FACTION_TO_SLUG and SUBFACTION_PARENT from seed-dimensions.ts**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Write failing tests for detachment extraction**

```typescript
// detachment-map.test.ts
import { describe, it, expect } from 'vitest'
import { extractDetachment } from './detachment-map'

describe('extractDetachment', () => {
  it('extracts from GW App format', () => {
    const text = 'My List (2000 Points)\nOrksBig Mek Stompa Mob\nStrike Force'
    expect(extractDetachment(text, 'orks')).toBe('big-mek-stompa-mob')
  })

  it('extracts from BattleScribe format', () => {
    const text = '+ DETACHMENT: Pactbound Zealots (Marks of Chaos)\n'
    expect(extractDetachment(text, 'chaos-space-marines')).toBe('pactbound-zealots')
  })

  it('returns null for unrecognizable text', () => {
    expect(extractDetachment('random text', 'orks')).toBeNull()
  })
})
```

- [ ] **Step 6: Port detachment extraction logic from extract-detachments.ts**
- [ ] **Step 7: Run tests to verify they pass**
- [ ] **Step 8: Commit**

```bash
git add apps/bcp-scraper/server/src/lib/faction-map.* apps/bcp-scraper/server/src/lib/detachment-map.*
git commit -m "feat(bcp-scraper): faction and detachment normalization"
```

---

## Task 4: Database — Scrape Job Tracking Table

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: All test files with CREATE TABLE SQL (8 places — see memory note)

- [ ] **Step 1: Add bcpScrapeJobs table to schema.ts**

Add after `metaCubeStatus`:

```typescript
export const bcpScrapeJobs = sqliteTable('bcp_scrape_jobs', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('running'), // running | completed | failed
  eventsFound: integer('events_found').default(0),
  eventsScraped: integer('events_scraped').default(0),
  pairingsScraped: integer('pairings_scraped').default(0),
  listsScraped: integer('lists_scraped').default(0),
  errors: text('errors'), // JSON array of error strings
  triggeredBy: text('triggered_by').notNull().default('cron'), // cron | manual
})
```

- [ ] **Step 2: Generate migration**

Run: `cd packages/db && pnpm drizzle-kit generate`

- [ ] **Step 3: Update CREATE TABLE SQL in test files** (8 places per memory note)
- [ ] **Step 4: Run all DB tests**

Run: `cd packages/db && pnpm vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add bcp_scrape_jobs table"
```

---

## Task 5: Scrape Orchestrator

**Files:**
- Create: `apps/bcp-scraper/server/src/lib/scrape.ts`
- Create: `apps/bcp-scraper/server/src/lib/scrape.test.ts`

The main orchestrator: authenticate → discover events → check for duplicates → fetch pairings → write to Turso → log job.

- [ ] **Step 1: Write failing test for the orchestrator**

Test that it: authenticates, searches for events in the last 7 days, skips already-scraped events, fetches pairings for new events, writes to DB, creates a job record.

- [ ] **Step 2: Implement scrape orchestrator**

```typescript
// scrape.ts
import { authenticateBcp } from './cognito'
import { BcpApiClient } from './bcp-api'
import { normalizeFaction } from './faction-map'
import { extractDetachment } from './detachment-map'
import type { Db } from '@tabletop-tools/db'
import { metaEvents, metaEventPlayers, metaPairings, bcpScrapeJobs } from '@tabletop-tools/db'
import { generateId } from '@tabletop-tools/server-core'

interface ScrapeEnv {
  bcpEmail: string
  bcpPassword: string
  db: Db
}

export async function runScrape(env: ScrapeEnv): Promise<{ jobId: string }> {
  const jobId = generateId()
  const startedAt = new Date()

  // Create job record
  await env.db.insert(bcpScrapeJobs).values({
    id: jobId,
    startedAt,
    status: 'running',
    triggeredBy: 'cron',
  })

  try {
    // 1. Authenticate
    const token = await authenticateBcp({ email: env.bcpEmail, password: env.bcpPassword })
    const api = new BcpApiClient(token)

    // 2. Discover events from last 7 days
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000)
    const events = await api.searchEvents({
      startDate: startDate.toISOString().split('T')[0]!,
      endDate: endDate.toISOString().split('T')[0]!,
      minPlayers: 20,
      minRounds: 5,
    })

    // 3. Filter out already-scraped events
    const existing = await env.db.select({ sourceId: metaEvents.sourceId })
      .from(metaEvents)
      .where(sql`source_id IN (${events.map(e => e.id).join(',')})`)
    const existingIds = new Set(existing.map(e => e.sourceId))
    const newEvents = events.filter(e => !existingIds.has(e.id) && !e.isTeamEvent)

    let eventsScraped = 0
    let pairingsScraped = 0
    let listsScraped = 0
    const errors: string[] = []

    // 4. Scrape each new event
    for (const event of newEvents) {
      try {
        const details = await api.getEvent(event.id)
        // ... insert event, fetch pairings for each round, insert players + pairings
        eventsScraped++
      } catch (err) {
        errors.push(`${event.id}: ${(err as Error).message}`)
      }
    }

    // 5. Update job record
    await env.db.update(bcpScrapeJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        eventsFound: events.length,
        eventsScraped,
        pairingsScraped,
        listsScraped,
        errors: errors.length ? JSON.stringify(errors) : null,
      })
      .where(eq(bcpScrapeJobs.id, jobId))

    return { jobId }
  } catch (err) {
    await env.db.update(bcpScrapeJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errors: JSON.stringify([(err as Error).message]),
      })
      .where(eq(bcpScrapeJobs.id, jobId))
    throw err
  }
}
```

Note: The full implementation will include the per-event loop that inserts into `metaEvents`, `metaEventPlayers`, and `metaPairings`. Use `generateId()` for all primary keys. Use `normalizeFaction()` and `extractDetachment()` for faction/detachment mapping.

- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

```bash
git add apps/bcp-scraper/server/src/lib/scrape.*
git commit -m "feat(bcp-scraper): scrape orchestrator"
```

---

## Task 6: Meta Pipeline (3NF Import + Cube Build)

**Files:**
- Create: `apps/bcp-scraper/server/src/lib/pipeline.ts`
- Create: `apps/bcp-scraper/server/src/lib/pipeline.test.ts`

Port the logic from `apps/content-ingestor/src/meta/import-3nf.ts` and `apps/content-ingestor/src/meta/build-cube.ts`. These already work against Turso — the port is adapting them from standalone CLI scripts to Worker-callable functions that accept a `Db` instance.

- [ ] **Step 1: Write failing test**

Test that `runPipeline(db)` reads from `metaEvents`/`metaEventPlayers`/`metaPairings`, populates `factGameResults` and `metaTop`, and updates `metaCubeStatus`.

- [ ] **Step 2: Port import-3nf.ts logic**

Key change: The CLI script reads from local JSON files. The Worker version reads from Turso tables (data already inserted by the scraper in Task 5). The cube-building logic (frame generation, fact table population, meta_top aggregation) stays the same.

- [ ] **Step 3: Port build-cube.ts logic**
- [ ] **Step 4: Run tests**
- [ ] **Step 5: Commit**

```bash
git add apps/bcp-scraper/server/src/lib/pipeline.*
git commit -m "feat(bcp-scraper): meta pipeline — 3NF import + cube build"
```

---

## Task 7: Cloudflare Worker Entry Point

**Files:**
- Create: `apps/bcp-scraper/server/src/worker.ts`
- Create: `apps/bcp-scraper/server/wrangler.toml`
- Create: `apps/bcp-scraper/server/package.json`
- Create: `apps/bcp-scraper/server/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@tabletop-tools/bcp-scraper-server",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "dependencies": {
    "@libsql/client": "^0.14.0",
    "@tabletop-tools/db": "workspace:*",
    "@tabletop-tools/server-core": "workspace:*",
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "wrangler": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create wrangler.toml**

```toml
name = "tabletop-tools-bcp-scraper"
main = "src/worker.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["0 4 * * 1"]  # Monday 4am UTC

[vars]
ENVIRONMENT = "production"
```

- [ ] **Step 3: Create worker.ts**

```typescript
// worker.ts
import { Hono } from 'hono'
import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { runScrape } from './lib/scrape'
import { runPipeline } from './lib/pipeline'

interface Env {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
  BCP_EMAIL: string
  BCP_PASSWORD: string
  SYNC_SECRET?: string
}

let cachedApp: Hono<{ Bindings: Env }> | null = null

function getApp() {
  if (cachedApp) return cachedApp

  const app = new Hono<{ Bindings: Env }>()

  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.post('/scrape', async (c) => {
    // Verify bearer token
    if (c.env.SYNC_SECRET) {
      const auth = c.req.header('Authorization')
      if (auth !== `Bearer ${c.env.SYNC_SECRET}`) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
    }

    const db = createDbFromClient(createClient({
      url: c.env.TURSO_DB_URL,
      authToken: c.env.TURSO_AUTH_TOKEN,
    }))

    const result = await runScrape({
      bcpEmail: c.env.BCP_EMAIL,
      bcpPassword: c.env.BCP_PASSWORD,
      db,
    })

    // Run meta pipeline after scrape
    await runPipeline(db)

    return c.json(result)
  })

  cachedApp = app
  return app
}

export default {
  fetch: (req: Request, env: Env) => getApp().fetch(req, env),

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const db = createDbFromClient(createClient({
      url: env.TURSO_DB_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    }))

    ctx.waitUntil(
      runScrape({
        bcpEmail: env.BCP_EMAIL,
        bcpPassword: env.BCP_PASSWORD,
        db,
      }).then(() => runPipeline(db))
    )
  },
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/bcp-scraper/
git commit -m "feat(bcp-scraper): Cloudflare Worker with cron trigger"
```

---

## Task 8: Admin Dashboard — Scraper Page

**Files:**
- Modify: `apps/admin/server/src/routers/stats.ts`
- Modify: `apps/admin/server/src/routers/stats.test.ts`
- Create: `apps/admin/client/src/pages/ScraperPage.tsx`
- Create: `apps/admin/client/src/pages/ScraperPage.test.tsx`
- Modify: `apps/admin/client/src/App.tsx`

- [ ] **Step 1: Add server endpoints**

Add to `stats.ts`:

```typescript
bcpScraperStatus: adminProcedure.query(async ({ ctx }) => {
  const [latest] = await ctx.db.select().from(bcpScrapeJobs)
    .orderBy(desc(bcpScrapeJobs.startedAt))
    .limit(1)
  const totalEvents = await ctx.db.select({ count: sql<number>`count(*)` }).from(metaEvents)
  return { latestJob: latest || null, totalEvents: totalEvents[0]?.count || 0 }
}),

bcpScraperHistory: adminProcedure
  .input(z.object({ limit: z.number().optional().default(20) }))
  .query(async ({ ctx, input }) => {
    return ctx.db.select().from(bcpScrapeJobs)
      .orderBy(desc(bcpScrapeJobs.startedAt))
      .limit(input.limit)
  }),

triggerBcpScrape: adminProcedure.mutation(async ({ ctx }) => {
  // Call bcp-scraper Worker via service binding or HTTP
  // For now, return a placeholder
  return { status: 'triggered' }
}),

triggerMetaPipeline: adminProcedure.mutation(async ({ ctx }) => {
  // Call pipeline endpoint
  return { status: 'triggered' }
}),
```

- [ ] **Step 2: Write tests for new endpoints**
- [ ] **Step 3: Create ScraperPage.tsx**

Shows:
- Latest job status card (timestamp, events found/scraped, status indicator)
- "Run Scraper Now" and "Rebuild Cube" buttons
- History table (past 20 jobs)
- Error display for failed jobs

- [ ] **Step 4: Write ScraperPage tests**
- [ ] **Step 5: Add ScraperPage to App.tsx nav**
- [ ] **Step 6: Run all admin tests**

Run: `cd apps/admin/server && pnpm vitest run && cd ../client && pnpm vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/admin/
git commit -m "feat(admin): BCP scraper status page with Run Now buttons"
```

---

## Task 9: Deploy & Verify

**Files:**
- Modify: `scripts/deploy-workers.sh` — add bcp-scraper Worker

- [ ] **Step 1: Set Worker secrets**

```bash
cd apps/bcp-scraper/server
wrangler secret put BCP_EMAIL
wrangler secret put BCP_PASSWORD
wrangler secret put TURSO_DB_URL
wrangler secret put TURSO_AUTH_TOKEN
wrangler secret put SYNC_SECRET
```

- [ ] **Step 2: Deploy bcp-scraper Worker**

```bash
cd apps/bcp-scraper/server && wrangler deploy
```

- [ ] **Step 3: Verify health endpoint**

```bash
curl https://tabletop-tools-bcp-scraper.<account>.workers.dev/health
# Expected: {"status":"ok"}
```

- [ ] **Step 4: Trigger manual scrape to test**

```bash
curl -X POST https://tabletop-tools-bcp-scraper.<account>.workers.dev/scrape \
  -H "Authorization: Bearer <SYNC_SECRET>"
```

- [ ] **Step 5: Verify data in Turso**

Check that new events appeared in `meta_events` and `bcp_scrape_jobs` has a completed job.

- [ ] **Step 6: Deploy admin with new ScraperPage**

```bash
cd apps/admin/server && wrangler deploy
# Gateway redeploy for client
```

- [ ] **Step 7: Verify admin ScraperPage shows job history**

- [ ] **Step 8: Commit deploy script update**

```bash
git add scripts/
git commit -m "chore: add bcp-scraper to deploy-workers.sh"
```

---

## Task 10: Gateway Integration (Admin triggers Worker)

**Files:**
- Modify: `apps/admin/server/wrangler.toml` — add service binding to bcp-scraper
- Modify: `apps/admin/server/src/routers/stats.ts` — wire up triggerBcpScrape to call Worker

- [ ] **Step 1: Add service binding in admin wrangler.toml**

```toml
[[services]]
binding = "BCP_SCRAPER"
service = "tabletop-tools-bcp-scraper"
```

- [ ] **Step 2: Update triggerBcpScrape to call the service binding**

```typescript
triggerBcpScrape: adminProcedure.mutation(async ({ ctx }) => {
  const resp = await ctx.bcpScraper.fetch(new Request('https://fake/scrape', { method: 'POST' }))
  const result = await resp.json()
  return result
}),
```

- [ ] **Step 3: Test the full flow from admin UI → scraper Worker → Turso → admin status**
- [ ] **Step 4: Commit**

```bash
git add apps/admin/
git commit -m "feat(admin): wire Run Now button to bcp-scraper via service binding"
```
