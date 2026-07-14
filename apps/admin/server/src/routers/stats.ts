import {
  authSessions,
  authUsers,
  bcpScrapeJobs,
  diceRollingSessions,
  diceSets,
  ingestContent,
  ingestSources,
  list,
  listUnit,
  matches,
  metaEvents,
  playerGlicko,
  rolls,
  simulations,
  tournamentPlayers,
  tournaments,
  turns,
} from '@tabletop-tools/db'
import { TRPCError } from '@trpc/server'
import { desc, eq, gt, sql } from 'drizzle-orm'
import { z } from 'zod'

import { addIngestSourceSchema } from '../schemas/ingest.js'
import { adminProcedure, publicProcedure, router, serviceHeaders } from '../trpc.js'

export { addIngestSourceSchema }

async function count(db: any, table: any): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(table)
  return row.count
}

export const statsRouter = router({
  overview: adminProcedure.query(async ({ ctx }) => {
    const now = Date.now()
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)

    const [totalUsers] = await ctx.db.select({ count: sql<number>`count(*)` }).from(authUsers)

    const [recentUsers] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(authUsers)
      .where(gt(authUsers.createdAt, sevenDaysAgo))

    const [totalSessions] = await ctx.db.select({ count: sql<number>`count(*)` }).from(authSessions)

    const [activeSessions] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(authSessions)
      .where(gt(authSessions.expiresAt, new Date(now)))

    return {
      users: {
        total: totalUsers.count,
        recent: recentUsers.count,
      },
      sessions: {
        active: activeSessions.count,
        total: totalSessions.count,
      },
      noCheat: {
        diceSets: await count(ctx.db, diceSets),
        rollingSessions: await count(ctx.db, diceRollingSessions),
        totalRolls: await count(ctx.db, rolls),
      },
      versus: {
        simulations: await count(ctx.db, simulations),
      },
      listBuilder: {
        lists: await count(ctx.db, list),
        units: await count(ctx.db, listUnit),
      },
      gameTracker: {
        matches: await count(ctx.db, matches),
        turns: await count(ctx.db, turns),
      },
      tournament: {
        tournaments: await count(ctx.db, tournaments),
        players: await count(ctx.db, tournamentPlayers),
      },
      newMeta: {
        events: await count(ctx.db, metaEvents),
        glickoPlayers: await count(ctx.db, playerGlicko),
      },
    }
  }),

  recentUsers: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20
      const rows = await ctx.db
        .select({
          id: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
          createdAt: authUsers.createdAt,
        })
        .from(authUsers)
        .orderBy(desc(authUsers.createdAt))
        .limit(limit)

      return rows
    }),

  activeSessions: adminProcedure.query(async ({ ctx }) => {
    const now = Date.now()
    const rows = await ctx.db
      .select({
        id: authSessions.id,
        userId: authSessions.userId,
        userName: authUsers.name,
        userEmail: authUsers.email,
        createdAt: authSessions.createdAt,
        expiresAt: authSessions.expiresAt,
        ipAddress: authSessions.ipAddress,
        userAgent: authSessions.userAgent,
      })
      .from(authSessions)
      .innerJoin(authUsers, sql`${authSessions.userId} = ${authUsers.id}`)
      .where(gt(authSessions.expiresAt, new Date(now)))
      .orderBy(desc(authSessions.createdAt))

    return rows
  }),

  appActivity: adminProcedure.query(async ({ ctx }) => {
    const activity: { app: string; total: number; recent: number }[] = []

    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

    // No-Cheat: rolling sessions
    const [ncTotal] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(diceRollingSessions)
    const [ncRecent] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(diceRollingSessions)
      .where(gt(diceRollingSessions.createdAt, sevenDaysAgo))
    activity.push({ app: 'no-cheat', total: ncTotal.count, recent: ncRecent.count })

    // Versus: simulations
    const [vsTotal] = await ctx.db.select({ count: sql<number>`count(*)` }).from(simulations)
    const [vsRecent] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(simulations)
      .where(gt(simulations.createdAt, sevenDaysAgo))
    activity.push({ app: 'versus', total: vsTotal.count, recent: vsRecent.count })

    // List Builder: lists
    const [lbTotal] = await ctx.db.select({ count: sql<number>`count(*)` }).from(list)
    const [lbRecent] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(list)
      .where(gt(list.createdAt, sevenDaysAgo))
    activity.push({ app: 'list-builder', total: lbTotal.count, recent: lbRecent.count })

    // Game Tracker: matches
    const [gtTotal] = await ctx.db.select({ count: sql<number>`count(*)` }).from(matches)
    const [gtRecent] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(matches)
      .where(gt(matches.createdAt, sevenDaysAgo))
    activity.push({ app: 'game-tracker', total: gtTotal.count, recent: gtRecent.count })

    // Tournament: tournaments
    const [toTotal] = await ctx.db.select({ count: sql<number>`count(*)` }).from(tournaments)
    const [toRecent] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(tournaments)
      .where(gt(tournaments.createdAt, sevenDaysAgo))
    activity.push({ app: 'tournament', total: toTotal.count, recent: toRecent.count })

    // New Meta: events
    const [nmTotal] = await ctx.db.select({ count: sql<number>`count(*)` }).from(metaEvents)
    const [nmRecent] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(metaEvents)
      .where(gt(metaEvents.importedAt, sevenDaysAgo))
    activity.push({ app: 'new-meta', total: nmTotal.count, recent: nmRecent.count })

    return activity
  }),

  recentEvents: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50
      return ctx.db
        .select({
          id: metaEvents.id,
          name: metaEvents.name,
          date: metaEvents.date,
          location: metaEvents.location,
          rounds: metaEvents.rounds,
          playerCount: metaEvents.playerCount,
          source: metaEvents.source,
          sourceId: metaEvents.sourceId,
        })
        .from(metaEvents)
        .orderBy(desc(metaEvents.date))
        .limit(limit)
    }),

  topFactions: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20
      const rows = await ctx.db
        .select({
          faction: tournamentPlayers.faction,
          count: sql<number>`count(*)`,
        })
        .from(tournamentPlayers)
        .groupBy(tournamentPlayers.faction)
        .orderBy(desc(sql`count(*)`))
        .limit(limit)

      return rows
    }),

  matchResults: adminProcedure.query(async ({ ctx }) => {
    const [wins] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(matches)
      .where(eq(matches.result, 'WIN'))

    const [losses] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(matches)
      .where(eq(matches.result, 'LOSS'))

    const [draws] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(matches)
      .where(eq(matches.result, 'DRAW'))

    const [total] = await ctx.db.select({ count: sql<number>`count(*)` }).from(matches)

    const [inProgress] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(matches)
      .where(sql`${matches.result} IS NULL`)

    return {
      wins: wins.count,
      losses: losses.count,
      draws: draws.count,
      inProgress: inProgress.count,
      total: total.count,
    }
  }),

  revokeSession: adminProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(authSessions)
        .where(eq(authSessions.id, input.sessionId))
      if (!session) throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' })
      // Expire the session immediately by setting expiresAt to now
      await ctx.db
        .update(authSessions)
        .set({ expiresAt: new Date() })
        .where(eq(authSessions.id, input.sessionId))
      return { revoked: true }
    }),

  revokeAllSessions: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select().from(authUsers).where(eq(authUsers.id, input.userId))
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
      await ctx.db
        .update(authSessions)
        .set({ expiresAt: new Date() })
        .where(eq(authSessions.userId, input.userId))
      return { revoked: true }
    }),

  deleteUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select().from(authUsers).where(eq(authUsers.id, input.userId))
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
      // Cascading deletes handle related data (sessions, tournament_players, etc.)
      await ctx.db.delete(authUsers).where(eq(authUsers.id, input.userId))
      return { deleted: true }
    }),

  pipeline: adminProcedure.query(async ({ ctx }) => {
    // Meta 3NF counts
    const events = await ctx.db
      .all(sql`SELECT count(*) as n FROM meta_events`)
      .catch(() => [{ n: 0 }])
    const players = await ctx.db
      .all(sql`SELECT count(*) as n FROM meta_event_players`)
      .catch(() => [{ n: 0 }])
    const pairings = await ctx.db
      .all(sql`SELECT count(*) as n FROM meta_pairings`)
      .catch(() => [{ n: 0 }])
    const withLists = await ctx.db
      .all(sql`SELECT count(*) as n FROM meta_event_players WHERE list_text IS NOT NULL`)
      .catch(() => [{ n: 0 }])
    const withDetachment = await ctx.db
      .all(sql`SELECT count(*) as n FROM meta_event_players WHERE detachment_id IS NOT NULL`)
      .catch(() => [{ n: 0 }])

    // Cube counts
    const facts = await ctx.db
      .all(sql`SELECT count(*) as n FROM fact_game_results`)
      .catch(() => [{ n: 0 }])
    const frames = await ctx.db.all(sql`SELECT count(*) as n FROM meta_for`).catch(() => [{ n: 0 }])
    const topRows = await ctx.db
      .all(sql`SELECT count(*) as n FROM meta_top`)
      .catch(() => [{ n: 0 }])

    // Cube status
    const cubeStatus = await ctx.db
      .all(sql`SELECT * FROM meta_cube_status WHERE id = 1`)
      .catch(() => [])

    // Dimension counts
    const factions = await ctx.db
      .all(sql`SELECT count(*) as n FROM dim_faction`)
      .catch(() => [{ n: 0 }])
    const detachments = await ctx.db
      .all(sql`SELECT count(*) as n FROM dim_detachment`)
      .catch(() => [{ n: 0 }])

    // Brain community nodes (from meta_top community counts — approximate)
    // We can't read R2 from here, so just report cube data

    // Date range
    const dateRange = await ctx.db
      .all(sql`SELECT min(date) as earliest, max(date) as latest FROM meta_events`)
      .catch(() => [{ earliest: null, latest: null }])

    return {
      meta: {
        events: (events as any)[0]?.n ?? 0,
        players: (players as any)[0]?.n ?? 0,
        pairings: (pairings as any)[0]?.n ?? 0,
        withLists: (withLists as any)[0]?.n ?? 0,
        withDetachment: (withDetachment as any)[0]?.n ?? 0,
        earliestEvent: (dateRange as any)[0]?.earliest ?? null,
        latestEvent: (dateRange as any)[0]?.latest ?? null,
      },
      cube: {
        factRows: (facts as any)[0]?.n ?? 0,
        frames: (frames as any)[0]?.n ?? 0,
        metaTopRows: (topRows as any)[0]?.n ?? 0,
        status: (cubeStatus as any)[0]?.status ?? 'unknown',
        lastCompleted: (cubeStatus as any)[0]?.last_completed_at ?? null,
      },
      dimensions: {
        factions: (factions as any)[0]?.n ?? 0,
        detachments: (detachments as any)[0]?.n ?? 0,
      },
    }
  }),

  bcpScraperStatus: adminProcedure.query(async ({ ctx }) => {
    const [latestJob] = await ctx.db
      .select()
      .from(bcpScrapeJobs)
      .orderBy(desc(bcpScrapeJobs.startedAt))
      .limit(1)

    const [totalEvents] = await ctx.db.select({ count: sql<number>`count(*)` }).from(metaEvents)

    return {
      latestJob: latestJob ?? null,
      totalEvents: totalEvents.count,
    }
  }),

  bcpScraperHistory: adminProcedure
    .input(z.object({ limit: z.number().optional().default(20) }))
    .query(async ({ ctx, input }) => {
      const jobs = await ctx.db
        .select()
        .from(bcpScrapeJobs)
        .orderBy(desc(bcpScrapeJobs.startedAt))
        .limit(input.limit)

      return jobs
    }),

  triggerBcpScrape: adminProcedure.mutation(async ({ ctx }) => {
    if (!ctx.bcpScraper) {
      return { status: 'error', message: 'BCP Scraper service binding not configured' }
    }
    const resp = await ctx.bcpScraper.fetch(
      new Request('https://bcp-scraper/scrape', {
        method: 'POST',
        headers: serviceHeaders(ctx.syncSecret),
      }),
    )
    if (!resp.ok) {
      return { status: 'error', message: `Scraper returned ${resp.status}` }
    }
    const result = (await resp.json()) as { jobId?: string }
    return { status: 'triggered', message: 'Scrape started', jobId: result.jobId }
  }),

  triggerMetaPipeline: adminProcedure.mutation(async () => {
    return { status: 'not-configured', message: 'Meta pipeline trigger not configured yet' }
  }),

  listParserStatus: adminProcedure.query(async ({ ctx }) => {
    const [parsed] = (await ctx.db.all(
      sql`SELECT count(*) as n FROM meta_event_players WHERE list_ttt IS NOT NULL AND json_extract(list_ttt, '$.parseStatus') = 'ok'`,
    )) as any[]
    const [partial] = (await ctx.db.all(
      sql`SELECT count(*) as n FROM meta_event_players WHERE list_ttt IS NOT NULL AND json_extract(list_ttt, '$.parseStatus') = 'partial'`,
    )) as any[]
    const [failed] = (await ctx.db.all(
      sql`SELECT count(*) as n FROM meta_event_players WHERE list_ttt IS NOT NULL AND json_extract(list_ttt, '$.parseStatus') = 'failed'`,
    )) as any[]
    const [pending] = (await ctx.db.all(
      sql`SELECT count(*) as n FROM meta_event_players WHERE list_ttt IS NULL AND list_text IS NOT NULL AND list_text != ''`,
    )) as any[]
    return {
      parsed: parsed?.n || 0,
      partial: partial?.n || 0,
      failed: failed?.n || 0,
      pending: pending?.n || 0,
    }
  }),

  // ── Ingest Sources ────────────────────────────────────────────────────────

  ingestSourcesList: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(ingestSources)
  }),

  addIngestSource: adminProcedure.input(addIngestSourceSchema).mutation(async ({ ctx, input }) => {
    if (!ctx.contentIngestor) {
      return { status: 'error', message: 'Content Ingestor service binding not configured' }
    }
    const resp = await ctx.contentIngestor.fetch(
      new Request('https://content-ingestor/sources', {
        method: 'POST',
        headers: serviceHeaders(ctx.syncSecret, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(input),
      }),
    )
    if (!resp.ok) return { status: 'error', message: `Ingestor returned ${resp.status}` }
    const result = (await resp.json()) as { id: string; status: string }
    return { status: 'created', id: result.id }
  }),

  toggleIngestSource: adminProcedure
    .input(z.object({ id: z.string(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.contentIngestor) {
        return { status: 'error', message: 'Content Ingestor service binding not configured' }
      }
      const resp = await ctx.contentIngestor.fetch(
        new Request(`https://content-ingestor/sources/${input.id}`, {
          method: 'PATCH',
          headers: serviceHeaders(ctx.syncSecret, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ active: input.active }),
        }),
      )
      if (!resp.ok) return { status: 'error', message: `Ingestor returned ${resp.status}` }
      return { status: 'updated' }
    }),

  // ── Ingest Content ─────────────────────────────────────────────────────────

  ingestJobs: adminProcedure
    .input(z.object({ limit: z.number().optional().default(50), source: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const baseQuery = ctx.db
        .select({
          id: ingestContent.id,
          url: ingestContent.url,
          title: ingestContent.title,
          sourceId: ingestContent.sourceId,
          sourceType: ingestSources.type,
          sourceName: ingestSources.name,
          status: ingestContent.status,
          nodesExtracted: ingestContent.nodesExtracted,
          error: ingestContent.error,
          createdAt: ingestContent.discoveredAt,
        })
        .from(ingestContent)
        .innerJoin(ingestSources, eq(ingestContent.sourceId, ingestSources.id))

      const rows = input.source
        ? await baseQuery
            .where(eq(ingestContent.sourceId, input.source))
            .orderBy(desc(ingestContent.discoveredAt))
            .limit(input.limit)
        : await baseQuery.orderBy(desc(ingestContent.discoveredAt)).limit(input.limit)

      return rows
    }),

  triggerDiscover: adminProcedure.mutation(async ({ ctx }) => {
    if (!ctx.contentIngestor) {
      return { status: 'error', message: 'Content Ingestor service binding not configured' }
    }
    const resp = await ctx.contentIngestor.fetch(
      new Request('https://content-ingestor/discover', {
        method: 'POST',
        headers: serviceHeaders(ctx.syncSecret),
      }),
    )
    if (!resp.ok) return { status: 'error', message: `Ingestor returned ${resp.status}` }
    const result = await resp.json()
    return { status: 'triggered', result }
  }),

  triggerProcess: adminProcedure.mutation(async ({ ctx }) => {
    if (!ctx.contentIngestor) {
      return { status: 'error', message: 'Content Ingestor service binding not configured' }
    }
    const resp = await ctx.contentIngestor.fetch(
      new Request('https://content-ingestor/process', {
        method: 'POST',
        headers: serviceHeaders(ctx.syncSecret),
      }),
    )
    if (!resp.ok) return { status: 'error', message: `Ingestor returned ${resp.status}` }
    const result = await resp.json()
    return { status: 'triggered', result }
  }),

  triggerYoutubeIngest: adminProcedure
    .input(z.object({ url: z.string(), sourceName: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.contentIngestor) {
        return { status: 'error', message: 'Content Ingestor service binding not configured' }
      }
      const resp = await ctx.contentIngestor.fetch(
        new Request('https://content-ingestor/ingest/youtube', {
          method: 'POST',
          headers: serviceHeaders(ctx.syncSecret, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ url: input.url, sourceName: input.sourceName }),
        }),
      )
      if (!resp.ok) return { status: 'error', message: `Ingestor returned ${resp.status}` }
      const result = (await resp.json()) as { contentId?: string }
      return { status: 'triggered', message: 'Ingestion started', contentId: result.contentId }
    }),

  triggerWebIngest: adminProcedure
    .input(z.object({ url: z.string(), sourceName: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.contentIngestor) {
        return { status: 'error', message: 'Content Ingestor service binding not configured' }
      }
      const resp = await ctx.contentIngestor.fetch(
        new Request('https://content-ingestor/ingest/web', {
          method: 'POST',
          headers: serviceHeaders(ctx.syncSecret, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ url: input.url, sourceName: input.sourceName }),
        }),
      )
      if (!resp.ok) return { status: 'error', message: `Ingestor returned ${resp.status}` }
      const result = (await resp.json()) as { contentId?: string }
      return { status: 'triggered', message: 'Ingestion started', contentId: result.contentId }
    }),

  bsdataVersion: publicProcedure.query(async () => {
    try {
      const res = await fetch('https://api.github.com/repos/BSData/wh40k-10e/commits?per_page=1', {
        headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'tabletop-tools-admin' },
      })
      if (!res.ok)
        return { sha: null, date: null, message: null, error: `GitHub API: ${res.status}` }
      const commits = await res.json()
      if (!Array.isArray(commits) || commits.length === 0)
        return { sha: null, date: null, message: null, error: 'No commits found' }
      const latest = commits[0]
      return {
        sha: latest.sha?.slice(0, 7) ?? null,
        date: latest.commit?.committer?.date ?? null,
        message: latest.commit?.message?.split('\n')[0] ?? null,
        error: null,
      }
    } catch (e) {
      return { sha: null, date: null, message: null, error: String(e) }
    }
  }),
})
