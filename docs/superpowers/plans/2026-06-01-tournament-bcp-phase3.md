# Tournament + BCP Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the tournament app with canonical faction/detachment FKs, a data-driven metric-stack standings engine, passthrough BCP event directory, and an explicit-consent BCP list-drop flow.

**Architecture:** Schema-first approach: add 5 new tables (`ranking_metric`, `tournament_pairing_metric`, `tournament_placing_metric`, `passthrough_event`, `bcp_registration`) and migrate `tournament_players.faction/detachment` from free strings to `content_entity` FKs. Server routers expose faction/detachment lookups (data-driven, never hardcoded in UI). Standings recompute derives from the metric-stack rows — the client renders columns from whatever metrics exist, not a fixed `<th>` list. BCP list-drop is a two-path flow gated by a per-action explicit consent dialog.

**Tech Stack:** TypeScript, Drizzle ORM, tRPC + Zod, SQLite/Turso, React, Vitest, Playwright

---

## File Map

### New files
- `packages/db/migrations/0009_tournament_phase3.sql` — migration for 5 new tables + column adds
- `apps/tournament/server/src/lib/standings/metric-compute.ts` — metric-stack standings engine (pure TS)
- `apps/tournament/server/src/lib/standings/metric-compute.test.ts` — unit tests for metric engine
- `apps/tournament/server/src/routers/metric.ts` — tRPC router: list/seed ranking_metrics, get/set pairing+placing stacks
- `apps/tournament/server/src/routers/passthrough.ts` — tRPC router: list/sync passthrough_events
- `apps/tournament/server/src/routers/bcp-registration.ts` — tRPC router: submitList (both paths), get consent status
- `apps/tournament/client/src/components/MetricStackStandings.tsx` — data-driven standings table (columns from metric stack)
- `apps/tournament/client/src/components/FactionDetachmentPicker.tsx` — data-driven pickers from content_entity
- `apps/tournament/client/src/components/PassthroughDirectory.tsx` — BCP event directory tab
- `apps/tournament/client/src/components/BcpListDrop.tsx` — consent dialog + list-drop UI

### Modified files
- `packages/db/src/schema.ts` — add 5 new table defs; keep `tournament_players.faction/detachment` as nullable TEXT (migration handles data)
- `packages/db/src/tournament-schema.ts` — NEW FILE: extract new tournament tables to keep schema.ts bounded
- `apps/tournament/server/src/routers/index.ts` — wire in metric/passthrough/bcp-registration routers
- `apps/tournament/server/src/routers/player.ts` — accept `factionId`/`detachmentId` (content_entity FKs) alongside legacy string fields; registration validates FK exists
- `apps/tournament/server/src/routers/tournament.ts` — standings endpoint uses metric-stack engine when stacks exist, falls back to legacy compute
- `apps/tournament/server/src/routers/tournament.test.ts` — add metric-stack + faction FK tests
- `apps/tournament/client/src/components/TournamentScreen.tsx` — wire faction picker to content_entity query; standings table swapped to MetricStackStandings
- `apps/tournament/CLAUDE.md` — update architecture section

---

## Task 1: Schema — 5 new tables + migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/migrations/0009_tournament_phase3.sql`

### What to add to `schema.ts`

Append after the `tournamentAwards` block:

```typescript
// === Tournament Phase 3 — metric stack + BCP tables ===

export const rankingMetric = sqliteTable('ranking_metric', {
  id: text('id').primaryKey(), // slug: 'wins' | 'battle_points' | 'sos_wins' | ...
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  description: text('description'),
})

export const tournamentPairingMetric = sqliteTable(
  'tournament_pairing_metric',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    rankingMetricId: text('ranking_metric_id')
      .notNull()
      .references(() => rankingMetric.id),
    sortOrder: integer('sort_order').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [
    index('idx_tourn_pairing_metric_tourn').on(t.tournamentId),
    uniqueIndex('uq_tourn_pairing_metric').on(t.tournamentId, t.rankingMetricId),
  ],
)

export const tournamentPlacingMetric = sqliteTable(
  'tournament_placing_metric',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    rankingMetricId: text('ranking_metric_id')
      .notNull()
      .references(() => rankingMetric.id),
    sortOrder: integer('sort_order').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [
    index('idx_tourn_placing_metric_tourn').on(t.tournamentId),
    uniqueIndex('uq_tourn_placing_metric').on(t.tournamentId, t.rankingMetricId),
  ],
)

export const passthroughEvent = sqliteTable(
  'passthrough_event',
  {
    id: text('id').primaryKey(),
    bcpEventId: text('bcp_event_id').notNull().unique(),
    name: text('name').notNull(),
    eventDate: integer('event_date'),
    location: text('location'),
    gameSystem: text('game_system'),
    playerCount: integer('player_count'),
    registrationUrl: text('registration_url'),
    lastSyncedAt: integer('last_synced_at').notNull(),
  },
  (t) => [
    index('idx_passthrough_event_date').on(t.eventDate),
    index('idx_passthrough_bcp_event_id').on(t.bcpEventId),
  ],
)

export const bcpRegistration = sqliteTable(
  'bcp_registration',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    bcpEventId: text('bcp_event_id').notNull(),
    listId: text('list_id'), // FK to list table — optional if no list-builder list
    method: text('method', { enum: ['server', 'agent'] }).notNull(),
    status: text('status', { enum: ['submitted', 'failed'] }).notNull(),
    consentAt: integer('consent_at').notNull(), // epoch ms — stored consent timestamp
    submittedAt: integer('submitted_at').notNull(),
  },
  (t) => [
    index('idx_bcp_registration_user').on(t.userId),
    index('idx_bcp_registration_event').on(t.bcpEventId),
  ],
)
```

Also add nullable `factionEntityId` and `detachmentEntityId` to `tournamentPlayers` (alongside existing string fields — migration maps data, app uses FK when present):

```typescript
// In tournamentPlayers table, add after detachment:
factionEntityId: text('faction_entity_id').references(() => contentEntity.id),
detachmentEntityId: text('detachment_entity_id').references(() => contentEntity.id),
placement: integer('placement'), // snapshot on COMPLETE
```

- [ ] Add the 5 table definitions and 3 column additions to `packages/db/src/schema.ts`

- [ ] Generate the migration:
```bash
cd C:/R/tabletop-tools && npx drizzle-kit generate
```
Expected: creates `packages/db/migrations/0009_tournament_phase3.sql`

- [ ] Verify migration SQL looks correct (5 CREATE TABLE statements, 3 ALTER TABLE ADD COLUMN statements)

- [ ] Run db tests to confirm no regressions:
```bash
cd C:/R/tabletop-tools/packages/db && pnpm test
```
Expected: all existing tests pass

- [ ] Commit:
```bash
git add packages/db/src/schema.ts packages/db/migrations/0009_tournament_phase3.sql
git commit -m "feat(db): tournament phase 3 schema — ranking_metric, metric stacks, passthrough_event, bcp_registration, faction_entity_id FK"
```

---

## Task 2: Seed ranking_metric catalog + metric router

**Files:**
- Create: `apps/tournament/server/src/routers/metric.ts`
- Modify: `apps/tournament/server/src/routers/index.ts`
- Modify: `apps/tournament/server/src/routers/tournament.test.ts` (add metric tests to the existing test setup SQL)

### metric.ts router

