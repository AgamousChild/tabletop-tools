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
