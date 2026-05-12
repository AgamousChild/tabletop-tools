import { z } from 'zod'
import { sql, gt, desc, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, adminProcedure, publicProcedure } from '../trpc.js'
import {
  authUsers,
  authSessions,
  diceSets,
  diceRollingSessions,
  rolls,
  simulations,
  lists,
  listUnits,
  matches,
  turns,
  tournaments,
  tournamentPlayers,
  playerElo,
  importedTournamentResults,
  playerGlicko,
  bcpScrapeJobs,
  metaEvents,
} from '@tabletop-tools/db'

async function count(db: any, table: any): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(table)
  return row.count
}

export const statsRouter = router({
  overview: adminProcedure.query(async ({ ctx }) => {
    const now = Date.now()
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)

    const [totalUsers] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(authUsers)

    const [recentUsers] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(authUsers)
      .where(gt(authUsers.createdAt, sevenDaysAgo))

    const [totalSessions] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(authSessions)

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
        lists: await count(ctx.db, lists),
        units: await count(ctx.db, listUnits),
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
        imports: await count(ctx.db, importedTournamentResults),
        glickoPlayers: await count(ctx.db, playerGlicko),
      },
      elo: {
        players: await count(ctx.db, playerElo),
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
    const [ncTotal] = await ctx.db.select({ count: sql<number>`count(*)` }).from(diceRollingSessions)
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
    const [lbTotal] = await ctx.db.select({ count: sql<number>`count(*)` }).from(lists)
    const [lbRecent] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(lists)
      .where(gt(lists.createdAt, sevenDaysAgo))
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

    // New Meta: imports
    const [nmTotal] = await ctx.db.select({ count: sql<number>`count(*)` }).from(importedTournamentResults)
    const [nmRecent] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(importedTournamentResults)
      .where(gt(importedTournamentResults.importedAt, sevenDaysAgo))
    activity.push({ app: 'new-meta', total: nmTotal.count, recent: nmRecent.count })

    return activity
  }),

  importHistory: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50
      const rows = await ctx.db
        .select({
          id: importedTournamentResults.id,
          eventName: importedTournamentResults.eventName,
          eventDate: importedTournamentResults.eventDate,
          format: importedTournamentResults.format,
          metaWindow: importedTournamentResults.metaWindow,
          parsedData: importedTournamentResults.parsedData,
          importedAt: importedTournamentResults.importedAt,
        })
        .from(importedTournamentResults)
        .orderBy(desc(importedTournamentResults.importedAt))
        .limit(limit)

      return rows.map((row) => {
        let playerCount = 0
        try {
          const records = JSON.parse(row.parsedData)
          if (Array.isArray(records)) {
            for (const rec of records) {
              if (rec.players && Array.isArray(rec.players)) {
                playerCount += rec.players.length
              }
            }
          }
        } catch { /* ignore parse errors */ }

        return {
          id: row.id,
          eventName: row.eventName,
          eventDate: row.eventDate,
          format: row.format,
          metaWindow: row.metaWindow,
          importedAt: row.importedAt,
          playerCount,
        }
      })
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

    const [total] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(matches)

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
      const [user] = await ctx.db
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, input.userId))
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
      const [user] = await ctx.db
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, input.userId))
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
      // Cascading deletes handle related data (sessions, tournament_players, etc.)
      await ctx.db.delete(authUsers).where(eq(authUsers.id, input.userId))
      return { deleted: true }
    }),

  pipeline: adminProcedure.query(async ({ ctx }) => {
    // Meta 3NF counts
    const events = await ctx.db.all(sql`SELECT count(*) as n FROM meta_events`).catch(() => [{ n: 0 }])
    const players = await ctx.db.all(sql`SELECT count(*) as n FROM meta_event_players`).catch(() => [{ n: 0 }])
    const pairings = await ctx.db.all(sql`SELECT count(*) as n FROM meta_pairings`).catch(() => [{ n: 0 }])
    const withLists = await ctx.db.all(sql`SELECT count(*) as n FROM meta_event_players WHERE list_text IS NOT NULL`).catch(() => [{ n: 0 }])
    const withDetachment = await ctx.db.all(sql`SELECT count(*) as n FROM meta_event_players WHERE detachment_id IS NOT NULL`).catch(() => [{ n: 0 }])

    // Cube counts
    const facts = await ctx.db.all(sql`SELECT count(*) as n FROM fact_game_results`).catch(() => [{ n: 0 }])
    const frames = await ctx.db.all(sql`SELECT count(*) as n FROM meta_for`).catch(() => [{ n: 0 }])
    const topRows = await ctx.db.all(sql`SELECT count(*) as n FROM meta_top`).catch(() => [{ n: 0 }])

    // Cube status
    const cubeStatus = await ctx.db.all(sql`SELECT * FROM meta_cube_status WHERE id = 1`).catch(() => [])

    // Dimension counts
    const factions = await ctx.db.all(sql`SELECT count(*) as n FROM dim_faction`).catch(() => [{ n: 0 }])
    const detachments = await ctx.db.all(sql`SELECT count(*) as n FROM dim_detachment`).catch(() => [{ n: 0 }])

    // Brain community nodes (from meta_top community counts — approximate)
    // We can't read R2 from here, so just report cube data

    // Date range
    const dateRange = await ctx.db.all(sql`SELECT min(date) as earliest, max(date) as latest FROM meta_events`).catch(() => [{ earliest: null, latest: null }])

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

    const [totalEvents] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(metaEvents)

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
    const resp = await ctx.bcpScraper.fetch(new Request('https://bcp-scraper/scrape', { method: 'POST' }))
    if (!resp.ok) {
      return { status: 'error', message: `Scraper returned ${resp.status}` }
    }
    const result = await resp.json() as { jobId?: string }
    return { status: 'triggered', message: 'Scrape started', jobId: result.jobId }
  }),

  triggerMetaPipeline: adminProcedure.mutation(async () => {
    return { status: 'not-configured', message: 'Meta pipeline trigger not configured yet' }
  }),

  listParserStatus: adminProcedure.query(async ({ ctx }) => {
    const [parsed] = await ctx.db.all(
      sql`SELECT count(*) as n FROM meta_event_players WHERE list_ttt IS NOT NULL AND json_extract(list_ttt, '$.parseStatus') = 'ok'`,
    ) as any[]
    const [partial] = await ctx.db.all(
      sql`SELECT count(*) as n FROM meta_event_players WHERE list_ttt IS NOT NULL AND json_extract(list_ttt, '$.parseStatus') = 'partial'`,
    ) as any[]
    const [failed] = await ctx.db.all(
      sql`SELECT count(*) as n FROM meta_event_players WHERE list_ttt IS NOT NULL AND json_extract(list_ttt, '$.parseStatus') = 'failed'`,
    ) as any[]
    const [pending] = await ctx.db.all(
      sql`SELECT count(*) as n FROM meta_event_players WHERE list_ttt IS NULL AND list_text IS NOT NULL AND list_text != ''`,
    ) as any[]
    return {
      parsed: parsed?.n || 0,
      partial: partial?.n || 0,
      failed: failed?.n || 0,
      pending: pending?.n || 0,
    }
  }),

  bsdataVersion: publicProcedure.query(async () => {
    try {
      const res = await fetch(
        'https://api.github.com/repos/BSData/wh40k-10e/commits?per_page=1',
        { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'tabletop-tools-admin' } },
      )
      if (!res.ok) return { sha: null, date: null, message: null, error: `GitHub API: ${res.status}` }
      const commits = await res.json()
      if (!Array.isArray(commits) || commits.length === 0) return { sha: null, date: null, message: null, error: 'No commits found' }
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