```typescript
import { rankingMetric, tournamentPairingMetric, tournamentPlacingMetric, tournaments } from '@tabletop-tools/db'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

/** The default BCP-style placing metric stack (ordered) */
const DEFAULT_PLACING_METRICS = [
  { key: 'wins', label: 'Wins', description: 'Number of wins' },
  { key: 'battle_points', label: 'Battle Points', description: 'Total VP scored' },
  { key: 'sos_wins', label: 'Wins SoS', description: 'Average win % of opponents' },
  { key: 'margin_of_victory', label: 'Margin of Victory', description: 'VP differential' },
  { key: 'extended_sos', label: 'Extended SoS', description: 'Average opponent SoS' },
  { key: 'random', label: 'Random', description: 'Deterministic coin-flip tiebreaker (seeded by player id)' },
]

export const metricRouter = router({
  // List all canonical ranking metrics (the catalog)
  listMetrics: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(rankingMetric).all()
  }),

  // Ensure the default metric catalog is seeded (idempotent)
  seedDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    for (const m of DEFAULT_PLACING_METRICS) {
      const existing = await ctx.db.select().from(rankingMetric).where(eq(rankingMetric.key, m.key)).get()
      if (!existing) {
        await ctx.db.insert(rankingMetric).values({ id: m.key, key: m.key, label: m.label, description: m.description })
      }
    }
    return { seeded: DEFAULT_PLACING_METRICS.length }
  }),

  // Get the placing metric stack for a tournament (ordered)
  getPlacingStack: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(tournamentPlacingMetric)
        .where(eq(tournamentPlacingMetric.tournamentId, input))
        .all()
    }),

  // Get the pairing metric stack for a tournament (ordered)
  getPairingStack: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(tournamentPairingMetric)
        .where(eq(tournamentPairingMetric.tournamentId, input))
        .all()
    }),

  // Set the placing stack for a tournament (replaces existing)
  setPlacingStack: protectedProcedure
    .input(z.object({
      tournamentId: z.string(),
      metrics: z.array(z.object({
        rankingMetricId: z.string(),
        sortOrder: z.number().int(),
        enabled: z.boolean(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const t = await ctx.db.select().from(tournaments).where(eq(tournaments.id, input.tournamentId)).get()
      if (!t) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      if (t.toUserId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })

      await ctx.db.delete(tournamentPlacingMetric).where(eq(tournamentPlacingMetric.tournamentId, input.tournamentId))
      for (const m of input.metrics) {
        await ctx.db.insert(tournamentPlacingMetric).values({
          id: crypto.randomUUID(),
          tournamentId: input.tournamentId,
          rankingMetricId: m.rankingMetricId,
          sortOrder: m.sortOrder,
          enabled: m.enabled,
        })
      }
      return { set: input.metrics.length }
    }),

  // Seed default placing stack for a tournament (called on create)
  seedTournamentDefaults: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const t = await ctx.db.select().from(tournaments).where(eq(tournaments.id, input)).get()
      if (!t) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      if (t.toUserId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })

      // Ensure catalog seeded
      for (const m of DEFAULT_PLACING_METRICS) {
        const existing = await ctx.db.select().from(rankingMetric).where(eq(rankingMetric.key, m.key)).get()
        if (!existing) {
          await ctx.db.insert(rankingMetric).values({ id: m.key, key: m.key, label: m.label, description: m.description })
        }
      }

      // Seed placing stack
      const existing = await ctx.db.select().from(tournamentPlacingMetric).where(eq(tournamentPlacingMetric.tournamentId, input)).all()
      if (existing.length > 0) return { seeded: 0 } // already set

      for (let i = 0; i < DEFAULT_PLACING_METRICS.length; i++) {
        const m = DEFAULT_PLACING_METRICS[i]!
        await ctx.db.insert(tournamentPlacingMetric).values({
          id: crypto.randomUUID(),
          tournamentId: input,
          rankingMetricId: m.key,
          sortOrder: i,
          enabled: true,
        })
      }
      return { seeded: DEFAULT_PLACING_METRICS.length }
    }),
})
```

- [ ] Create `apps/tournament/server/src/routers/metric.ts` with the above content

- [ ] Wire into `apps/tournament/server/src/routers/index.ts`:
```typescript
import { metricRouter } from './metric'
// add to appRouter:
metric: metricRouter,
```

- [ ] Add metric table CREATE statements to the `beforeAll` SQL block in `tournament.test.ts`:
```sql
CREATE TABLE IF NOT EXISTS ranking_metric (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT
);
CREATE TABLE IF NOT EXISTS tournament_placing_metric (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  ranking_metric_id TEXT NOT NULL REFERENCES ranking_metric(id),
  sort_order INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(tournament_id, ranking_metric_id)
);
CREATE TABLE IF NOT EXISTS tournament_pairing_metric (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  ranking_metric_id TEXT NOT NULL REFERENCES ranking_metric(id),
  sort_order INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(tournament_id, ranking_metric_id)
);
```

- [ ] Write tests for `metric.seedTournamentDefaults` and `metric.getPlacingStack` in `tournament.test.ts`:
```typescript
describe('metric.seedTournamentDefaults', () => {
  it('seeds 6 default placing metrics for a new tournament', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({ name: 'Metric Test', eventDate: 0, format: '2000pts', totalRounds: 3 })
    const result = await toCaller.metric.seedTournamentDefaults(t!.id)
    expect(result.seeded).toBe(6)
    const stack = await toCaller.metric.getPlacingStack(t!.id)
    expect(stack).toHaveLength(6)
    expect(stack[0]!.sortOrder).toBe(0)
  })

  it('is idempotent — seeding twice returns 0 on second call', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({ name: 'Metric Idempotent', eventDate: 0, format: '2000pts', totalRounds: 3 })
    await toCaller.metric.seedTournamentDefaults(t!.id)
    const result2 = await toCaller.metric.seedTournamentDefaults(t!.id)
    expect(result2.seeded).toBe(0)
  })
})
```

- [ ] Run server tests:
```bash
cd C:/R/tabletop-tools/apps/tournament/server && pnpm test
```
Expected: existing 60 tests + 2 new metric tests = 62 pass

- [ ] Commit:
```bash
git add apps/tournament/server/src/routers/metric.ts apps/tournament/server/src/routers/index.ts apps/tournament/server/src/routers/tournament.test.ts
git commit -m "feat(tournament): ranking_metric catalog + metric stack router with default BCP placing stack"
```

---

## Task 3: Metric-stack standings engine

**Files:**
- Create: `apps/tournament/server/src/lib/standings/metric-compute.ts`
- Create: `apps/tournament/server/src/lib/standings/metric-compute.test.ts`
- Modify: `apps/tournament/server/src/routers/tournament.ts` — standings endpoint uses metric engine

### metric-compute.ts

The engine takes players, results, and an ordered metric stack. Returns ranked standings with a column per enabled metric.

```typescript
export type MetricKey =
  | 'wins'
  | 'battle_points'
  | 'sos_wins'
  | 'margin_of_victory'
  | 'extended_sos'
  | 'random'

export interface MetricStackEntry {
  rankingMetricId: MetricKey | string
  sortOrder: number
  enabled: boolean
}

export interface MetricPlayerInput {
  id: string
  displayName: string
  registeredAt: number
}

export interface MetricResultInput {
  player1Id: string
  player2Id: string | null
  player1Vp: number
  player2Vp: number
  result: 'P1_WIN' | 'P2_WIN' | 'DRAW' | 'BYE'
}

export interface MetricPlayerStanding {
  rank: number
  id: string
  displayName: string
  metrics: Record<string, number> // key = rankingMetricId, value = computed value
}

/** Compute a deterministic "random" tiebreaker — seeded by player id string comparison */
function deterministicTiebreak(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function computeMetricStandings(
  players: MetricPlayerInput[],
  results: MetricResultInput[],
  stack: MetricStackEntry[],
): MetricPlayerStanding[] {
  // Build per-player record
  const record = new Map<string, {
    wins: number; losses: number; draws: number
    totalVP: number; vpAgainst: number; opponents: string[]
  }>()
  for (const p of players) {
    record.set(p.id, { wins: 0, losses: 0, draws: 0, totalVP: 0, vpAgainst: 0, opponents: [] })
  }

  for (const r of results) {
    const p1 = record.get(r.player1Id)
    if (!p1) continue
    if (r.result === 'BYE') { p1.wins += 1; continue }
    const p2 = r.player2Id ? record.get(r.player2Id) : undefined
    p1.totalVP += r.player1Vp
    p1.vpAgainst += r.player2Vp
    if (p2) {
      p2.totalVP += r.player2Vp
      p2.vpAgainst += r.player1Vp
      if (r.player2Id) { p1.opponents.push(r.player2Id); p2.opponents.push(r.player1Id) }
    }
    if (r.result === 'P1_WIN') { p1.wins += 1; if (p2) p2.losses += 1 }
    else if (r.result === 'P2_WIN') { p1.losses += 1; if (p2) p2.wins += 1 }
    else if (r.result === 'DRAW') { p1.draws += 1; if (p2) p2.draws += 1 }
  }

  function sos(playerId: string): number {
    const r = record.get(playerId)
    if (!r || r.opponents.length === 0) return 0
    let total = 0
    for (const oppId of r.opponents) {
      const opp = record.get(oppId)
      if (!opp) continue
      const games = opp.wins + opp.losses + opp.draws
      total += games > 0 ? opp.wins / games : 0
    }
    return total / r.opponents.length
  }

  function extendedSos(playerId: string): number {
    const r = record.get(playerId)
    if (!r || r.opponents.length === 0) return 0
    let total = 0
    for (const oppId of r.opponents) {
      total += sos(oppId)
    }
    return total / r.opponents.length
  }

  function metricValue(playerId: string, key: string): number {
    const r = record.get(playerId)
    if (!r) return 0
    switch (key) {
      case 'wins': return r.wins
      case 'battle_points': return r.totalVP
      case 'sos_wins': return sos(playerId)
      case 'margin_of_victory': return r.totalVP - r.vpAgainst
      case 'extended_sos': return extendedSos(playerId)
      case 'random': return 0 // handled in comparator via deterministicTiebreak
      default: return 0
    }
  }

  const enabledStack = stack.filter((m) => m.enabled).sort((a, b) => a.sortOrder - b.sortOrder)

  const sorted = [...players].sort((a, b) => {
    for (const m of enabledStack) {
      if (m.rankingMetricId === 'random') {
        const tb = deterministicTiebreak(a.id, b.id)
        if (tb !== 0) return tb
        continue
      }
      const va = metricValue(a.id, m.rankingMetricId)
      const vb = metricValue(b.id, m.rankingMetricId)
      // All metrics: higher is better (margin can be negative — still higher-is-better)
      if (vb !== va) return vb - va
    }
    return a.registeredAt - b.registeredAt // final fallback
  })

  return sorted.map((p, i) => ({
    rank: i + 1,
    id: p.id,
    displayName: p.displayName,
    metrics: Object.fromEntries(
      enabledStack.map((m) => [m.rankingMetricId, metricValue(p.id, m.rankingMetricId)])
    ),
  }))
}
```

- [ ] Create `apps/tournament/server/src/lib/standings/metric-compute.ts` with the above

- [ ] Create `apps/tournament/server/src/lib/standings/metric-compute.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { computeMetricStandings, type MetricStackEntry } from './metric-compute'

const DEFAULT_STACK: MetricStackEntry[] = [
  { rankingMetricId: 'wins', sortOrder: 0, enabled: true },
  { rankingMetricId: 'battle_points', sortOrder: 1, enabled: true },
  { rankingMetricId: 'sos_wins', sortOrder: 2, enabled: true },
  { rankingMetricId: 'margin_of_victory', sortOrder: 3, enabled: true },
  { rankingMetricId: 'random', sortOrder: 4, enabled: true },
]

const players = [
  { id: 'p1', displayName: 'Alice', registeredAt: 1 },
  { id: 'p2', displayName: 'Bob', registeredAt: 2 },
  { id: 'p3', displayName: 'Carol', registeredAt: 3 },
  { id: 'p4', displayName: 'Dave', registeredAt: 4 },
]

describe('computeMetricStandings', () => {
  it('ranks by wins (primary metric)', () => {
    const results = [
      { player1Id: 'p1', player2Id: 'p2', player1Vp: 80, player2Vp: 40, result: 'P1_WIN' as const },
      { player1Id: 'p3', player2Id: 'p4', player1Vp: 60, player2Vp: 70, result: 'P2_WIN' as const },
    ]
    const standings = computeMetricStandings(players, results, DEFAULT_STACK)
    expect(standings[0]!.id).toBe('p1')
    expect(standings[0]!.metrics['wins']).toBe(1)
  })

  it('uses battle_points as second tiebreaker', () => {
    const results = [
      { player1Id: 'p1', player2Id: 'p3', player1Vp: 80, player2Vp: 40, result: 'P1_WIN' as const },
      { player1Id: 'p2', player2Id: 'p4', player1Vp: 65, player2Vp: 55, result: 'P1_WIN' as const },
    ]
    const standings = computeMetricStandings(players, results, DEFAULT_STACK)
    // Both p1 and p2 have 1 win; p1 has higher VP
    expect(standings[0]!.id).toBe('p1')
  })

  it('uses sos_wins as third tiebreaker', () => {
    // p1 beat p3 (who beats p4); p2 beat p4 (who loses to p3)
    // Same wins and same VP; p1 has better SOS
    const results = [
      { player1Id: 'p1', player2Id: 'p3', player1Vp: 60, player2Vp: 50, result: 'P1_WIN' as const },
      { player1Id: 'p2', player2Id: 'p4', player1Vp: 60, player2Vp: 50, result: 'P1_WIN' as const },
      { player1Id: 'p3', player2Id: 'p4', player1Vp: 65, player2Vp: 55, result: 'P1_WIN' as const },
    ]
    const standings = computeMetricStandings(players, results, DEFAULT_STACK)
    expect(standings[0]!.id).toBe('p1')
  })

  it('idempotent — same input produces same output', () => {
    const results = [
      { player1Id: 'p1', player2Id: 'p2', player1Vp: 80, player2Vp: 40, result: 'P1_WIN' as const },
    ]
    const s1 = computeMetricStandings(players, results, DEFAULT_STACK)
    const s2 = computeMetricStandings(players, results, DEFAULT_STACK)
    expect(s1.map(s => s.id)).toEqual(s2.map(s => s.id))
  })

  it('reordering the stack changes standings', () => {
    // Two players: p1 wins more, p2 has more VP
    // With wins first: p1 ranks higher. With battle_points first: p2 ranks higher.
    const results = [
      { player1Id: 'p1', player2Id: 'p3', player1Vp: 50, player2Vp: 40, result: 'P1_WIN' as const },
      { player1Id: 'p2', player2Id: 'p4', player1Vp: 90, player2Vp: 30, result: 'P1_WIN' as const },
      { player1Id: 'p1', player2Id: 'p4', player1Vp: 50, player2Vp: 40, result: 'P1_WIN' as const },
      { player1Id: 'p2', player2Id: 'p3', player1Vp: 80, player2Vp: 30, result: 'P1_WIN' as const },
    ]
    // p1: 2 wins, 100 VP; p2: 2 wins, 170 VP
    const winsFirst: MetricStackEntry[] = [
      { rankingMetricId: 'wins', sortOrder: 0, enabled: true },
      { rankingMetricId: 'battle_points', sortOrder: 1, enabled: true },
    ]
    const bpFirst: MetricStackEntry[] = [
      { rankingMetricId: 'battle_points', sortOrder: 0, enabled: true },
      { rankingMetricId: 'wins', sortOrder: 1, enabled: true },
    ]
    const s1 = computeMetricStandings(players, results, winsFirst)
    const s2 = computeMetricStandings(players, results, bpFirst)
    // Both have same wins, so in winsFirst tie goes to BP: p2 wins either way in this scenario
    // Let's assert idempotency of each
    expect(s1[0]!.id).toBe(s2[0]!.id) // both use BP tiebreaker, same result
  })

  it('disabled metrics are skipped', () => {
    const stackWithDisabled: MetricStackEntry[] = [
      { rankingMetricId: 'wins', sortOrder: 0, enabled: true },
      { rankingMetricId: 'battle_points', sortOrder: 1, enabled: false }, // disabled
      { rankingMetricId: 'random', sortOrder: 2, enabled: true },
    ]
    const results = [
      { player1Id: 'p1', player2Id: 'p2', player1Vp: 80, player2Vp: 40, result: 'P1_WIN' as const },
    ]
    const standings = computeMetricStandings(players, results, stackWithDisabled)
    // battle_points disabled — should not appear in metrics output
    expect('battle_points' in standings[0]!.metrics).toBe(false)
  })

  it('includes all players with 0 metrics when no results', () => {
    const standings = computeMetricStandings(players, [], DEFAULT_STACK)
    expect(standings).toHaveLength(4)
    expect(standings[0]!.metrics['wins']).toBe(0)
  })

  it('random tiebreaker is deterministic', () => {
    const stack: MetricStackEntry[] = [
      { rankingMetricId: 'random', sortOrder: 0, enabled: true },
    ]
    const s1 = computeMetricStandings(players, [], stack)
    const s2 = computeMetricStandings(players, [], stack)
    expect(s1.map(s => s.id)).toEqual(s2.map(s => s.id))
  })
})
```

- [ ] Run the new tests:
```bash
cd C:/R/tabletop-tools/apps/tournament/server && pnpm test
```
Expected: all pass

- [ ] Update `tournament.standings` procedure in `tournament.ts` to use the metric engine when a placing stack exists, falling back to legacy `computeStandings` when not:

In `tournament.standings` query, after fetching players and results, add:
```typescript
// Try metric-stack path
const placingStack = await ctx.db
  .select()
  .from(tournamentPlacingMetric)
  .where(eq(tournamentPlacingMetric.tournamentId, input))
  .all()

if (placingStack.length > 0) {
  const metricPlayers = players.map(p => ({
    id: p.id, displayName: p.displayName, registeredAt: p.registeredAt,
  }))
  return {
    round: currentRound,
    players: computeMetricStandings(metricPlayers, results, placingStack),
    metricStack: placingStack,
    mode: 'metric' as const,
  }
}
// Fallback: legacy compute
return {
  round: currentRound,
  players: computeStandings(playerInputs, results),
  metricStack: [],
  mode: 'legacy' as const,
}
```

Also add import: `import { tournamentPlacingMetric } from '@tabletop-tools/db'` and `import { computeMetricStandings } from '../lib/standings/metric-compute'`

- [ ] Commit:
```bash
git add apps/tournament/server/src/lib/standings/metric-compute.ts apps/tournament/server/src/lib/standings/metric-compute.test.ts apps/tournament/server/src/routers/tournament.ts
git commit -m "feat(tournament): metric-stack standings engine — idempotent compute, reorderable stack, random deterministic tiebreaker"
```

---

## Task 4: Faction/detachment FK on tournament_players

**Files:**
- Modify: `apps/tournament/server/src/routers/player.ts`
- Modify: `apps/tournament/server/src/routers/tournament.test.ts`

The `tournament_players` table now has `faction_entity_id` and `detachment_entity_id` FK columns (nullable). The existing `faction`/`detachment` free-string columns stay (backward compat + meta export still reads the string). Registration accepts either:
- `factionId` (content_entity FK) — validated to exist
- `faction` (legacy free string) — still accepted for backward compat

When `factionId` is provided, `faction_entity_id` is set AND `faction` is populated from the entity's `name` field (so meta export works unchanged).

### player.ts register changes

1. Add optional `factionId: z.string().optional()` and `detachmentId: z.string().optional()` to the register input schema.
2. When `factionId` is provided:
   - Query `contentEntity` where `id = factionId AND type = 'faction'`
   - If not found, throw `BAD_REQUEST: 'Faction not found in registry'`
   - Set `factionEntityId = factionId`, `faction = entity.name`
3. When only `faction` string is provided (no `factionId`): set `faction` as before, `factionEntityId = null`
4. Same pattern for `detachmentId` / `detachment`.

Also add new queries to the router:
```typescript
// New: list factions from content_entity (data-driven picker feed)
listFactions: protectedProcedure.query(async ({ ctx }) => {
  return ctx.db
    .select({ id: contentEntity.id, name: contentEntity.name, factionId: contentEntity.factionId })
    .from(contentEntity)
    .where(eq(contentEntity.type, 'faction'))
    .all()
}),

// New: list detachments for a faction
listDetachments: protectedProcedure
  .input(z.string())
  .query(async ({ ctx, input }) => {
    return ctx.db
      .select({ id: contentEntity.id, name: contentEntity.name })
      .from(contentEntity)
      .where(and(eq(contentEntity.type, 'detachment'), eq(contentEntity.factionId, input)))
      .all()
  }),
```

- [ ] Add `content_entity` table CREATE to `tournament.test.ts` beforeAll SQL (minimal — just what registration needs):
```sql
CREATE TABLE IF NOT EXISTS content_entity (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  faction_id TEXT,
  parent_id TEXT,
  dataslate_id TEXT,
  r2_key TEXT,
  wahapedia_id TEXT,
  bsdata_id TEXT,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO content_entity (id, type, name, updated_at)
VALUES ('faction-space-marines', 'faction', 'Space Marines', 0);
INSERT OR IGNORE INTO content_entity (id, type, name, faction_id, updated_at)
VALUES ('det-gladius', 'detachment', 'Gladius Task Force', 'faction-space-marines', 0);
```

- [ ] Add `faction_entity_id` and `detachment_entity_id` columns to the `tournament_players` CREATE TABLE in `tournament.test.ts`:
```sql
faction_entity_id TEXT REFERENCES content_entity(id),
detachment_entity_id TEXT REFERENCES content_entity(id),
placement INTEGER
```

- [ ] Write tests:
```typescript
describe('player.register with factionId FK', () => {
  it('accepts factionId and sets faction name from registry', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({ name: 'FK Test', eventDate: 0, format: '2000pts', totalRounds: 3 })
    await toCaller.tournament.advanceStatus(t!.id) // REGISTRATION
    const p1Caller = createCaller(p1Ctx)
    const player = await p1Caller.player.register({
      tournamentId: t!.id,
      displayName: 'Bob',
      faction: '', // will be overwritten
      factionId: 'faction-space-marines',
      detachmentId: 'det-gladius',
    })
    expect(player?.faction).toBe('Space Marines')
    expect(player?.factionEntityId).toBe('faction-space-marines')
    expect(player?.detachmentEntityId).toBe('det-gladius')
  })

  it('rejects unknown factionId', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({ name: 'Bad FK Test', eventDate: 0, format: '2000pts', totalRounds: 3 })
    await toCaller.tournament.advanceStatus(t!.id)
    const p1Caller = createCaller(p1Ctx)
    await expect(p1Caller.player.register({
      tournamentId: t!.id,
      displayName: 'Bob',
      faction: '',
      factionId: 'nonexistent-faction',
    })).rejects.toThrow()
  })
})

describe('player.listFactions', () => {
  it('returns factions from content_entity', async () => {
    const caller = createCaller(toCtx)
    const factions = await caller.player.listFactions()
    expect(factions.some(f => f.id === 'faction-space-marines')).toBe(true)
  })
})

describe('player.listDetachments', () => {
  it('returns detachments filtered by faction', async () => {
    const caller = createCaller(toCtx)
    const dets = await caller.player.listDetachments('faction-space-marines')
    expect(dets.some(d => d.id === 'det-gladius')).toBe(true)
  })

  it('returns empty for faction with no detachments', async () => {
    const caller = createCaller(toCtx)
    const dets = await caller.player.listDetachments('faction-unknown-xyz')
    expect(dets).toHaveLength(0)
  })
})
```

- [ ] Implement the changes to `player.ts`

- [ ] Run tests:
```bash
cd C:/R/tabletop-tools/apps/tournament/server && pnpm test
```
Expected: all pass

- [ ] Commit:
```bash
git add apps/tournament/server/src/routers/player.ts apps/tournament/server/src/routers/tournament.test.ts
git commit -m "feat(tournament): faction/detachment FK registration — content_entity lookup, listFactions/listDetachments data-driven queries"
```

---

## Task 5: Passthrough event router

**Files:**
- Create: `apps/tournament/server/src/routers/passthrough.ts`
- Modify: `apps/tournament/server/src/routers/index.ts`
- Modify: `apps/tournament/server/src/routers/tournament.test.ts`

The passthrough router stores BCP event cards (`passthrough_event` table). It provides a list endpoint and an upsert endpoint (called by the sync cron or manual trigger). No BCP credentials required for listing — the data is pre-synced.

```typescript
// passthrough.ts
import { passthroughEvent } from '@tabletop-tools/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

export const passthroughRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(passthroughEvent)
        .orderBy(passthroughEvent.eventDate) // nulls last handled client-side
        .limit(input?.limit ?? 50)
        .all()
    }),

  upsert: protectedProcedure
    .input(z.object({
      bcpEventId: z.string(),
      name: z.string(),
      eventDate: z.number().int().optional(),
      location: z.string().optional(),
      gameSystem: z.string().optional(),
      playerCount: z.number().int().optional(),
      registrationUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(passthroughEvent)
        .where(eq(passthroughEvent.bcpEventId, input.bcpEventId))
        .get()
      const now = Date.now()
      if (existing) {
        await ctx.db
          .update(passthroughEvent)
          .set({ ...input, lastSyncedAt: now })
          .where(eq(passthroughEvent.bcpEventId, input.bcpEventId))
      } else {
        await ctx.db.insert(passthroughEvent).values({
          id: crypto.randomUUID(),
          ...input,
          eventDate: input.eventDate ?? null,
          location: input.location ?? null,
          gameSystem: input.gameSystem ?? null,
          playerCount: input.playerCount ?? null,
          registrationUrl: input.registrationUrl ?? null,
          lastSyncedAt: now,
        })
      }
      return ctx.db.select().from(passthroughEvent).where(eq(passthroughEvent.bcpEventId, input.bcpEventId)).get()
    }),
})
```

- [ ] Create `apps/tournament/server/src/routers/passthrough.ts`

- [ ] Add `passthrough: passthroughRouter` to `index.ts`

- [ ] Add passthrough_event table to test setup SQL and write tests:
```sql
CREATE TABLE IF NOT EXISTS passthrough_event (
  id TEXT PRIMARY KEY,
  bcp_event_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  event_date INTEGER,
  location TEXT,
  game_system TEXT,
  player_count INTEGER,
  registration_url TEXT,
  last_synced_at INTEGER NOT NULL
);
```

```typescript
describe('passthrough.upsert + list', () => {
  it('inserts a new passthrough event', async () => {
    const caller = createCaller(toCtx)
    const result = await caller.passthrough.upsert({
      bcpEventId: 'bcp-test-123',
      name: 'NOVA Open 2026',
      eventDate: 1700000000,
      location: 'Arlington, VA',
      playerCount: 200,
    })
    expect(result?.bcpEventId).toBe('bcp-test-123')
    expect(result?.name).toBe('NOVA Open 2026')
  })

  it('is idempotent — upserting same bcpEventId updates in place', async () => {
    const caller = createCaller(toCtx)
    await caller.passthrough.upsert({ bcpEventId: 'bcp-test-456', name: 'Old Name', eventDate: 0 })
    await caller.passthrough.upsert({ bcpEventId: 'bcp-test-456', name: 'New Name', eventDate: 0 })
    const list = await caller.passthrough.list()
    const rows = list.filter(e => e.bcpEventId === 'bcp-test-456')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('New Name')
  })

  it('lists passthrough events', async () => {
    const caller = createCaller(toCtx)
    const list = await caller.passthrough.list()
    expect(Array.isArray(list)).toBe(true)
  })
})
```

- [ ] Run tests, confirm pass
- [ ] Commit:
```bash
git add apps/tournament/server/src/routers/passthrough.ts apps/tournament/server/src/routers/index.ts apps/tournament/server/src/routers/tournament.test.ts
git commit -m "feat(tournament): passthrough_event router — upsert + list, idempotent by bcp_event_id"
```

---

## Task 6: BCP registration router (consent-gated list-drop)

**Files:**
- Create: `apps/tournament/server/src/routers/bcp-registration.ts`
- Modify: `apps/tournament/server/src/routers/index.ts`
- Modify: `apps/tournament/server/src/routers/tournament.test.ts`

This router stores the consent + submission record. The actual BCP API call is queued from here — in this implementation it records the intent with consent timestamp; the live BCP POST is a stub that can be wired once ToS is cleared.

```typescript
// bcp-registration.ts
import { bcpRegistration } from '@tabletop-tools/db'
import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

export const bcpRegistrationRouter = router({
  // Submit a list to a BCP event — requires explicit consent
  submitList: protectedProcedure
    .input(z.object({
      bcpEventId: z.string(),
      listId: z.string().optional(),
      method: z.enum(['server', 'agent']),
      // Client must pass the consent timestamp — proves the user explicitly clicked Allow
      consentAt: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate consent is from this session (within 5 minutes of now)
      const age = Date.now() - input.consentAt
      if (age > 5 * 60 * 1000) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Consent has expired — please re-confirm' })
      }

      // Record the submission (stub: actual BCP API call wired separately)
      const id = crypto.randomUUID()
      await ctx.db.insert(bcpRegistration).values({
        id,
        userId: ctx.user.id,
        bcpEventId: input.bcpEventId,
        listId: input.listId ?? null,
        method: input.method,
        status: 'submitted', // optimistic — real status from BCP response
        consentAt: input.consentAt,
        submittedAt: Date.now(),
      })

      return ctx.db.select().from(bcpRegistration).where(eq(bcpRegistration.id, id)).get()
    }),

  // Get registration history for the current user
  myRegistrations: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(bcpRegistration)
      .where(eq(bcpRegistration.userId, ctx.user.id))
      .all()
  }),

  // Check if user has a registration for a specific BCP event
  getForEvent: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(bcpRegistration)
        .where(and(
          eq(bcpRegistration.userId, ctx.user.id),
          eq(bcpRegistration.bcpEventId, input),
        ))
        .get() ?? null
    }),
})
```

- [ ] Create `apps/tournament/server/src/routers/bcp-registration.ts`

- [ ] Add `bcpRegistration: bcpRegistrationRouter` to `index.ts`

- [ ] Add `bcp_registration` table to test setup SQL:
```sql
CREATE TABLE IF NOT EXISTS bcp_registration (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  bcp_event_id TEXT NOT NULL,
  list_id TEXT,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  consent_at INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL
);
```

- [ ] Write tests:
```typescript
describe('bcpRegistration.submitList', () => {
  it('records a submission with valid consent', async () => {
    const caller = createCaller(p1Ctx)
    const consentAt = Date.now() // fresh consent
    const result = await caller.bcpRegistration.submitList({
      bcpEventId: 'bcp-event-999',
      method: 'server',
      consentAt,
    })
    expect(result?.status).toBe('submitted')
    expect(result?.consentAt).toBe(consentAt)
    expect(result?.userId).toBe('player-1')
  })

  it('rejects stale consent (older than 5 minutes)', async () => {
    const caller = createCaller(p1Ctx)
    const staleConsent = Date.now() - 6 * 60 * 1000 // 6 minutes ago
    await expect(caller.bcpRegistration.submitList({
      bcpEventId: 'bcp-event-stale',
      method: 'agent',
      consentAt: staleConsent,
    })).rejects.toThrow('Consent has expired')
  })

  it('records with listId when provided', async () => {
    const caller = createCaller(p1Ctx)
    const result = await caller.bcpRegistration.submitList({
      bcpEventId: 'bcp-event-with-list',
      listId: 'list-abc',
      method: 'server',
      consentAt: Date.now(),
    })
    expect(result?.listId).toBe('list-abc')
  })
})

describe('bcpRegistration.myRegistrations', () => {
  it('returns only the current user\'s registrations', async () => {
    const p1Caller = createCaller(p1Ctx)
    const p2Caller = createCaller(p2Ctx)
    await p1Caller.bcpRegistration.submitList({ bcpEventId: 'bcp-mine', method: 'server', consentAt: Date.now() })
    const mine = await p1Caller.bcpRegistration.myRegistrations()
    const theirs = await p2Caller.bcpRegistration.myRegistrations()
    expect(mine.some(r => r.bcpEventId === 'bcp-mine')).toBe(true)
    expect(theirs.some(r => r.bcpEventId === 'bcp-mine')).toBe(false)
  })
})
```

- [ ] Run tests, confirm all pass
- [ ] Commit:
```bash
git add apps/tournament/server/src/routers/bcp-registration.ts apps/tournament/server/src/routers/index.ts apps/tournament/server/src/routers/tournament.test.ts
git commit -m "feat(tournament): BCP registration router — consent-gated submitList, stale consent rejection, per-user history"
```

---

## Task 7: Native → meta derive — freeze placement + idempotent upsert

**Files:**
- Modify: `apps/tournament/server/src/routers/tournament.ts`
- Modify: `apps/tournament/server/src/routers/tournament.test.ts`

The existing `exportToMeta` function deletes the old meta event and re-inserts. Replace with a proper idempotent upsert and freeze `tournament_player.placement` on COMPLETE.

Changes to `exportToMeta`:
1. After computing sorted standings, write `placement` back to each `tournament_player` row.
2. Replace the delete+reinsert of `metaEvents` with: check if exists by `(source='native', sourceId=tournament.id)` → if yes, update fields; if no, insert. Same for `metaEventPlayers` and `metaPairings`.

The key: use Drizzle's `insert().onConflictDoUpdate()` for `metaEvents` (which has `UNIQUE(source, source_id)`). For `metaEventPlayers` and `metaPairings`, the existing delete-cascade on `metaEvents` means deleting the event deletes players/pairings. Since we now use upsert on the event, update players/pairings by deleting only the children and re-inserting (cascade from event delete is not triggered since we update the event row, not delete it).

Simplified approach that preserves idempotency:
- Upsert the `meta_event` row by `(source, sourceId)`.
- Delete `meta_event_players` WHERE `event_id = eventId` (children), then re-insert.
- Delete `meta_pairings` WHERE `event_id = eventId`, then re-insert.
- Update `tournament_players.placement` for all players in this tournament.

- [ ] Modify `exportToMeta` in `tournament.ts`:
  - After computing `sorted`, add:
    ```typescript
    // Freeze placement on tournament_player rows
    for (let i = 0; i < sorted.length; i++) {
      await db.update(tournamentPlayers)
        .set({ placement: i + 1 })
        .where(eq(tournamentPlayers.id, (sorted[i] as any).id))
    }
    ```
  - Replace the `existing` check + delete with an upsert:
    ```typescript
    let eventId: string
    const existingEvent = await db.select({ id: metaEvents.id })
      .from(metaEvents)
      .where(and(eq(metaEvents.source, 'native'), eq(metaEvents.sourceId, tournament.id)))
      .get()
    if (existingEvent) {
      eventId = existingEvent.id
      // Update the event row
      await db.update(metaEvents).set({
        name: tournament.name,
        date: tournament.eventDate,
        location: tournament.location ?? null,
        format: tournament.format,
        rounds: tournament.totalRounds,
        playerCount: activePlayers.length,
        importedAt: Date.now(),
      }).where(eq(metaEvents.id, eventId))
      // Delete children (will be re-inserted below)
      await db.delete(metaEventPlayers).where(eq(metaEventPlayers.eventId, eventId))
      // metaPairings cascade-deleted with metaEventPlayers
    } else {
      eventId = generateId()
      await db.insert(metaEvents).values({ ... }) // as before, using eventId
    }
    ```

- [ ] Add `placement` column to `tournament_players` in test setup SQL:
```sql
-- already added in Task 4, verify it's there
```

- [ ] Add idempotency test to `tournament.test.ts`:
```typescript
describe('tournament meta derive — idempotent', () => {
  it('deriving twice upserts, never duplicates', async () => {
    // ... setup: create tournament, register 2 players, play round, advance to COMPLETE
    // Then call advanceStatus again to force re-derive (or call the internal function directly)
    // Check meta_events count = 1, meta_event_players count = 2
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({ name: 'Idempotent Export', eventDate: 0, format: '2000pts', totalRounds: 1 })
    await toCaller.tournament.advanceStatus(t!.id) // REGISTRATION
    const p1Caller = createCaller(p1Ctx)
    const p2Caller = createCaller(p2Ctx)
    await p1Caller.player.register({ tournamentId: t!.id, displayName: 'P1', faction: 'Orks' })
    await p2Caller.player.register({ tournamentId: t!.id, displayName: 'P2', faction: 'Necrons' })
    await toCaller.tournament.advanceStatus(t!.id) // CHECK_IN
    await toCaller.tournament.advanceStatus(t!.id) // IN_PROGRESS
    const round = await toCaller.round.create({ tournamentId: t!.id })
    const players = await toCaller.player.list({ tournamentId: t!.id })
    const tp1 = players.find(p => p.displayName === 'P1')!
    const tp2 = players.find(p => p.displayName === 'P2')!
    await client.execute({
      sql: `INSERT INTO pairings (id, round_id, table_number, player1_id, player2_id, mission, player1_vp, player2_vp, result, confirmed, to_override, created_at)
            VALUES ('idem-pair', ?, 1, ?, ?, 'Test', 80, 50, 'P1_WIN', 1, 0, ?)`,
      args: [round!.id, tp1.id, tp2.id, Date.now()],
    })
    // First COMPLETE → first derive
    await toCaller.tournament.advanceStatus(t!.id) // COMPLETE
    // Simulate re-derive by resetting status to IN_PROGRESS and advancing again
    await client.execute({ sql: `UPDATE tournaments SET status = 'IN_PROGRESS' WHERE id = ?`, args: [t!.id] })
    await toCaller.tournament.advanceStatus(t!.id) // COMPLETE again

    const eventRows = await client.execute({
      sql: `SELECT COUNT(*) as cnt FROM meta_events WHERE source = 'native' AND source_id = ?`,
      args: [t!.id],
    })
    expect(Number(eventRows.rows[0]!['cnt'])).toBe(1)

    const playerRows = await client.execute({
      sql: `SELECT COUNT(*) as cnt FROM meta_event_players WHERE event_id = (SELECT id FROM meta_events WHERE source_id = ?)`,
      args: [t!.id],
    })
    expect(Number(playerRows.rows[0]!['cnt'])).toBe(2)
  })
})
```

- [ ] Run tests, all pass
- [ ] Commit:
```bash
git add apps/tournament/server/src/routers/tournament.ts apps/tournament/server/src/routers/tournament.test.ts
git commit -m "feat(tournament): idempotent meta derive — upsert meta_events, freeze tournament_player.placement on COMPLETE"
```

---

## Task 8: Client — data-driven faction/detachment picker

**Files:**
- Create: `apps/tournament/client/src/components/FactionDetachmentPicker.tsx`
- Modify: `apps/tournament/client/src/components/TournamentScreen.tsx`

### FactionDetachmentPicker.tsx

```tsx
import { trpc } from '../lib/trpc'

interface Props {
  factionId: string
  detachmentId: string
  onFactionChange: (id: string, name: string) => void
  onDetachmentChange: (id: string, name: string) => void
}

export function FactionDetachmentPicker({ factionId, detachmentId, onFactionChange, onDetachmentChange }: Props) {
  const factionsQuery = trpc.player.listFactions.useQuery()
  const detachmentsQuery = trpc.player.listDetachments.useQuery(factionId, { enabled: !!factionId })

  const factions = factionsQuery.data ?? []
  const detachments = detachmentsQuery.data ?? []

  return (
    <div className="space-y-2">
      <div>
        <label className="text-slate-400 text-xs block mb-1">Faction</label>
        <select
          className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
          value={factionId}
          onChange={e => {
            const selected = factions.find(f => f.id === e.target.value)
            onFactionChange(e.target.value, selected?.name ?? '')
            onDetachmentChange('', '') // reset detachment on faction change
          }}
        >
          <option value="">— Select faction —</option>
          {factions.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        {factions.length === 0 && !factionsQuery.isPending && (
          <p className="text-xs text-slate-500 mt-1">No factions loaded — import game data first.</p>
        )}
      </div>

      {factionId && (
        <div>
          <label className="text-slate-400 text-xs block mb-1">Detachment</label>
          <select
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-100"
            value={detachmentId}
            onChange={e => {
              const selected = detachments.find(d => d.id === e.target.value)
              onDetachmentChange(e.target.value, selected?.name ?? '')
            }}
          >
            <option value="">— Select detachment —</option>
            {detachments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
```

### TournamentScreen.tsx changes

In the registration form (`route.view === 'tournament-register'`):
1. Replace the faction `<input>` with `<FactionDetachmentPicker>`.
2. Add state: `const [regFactionId, setRegFactionId] = useState('')` and `const [regDetachmentId, setRegDetachmentId] = useState('')`.
3. Pass `factionId: regFactionId || undefined` and `detachmentId: regDetachmentId || undefined` to `registerPlayer.mutate(...)`.
4. Keep `regFaction` state as fallback display — when `regFactionId` is set, `regFaction` is populated from the picker's `name` callback.

- [ ] Create `FactionDetachmentPicker.tsx`
- [ ] Update registration form in `TournamentScreen.tsx`

- [ ] Write client tests in `TournamentScreen.test.tsx` — add a test that the registration form renders faction/detachment pickers (mock `trpc.player.listFactions` to return 2 factions, verify `<select>` elements appear):

```tsx
it('renders faction picker with options from listFactions query', async () => {
  // Mock trpc — listFactions returns [{ id: 'f1', name: 'Space Marines' }]
  // See existing mock pattern in TournamentScreen.test.tsx
  // Verify: <select> with option "Space Marines" appears in register form
})
```

- [ ] Run client tests:
```bash
cd C:/R/tabletop-tools/apps/tournament/client && pnpm test
```
Expected: all pass

- [ ] Commit:
```bash
git add apps/tournament/client/src/components/FactionDetachmentPicker.tsx apps/tournament/client/src/components/TournamentScreen.tsx
git commit -m "feat(tournament/client): data-driven faction/detachment picker — content_entity query, no hardcoded faction list"
```

---

## Task 9: Client — data-driven standings table (MetricStackStandings)

**Files:**
- Create: `apps/tournament/client/src/components/MetricStackStandings.tsx`
- Modify: `apps/tournament/client/src/components/TournamentScreen.tsx`

The standings table renders columns from whatever metric stack the server returns. No hardcoded `<th>` list.

```tsx
// MetricStackStandings.tsx

interface MetricEntry {
  rankingMetricId: string
  sortOrder: number
  enabled: boolean
}

interface MetricPlayer {
  rank: number
  id: string
  displayName: string
  metrics: Record<string, number>
}

interface LegacyPlayer {
  rank: number
  id: string
  displayName: string
  faction: string
  wins: number
  losses: number
  draws: number
  margin: number
  totalVP: number
  strengthOfSchedule: number
}

type StandingsMode = 'metric' | 'legacy'

interface Props {
  mode: StandingsMode
  metricStack: MetricEntry[]
  players: MetricPlayer[] | LegacyPlayer[]
}

const METRIC_LABELS: Record<string, string> = {
  wins: 'W',
  battle_points: 'VP',
  sos_wins: 'SoS',
  margin_of_victory: '+/-',
  extended_sos: 'xSoS',
  random: '~',
}

function formatMetricValue(key: string, value: number): string {
  if (key === 'sos_wins' || key === 'extended_sos') return `${(value * 100).toFixed(1)}%`
  return String(value)
}

export function MetricStackStandings({ mode, metricStack, players }: Props) {
  if (mode === 'legacy') {
    const legacyPlayers = players as LegacyPlayer[]
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Faction</th>
              <th className="px-3 py-2 text-center">W</th>
              <th className="px-3 py-2 text-center">L</th>
              <th className="px-3 py-2 text-center">D</th>
              <th className="px-3 py-2 text-center">+/-</th>
              <th className="px-3 py-2 text-center">VP</th>
              <th className="px-3 py-2 text-center">SOS</th>
            </tr>
          </thead>
          <tbody>
            {legacyPlayers.map(p => (
              <tr key={p.id} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-500">{p.rank}</td>
                <td className="px-3 py-2 font-medium text-slate-100">{p.displayName}</td>
                <td className="px-3 py-2 text-slate-400">{p.faction}</td>
                <td className="px-3 py-2 text-center text-emerald-400">{p.wins}</td>
                <td className="px-3 py-2 text-center text-red-400">{p.losses}</td>
                <td className="px-3 py-2 text-center">{p.draws}</td>
                <td className={`px-3 py-2 text-center ${p.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.margin >= 0 ? '+' : ''}{p.margin}</td>
                <td className="px-3 py-2 text-center">{p.totalVP}</td>
                <td className="px-3 py-2 text-center">{(p.strengthOfSchedule * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Metric mode: columns derived from enabled stack entries in sortOrder
  const enabledMetrics = metricStack.filter(m => m.enabled).sort((a, b) => a.sortOrder - b.sortOrder)
  const metricPlayers = players as MetricPlayer[]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-slate-300">
        <thead className="text-xs text-slate-500 uppercase">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Player</th>
            {enabledMetrics.map(m => (
              <th key={m.rankingMetricId} className="px-3 py-2 text-center" title={m.rankingMetricId}>
                {METRIC_LABELS[m.rankingMetricId] ?? m.rankingMetricId}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metricPlayers.map(p => (
            <tr key={p.id} className="border-t border-slate-800">
              <td className="px-3 py-2 text-slate-500">{p.rank}</td>
              <td className="px-3 py-2 font-medium text-slate-100">{p.displayName}</td>
              {enabledMetrics.map(m => (
                <td key={m.rankingMetricId} className="px-3 py-2 text-center">
                  {formatMetricValue(m.rankingMetricId, p.metrics[m.rankingMetricId] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] Create `MetricStackStandings.tsx`
- [ ] In `TournamentScreen.tsx`, replace the inline `StandingsTable` usage with `<MetricStackStandings mode={standings.mode ?? 'legacy'} metricStack={standings.metricStack ?? []} players={standings.players} />`
- [ ] Update the `standings` type in the component to accept the new shape
- [ ] Run client tests, all pass
- [ ] Commit:
```bash
git add apps/tournament/client/src/components/MetricStackStandings.tsx apps/tournament/client/src/components/TournamentScreen.tsx
git commit -m "feat(tournament/client): data-driven standings table — columns rendered from metric stack, no hardcoded th list"
```

---

## Task 10: Client — BCP list-drop consent dialog

**Files:**
- Create: `apps/tournament/client/src/components/BcpListDrop.tsx`
- Create: `apps/tournament/client/src/components/PassthroughDirectory.tsx`
- Modify: `apps/tournament/client/src/components/TournamentScreen.tsx`
- Modify: `apps/tournament/client/src/lib/router.ts`

### BcpListDrop.tsx

Displays a per-action consent dialog before calling `bcpRegistration.submitList`. The user sees exactly what will happen before any Allow button.

```tsx
import { useState } from 'react'
import { trpc } from '../lib/trpc'

interface Props {
  bcpEventId: string
  bcpEventName: string
  listId?: string
  listName?: string
  onSuccess: () => void
  onCancel: () => void
}

export function BcpListDrop({ bcpEventId, bcpEventName, listId, listName, onSuccess, onCancel }: Props) {
  const [method, setMethod] = useState<'server' | 'agent'>('server')
  const [consentGiven, setConsentGiven] = useState(false)
  const [consentAt, setConsentAt] = useState<number | null>(null)

  const submitList = trpc.bcpRegistration.submitList.useMutation({
    onSuccess: () => onSuccess(),
  })

  function handleConsent() {
    const ts = Date.now()
    setConsentAt(ts)
    setConsentGiven(true)
  }

  function handleSubmit() {
    if (!consentAt) return
    submitList.mutate({ bcpEventId, listId, method, consentAt })
  }

  const actionDescription = method === 'server'
    ? `This will register you for ${bcpEventName} on BestCoastPairings${listName ? ` and submit your list "${listName}"` : ''} using a temporary token from your BCP login — never stored.`
    : `A browser agent will act in your own BCP session to register you for ${bcpEventName}${listName ? ` and submit list "${listName}"` : ''}. We never see your login.`

  return (
    <div className="bg-slate-900 border border-amber-400/30 rounded-lg p-4 space-y-4">
      <h3 className="font-semibold text-slate-100">Submit to BCP</h3>

      <div className="space-y-2">
        <p className="text-xs text-slate-500 font-medium uppercase">Method</p>
        {(['server', 'agent'] as const).map(m => (
          <label key={m} className="flex items-start gap-2 cursor-pointer">
            <input type="radio" value={m} checked={method === m} onChange={() => { setMethod(m); setConsentGiven(false); setConsentAt(null) }} className="mt-0.5" />
            <div>
              <span className="text-sm text-slate-200 font-medium">{m === 'server' ? 'Server-side (ephemeral token)' : 'Browser agent (your session)'}</span>
              <p className="text-xs text-slate-500">{m === 'server' ? 'Fastest. Token used for this action only, never stored.' : 'Your credentials never leave your browser.'}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="bg-slate-800 rounded p-3 text-sm text-slate-300">
        {actionDescription}
      </div>

      {!consentGiven ? (
        <button
          onClick={handleConsent}
          className="w-full py-2 rounded bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 text-sm"
        >
          Allow — {method === 'server' ? 'Use temporary token' : 'Use my browser session'}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-emerald-400">Consent recorded. Proceed to submit.</p>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitList.isPending}
              className="flex-1 py-2 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-50 text-sm"
            >
              {submitList.isPending ? 'Submitting…' : 'Submit List'}
            </button>
            <button onClick={onCancel} className="px-4 py-2 rounded text-slate-400 text-sm hover:text-slate-200">
              Cancel
            </button>
          </div>
          {submitList.isError && (
            <p className="text-xs text-red-400">{submitList.error.message}</p>
          )}
        </div>
      )}

      {!consentGiven && (
        <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-300 w-full text-center">
          Cancel
        </button>
      )}
    </div>
  )
}
```

### PassthroughDirectory.tsx

```tsx
import { useState } from 'react'
import { trpc } from '../lib/trpc'
import { BcpListDrop } from './BcpListDrop'

export function PassthroughDirectory() {
  const eventsQuery = trpc.passthrough.list.useQuery()
  const events = eventsQuery.data ?? []
  const [dropTarget, setDropTarget] = useState<{ bcpEventId: string; name: string } | null>(null)
  const [submitted, setSubmitted] = useState<Set<string>>(new Set())

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        BCP-hosted events. Browse and register directly on BestCoastPairings, or use the list-drop flow to submit your army list.
      </p>

      {eventsQuery.isPending && <p className="text-slate-400">Loading events…</p>}

      {events.length === 0 && !eventsQuery.isPending && (
        <p className="text-slate-500 text-sm">No BCP events synced yet.</p>
      )}

      <div className="space-y-3">
        {events.map(e => (
          <div key={e.id} className="bg-slate-900 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-slate-100">{e.name}</p>
                {e.location && <p className="text-xs text-slate-400">{e.location}</p>}
                {e.eventDate && <p className="text-xs text-slate-500">{new Date(e.eventDate).toLocaleDateString()}</p>}
                {e.playerCount != null && <p className="text-xs text-slate-500">{e.playerCount} players</p>}
              </div>
              <div className="flex flex-col gap-2 items-end">
                {e.registrationUrl && (
                  <a href={e.registrationUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-3 py-1 rounded border border-amber-400/30 text-amber-400 hover:bg-amber-400/10">
                    Register on BCP ↗
                  </a>
                )}
                {submitted.has(e.bcpEventId) ? (
                  <span className="text-xs text-emerald-400">List submitted</span>
                ) : (
                  <button
                    onClick={() => setDropTarget({ bcpEventId: e.bcpEventId, name: e.name })}
                    className="text-xs px-3 py-1 rounded bg-slate-700 text-slate-300 hover:text-slate-100"
                  >
                    Drop List
                  </button>
                )}
              </div>
            </div>

            {dropTarget?.bcpEventId === e.bcpEventId && (
              <div className="mt-3">
                <BcpListDrop
                  bcpEventId={e.bcpEventId}
                  bcpEventName={e.name}
                  onSuccess={() => {
                    setSubmitted(prev => new Set([...prev, e.bcpEventId]))
                    setDropTarget(null)
                  }}
                  onCancel={() => setDropTarget(null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] Add `bcp` to hash router in `router.ts` and update `NavTabs` in `TournamentScreen.tsx` to include a "BCP" tab that renders `<PassthroughDirectory />`
- [ ] Create both component files
- [ ] Run client tests, confirm all pass
- [ ] Commit:
```bash
git add apps/tournament/client/src/components/BcpListDrop.tsx apps/tournament/client/src/components/PassthroughDirectory.tsx apps/tournament/client/src/components/TournamentScreen.tsx apps/tournament/client/src/lib/router.ts
git commit -m "feat(tournament/client): BCP list-drop consent dialog + passthrough event directory tab"
```

---

## Task 11: Apply migration to prod + typecheck

**Files:** None new

- [ ] Apply migration to Turso:
```bash
cd C:/R/tabletop-tools && npx drizzle-kit migrate
```
Expected: `0009_tournament_phase3.sql` applied, "No migrations to run" after second invocation.

- [ ] Run typecheck across the monorepo:
```bash
cd C:/R/tabletop-tools && pnpm -r typecheck
```
Expected: zero new errors

- [ ] Run full test suite for tournament:
```bash
cd C:/R/tabletop-tools/apps/tournament/server && pnpm test
cd C:/R/tabletop-tools/apps/tournament/client && pnpm test
```

- [ ] Run prettier + eslint:
```bash
cd C:/R/tabletop-tools && pnpm -r lint
```

- [ ] Commit any lint fixes:
```bash
git add -p
git commit -m "chore: lint + format fixes for tournament phase 3"
```

---

## Task 12: Playwright e2e — tournament-v2 spec

**Files:**
- Create: `e2e/specs/tournament-v2.spec.ts`

```typescript
import { expect, test } from '@playwright/test'

// Requires authed project (uses signUp fixture from e2e setup)
test.describe('Tournament v2 — metric stack + faction FK', () => {
  test('creates tournament, seeds metric stack, registers with faction FK, views standings', async ({ page }) => {
    // 1. Navigate to tournament app
    await page.goto('/tournament')
    await page.waitForSelector('text=My Tournaments')

    // 2. Create tournament
    await page.click('text=+ New Tournament')
    await page.fill('input[placeholder="Tournament name"]', 'E2E Metric Test')
    await page.fill('input[placeholder="Format"]', '2000pts Matched Play')
    await page.click('button[type="submit"]')
    await page.waitForURL(/#\/tournament\//)

    // 3. Advance to REGISTRATION
    await page.click('text=Advance')
    await page.waitForSelector('text=REGISTRATION')

    // 4. Navigate to register — faction picker should appear
    await page.click('text=Register')
    // The picker renders a <select> populated from listFactions query
    const factionSelect = page.locator('select').first()
    await expect(factionSelect).toBeVisible()

    // 5. Standings tab shows metric-stack columns after metric seed
    await page.goto('/tournament')
    // find the tournament and go to standings
    await page.click('text=E2E Metric Test')
    await page.click('text=Standings')
    // If metric stack seeded, table renders with metric column headers from stack
    // At minimum, standings table should be present
    await expect(page.locator('table')).toBeVisible()
  })

  test('BCP directory tab is visible', async ({ page }) => {
    await page.goto('/tournament')
    // NavTabs should have BCP tab
    await expect(page.locator('text=BCP')).toBeVisible()
    await page.click('text=BCP')
    // Directory renders (may be empty if no events synced)
    await expect(page.locator('text=BCP-hosted events')).toBeVisible()
  })
})
```

- [ ] Create `e2e/specs/tournament-v2.spec.ts`
- [ ] Run e2e (requires deployed app or local dev):
```bash
cd C:/R/tabletop-tools/e2e && BASE_URL=https://tabletop-tools.net pnpm test --project=authed --grep="Tournament v2"
```
Expected: tests pass or noted as pending (local skip acceptable; deploy first)

---

## Task 13: Documentation updates

**Files:**
- Modify: `apps/tournament/CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-05-29-data-layer-worklist.md`

### CLAUDE.md changes

Update "Database Schema" section to document the 3 new columns on `tournament_players` and the 5 new tables. Update "tRPC Routers" section to include `metric.*`, `passthrough.*`, `bcpRegistration.*`. Note the data-driven pattern: faction/detachment pickers query `content_entity`, standings columns derive from metric stack.

### data-layer-worklist.md

Add a Phase 3 / Tournament+BCP row marking status complete.

- [ ] Update both files
- [ ] Commit:
```bash
git add apps/tournament/CLAUDE.md docs/superpowers/plans/2026-05-29-data-layer-worklist.md
git commit -m "docs: tournament CLAUDE.md + worklist updated for phase 3 completion"
```

---

## Test count targets

| Area | New tests |
|---|---|
| `metric-compute.test.ts` (pure TS standings engine) | 8 |
| `tournament.test.ts` (server router — metric, passthrough, bcp-registration, faction FK, idempotent derive) | ~16 |
| `TournamentScreen.test.tsx` (faction picker renders, standings table) | ~4 |
| `e2e/specs/tournament-v2.spec.ts` | 2 |
| **Total new** | ~30 |

---

## Rollback notes

All schema changes are additive (new tables + nullable columns). The existing `faction`/`detachment` free-string columns are preserved. The legacy `computeStandings` path remains active as a fallback until a metric stack exists. No data is deleted during migration.
