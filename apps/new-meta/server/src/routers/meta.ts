import { sql } from 'drizzle-orm'
import { z } from 'zod'

import {
  getFramesWithData,
  getFrameTypeSummaries,
  getGranularityIdByName,
  getPopulatedGranularities,
  getTypeIdByName,
  resolveDefaultFrame,
} from '../lib/frameFilters.js'
import { publicProcedure, router } from '../trpc.js'

const FrameSchema = z.string().optional()
const GranularityIdSchema = z.number().int().positive().optional()
const GranularityNameSchema = z.string().optional()

// Defaults expressed by name, not by literal id. The id is resolved
// from dim_granularity at request time so we don't need to know the
// numeric key in source code (Rule 6).
const DEFAULT_GRANULARITY_NAME = 'Faction'
// When the client doesn't specify a frame, prefer the most recent
// populated frame of this type. If the type has no populated frames,
// frameFilters falls back to the most recent populated frame of any
// type, so a missing preferred type is not a hard failure.
const DEFAULT_PREFERRED_TYPE = 'Quarter'
// Per-faction timeline aggregates over Month-typed frames. The type
// name is mapped to an id at request time.
const TIMELINE_TYPE_NAME = 'Month'

/**
 * Resolve the granularity id from either an explicit id, an explicit
 * name, or the configured default name. Throws a useful error if the
 * default isn't present in the database.
 */
async function resolveGranularityId(
  ctx: { db: { all: (q: ReturnType<typeof sql>) => Promise<unknown[]> } },
  input: { granularityId?: number; granularity?: string } | undefined,
): Promise<number> {
  if (input?.granularityId != null) return input.granularityId
  const name = input?.granularity ?? DEFAULT_GRANULARITY_NAME
  const id = await getGranularityIdByName(ctx.db, name)
  if (id == null) {
    throw new Error(
      `Granularity "${name}" not found in dim_granularity — populate the dim before querying.`,
    )
  }
  return id
}

export const metaRouter = router({
  factions: publicProcedure
    .input(
      z
        .object({
          frame: FrameSchema,
          granularityId: GranularityIdSchema,
          granularity: GranularityNameSchema,
          minGames: z.number().int().min(1).default(5),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const granularityId = await resolveGranularityId(ctx, input)

      const frameId =
        input?.frame ?? (await resolveDefaultFrame(ctx.db, granularityId, DEFAULT_PREFERRED_TYPE))
      if (!frameId) return []

      const rows = await ctx.db.all(sql`
        SELECT mt.faction_id, df.name AS faction, df.allegiance,
               mt.win_rate, mt.draw_rate, mt.over_rep, mt.four_oh_start,
               mt.event_wins, mt.event_finals, mt.event_top4, mt.event_top8, mt.event_top16,
               mt.player_pop_pct, mt.wins, mt.losses, mt.draws, mt.games, mt.players
        FROM meta_top mt
        JOIN dim_faction df ON mt.faction_id = df.id
        WHERE mt.meta_for_id = ${frameId} AND mt.granularity_id = ${granularityId}
        ORDER BY mt.win_rate DESC
      `)

      const minGames = input?.minGames ?? 5
      return (rows as any[])
        .filter((r) => r.games >= minGames)
        .map((r) => ({
          factionId: r.faction_id,
          faction: r.faction,
          allegiance: r.allegiance,
          winRate: r.win_rate,
          drawRate: r.draw_rate,
          overRep: r.over_rep,
          fourOhStart: r.four_oh_start,
          eventWins: r.event_wins,
          eventFinals: r.event_finals,
          eventTop4: r.event_top4,
          eventTop8: r.event_top8,
          eventTop16: r.event_top16,
          playerPopPct: r.player_pop_pct,
          wins: r.wins,
          losses: r.losses,
          draws: r.draws,
          games: r.games,
          players: r.players,
        }))
    }),

  faction: publicProcedure
    .input(
      z.object({
        factionId: z.string(),
        frame: FrameSchema,
        granularityId: GranularityIdSchema,
        granularity: GranularityNameSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      // Four one-row dim lookups that do not depend on each other. Each still
      // costs a full round trip to Turso, so resolving them serially was pure
      // added latency on every faction page.
      const [granularityId, detachmentGranularityId, comboGranularityId, timelineTypeId] =
        await Promise.all([
          resolveGranularityId(ctx, input),
          getGranularityIdByName(ctx.db, 'Detachment'),
          getGranularityIdByName(ctx.db, 'Combo'),
          getTypeIdByName(ctx.db, TIMELINE_TYPE_NAME),
        ])

      const frameId =
        input.frame ?? (await resolveDefaultFrame(ctx.db, granularityId, DEFAULT_PREFERRED_TYPE))

      // Faction stats
      let stat = null
      if (frameId) {
        const statRows = await ctx.db.all(sql`
          SELECT mt.*, df.name AS faction FROM meta_top mt
          JOIN dim_faction df ON mt.faction_id = df.id
          WHERE mt.faction_id = ${input.factionId}
            AND mt.meta_for_id = ${frameId}
            AND mt.granularity_id = ${granularityId}
        `)
        const r = (statRows as any[])[0]
        if (r) {
          stat = {
            faction: r.faction,
            winRate: r.win_rate,
            drawRate: r.draw_rate,
            overRep: r.over_rep,
            games: r.games,
            players: r.players,
            eventWins: r.event_wins,
            eventTop4: r.event_top4,
            eventTop8: r.event_top8,
            playerPopPct: r.player_pop_pct,
            wins: r.wins,
            losses: r.losses,
            draws: r.draws,
          }
        }
      }

      // Detachments — a plain indexed read off the Detachment-granularity
      // rollup. The "any position" logic lives in the cube builder and is
      // resolved once at build time.
      //
      // This used to aggregate fact_game_results against the combo-member
      // bridge on every request: 4.3s for 12 rows, because the cube only ever
      // built Faction-granularity rollups and the interface compensated with a
      // runtime join. Rule 6 — dashboard queries are indexed SELECTs.
      const detRows = await ctx.db.all(sql`
        SELECT dd.name AS detachment, mt.detachment_id,
               mt.games, mt.wins, mt.losses, mt.draws, mt.win_rate, mt.players
        FROM meta_top mt
        JOIN dim_detachment dd ON mt.detachment_id = dd.id
        WHERE mt.granularity_id = ${detachmentGranularityId}
          AND mt.faction_id = ${input.factionId}
          AND mt.meta_for_id = ${frameId}
          AND mt.games >= 5
        ORDER BY mt.win_rate DESC
      `)
      const detachments = (detRows as any[]).map((r) => ({
        detachment: r.detachment,
        detachmentId: r.detachment_id,
        winRate: r.win_rate,
        games: r.games,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        players: r.players,
      }))

      // Detachment COMBOS — the set an army actually brought, as one row.
      //
      // Distinct from the breakdown above: that answers "how does Skyshroud
      // Spearhead do wherever it appears", this answers "how does Cursed Legion
      // PLUS Skyshroud Spearhead do", which is the question 11e list-building
      // actually poses. memberCount lets the UI separate single-detachment
      // armies from real pairings.
      // Same shape: read the Combo-granularity rollup. The member-name label is
      // a dimension attribute, so it joins to dim_detachment_combo, never to
      // the fact table.
      const comboRows = await ctx.db.all(sql`
        SELECT mt.combo_id, c.member_count, c.total_dp, c.members,
               mt.games, mt.wins, mt.losses, mt.draws, mt.win_rate, mt.players
        FROM meta_top mt
        JOIN dim_detachment_combo c ON mt.combo_id = c.id
        WHERE mt.granularity_id = ${comboGranularityId}
          AND mt.faction_id = ${input.factionId}
          AND mt.meta_for_id = ${frameId}
          AND mt.games >= 5
        ORDER BY mt.win_rate DESC
      `)
      const combos = (comboRows as any[]).map((r) => ({
        comboId: r.combo_id,
        members: r.members ?? r.combo_id,
        memberCount: r.member_count,
        totalDp: r.total_dp,
        winRate: r.win_rate,
        games: r.games,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        players: r.players,
      }))

      // Timeline — aggregate across the per-month rollup frames. Resolve
      // the type id from dim_for_type by name rather than baking the
      // integer into the query.
      const tlRows =
        timelineTypeId == null
          ? []
          : await ctx.db.all(sql`
              SELECT mf.date, mt.win_rate, mt.games, mt.wins, mt.losses, mt.draws
              FROM meta_top mt JOIN meta_for mf ON mt.meta_for_id = mf.id
              WHERE mt.faction_id = ${input.factionId}
                AND mt.granularity_id = ${granularityId}
                AND mf.type_id = ${timelineTypeId}
              ORDER BY mf.date
            `)
      const timeline = (tlRows as any[]).map((r) => ({
        date: r.date,
        week: new Date(r.date).toISOString().slice(0, 10),
        winRate: r.win_rate,
        games: r.games,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
      }))

      // Top lists
      // Top lists. Not an aggregate, so not a rollup — but the label is a
      // DIMENSION attribute, so it comes from dim_detachment_combo.members
      // rather than a correlated GROUP_CONCAT over the bridge table per row.
      // That subquery cost 3.7s; this is a primary-key lookup.
      const listRows = await ctx.db.all(sql`
        SELECT ep.player_name, ep.placement, ep.list_text, ep.wins, ep.losses, ep.draws,
               COALESCE(dc.members, dd.name) AS detachment,
               me.name AS event_name, me.date AS event_date, me.format
        FROM meta_event_players ep
        JOIN meta_events me ON ep.event_id = me.id
        LEFT JOIN dim_detachment_combo dc ON ep.combo_id = dc.id
        LEFT JOIN dim_detachment dd ON ep.detachment_id = dd.id
        WHERE ep.faction_id = ${input.factionId}
        ORDER BY ep.placement ASC LIMIT 20
      `)
      const topLists = (listRows as any[]).map((r) => ({
        playerName: r.player_name,
        placement: r.placement,
        listText: r.list_text,
        detachment: r.detachment,
        eventName: r.event_name,
        eventDate: r.event_date,
        format: r.format,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
      }))

      return { stat, detachments, combos, timeline, topLists }
    }),

  matchups: publicProcedure
    .input(
      z.object({ frame: FrameSchema, minGames: z.number().int().min(1).default(3) }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.all(sql`
        SELECT df1.name AS faction_a, df2.name AS faction_b,
               SUM(CASE WHEN f.result = 1.0 THEN 1 ELSE 0 END) AS a_wins,
               SUM(CASE WHEN f.result = 0.0 THEN 1 ELSE 0 END) AS b_wins,
               SUM(CASE WHEN f.result = 0.5 THEN 1 ELSE 0 END) AS draws,
               COUNT(*) AS total_games,
               AVG(f.result) AS a_win_rate
        FROM fact_game_results f
        JOIN dim_faction df1 ON f.faction_id = df1.id
        JOIN dim_faction df2 ON f.opponent_faction_id = df2.id
        WHERE f.faction_id < f.opponent_faction_id AND f.opponent_faction_id IS NOT NULL
        GROUP BY f.faction_id, f.opponent_faction_id
        HAVING total_games >= ${input?.minGames ?? 3}
      `)
      return (rows as any[]).map((r) => ({
        factionA: r.faction_a,
        factionB: r.faction_b,
        aWins: r.a_wins,
        bWins: r.b_wins,
        draws: r.draws,
        totalGames: r.total_games,
        aWinRate: r.a_win_rate,
      }))
    }),

  /**
   * Returns all frames in the database joined with their type, plus a
   * hasData flag for the requested granularity. Use this when you want
   * the whole list (e.g. an admin view). For the selector UI, prefer
   * `availableFilters` which packages types + granularities + frames
   * together.
   */
  frames: publicProcedure
    .input(
      z
        .object({
          granularityId: GranularityIdSchema,
          granularity: GranularityNameSchema,
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const granularityId = await resolveGranularityId(ctx, input)
      const frames = await getFramesWithData(ctx.db, granularityId)
      return frames.map((f) => ({
        id: f.id,
        typeId: f.typeId,
        typeName: f.typeName,
        date: f.date,
        endDate: f.endDate,
        month: f.month,
        quarter: f.quarter,
        year: f.year,
        label: f.label,
        hasData: f.hasData,
      }))
    }),

  /**
   * Discovery endpoint for filter UI. Returns the available types,
   * granularities, and per-type frame lists — all derived from the
   * dim tables, no hardcoded ids.
   */
  availableFilters: publicProcedure
    .input(
      z
        .object({
          granularityId: GranularityIdSchema,
          granularity: GranularityNameSchema,
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const granularityId = await resolveGranularityId(ctx, input)
      const [types, granularities, frames] = await Promise.all([
        getFrameTypeSummaries(ctx.db, granularityId),
        getPopulatedGranularities(ctx.db),
        getFramesWithData(ctx.db, granularityId),
      ])

      const framesByType: Record<number, typeof frames> = {}
      for (const f of frames) {
        if (!framesByType[f.typeId]) framesByType[f.typeId] = []
        framesByType[f.typeId].push(f)
      }

      return {
        granularityId,
        types,
        granularities,
        framesByType,
      }
    }),

  windows: publicProcedure
    .input(
      z
        .object({
          granularityId: GranularityIdSchema,
          granularity: GranularityNameSchema,
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const granularityId = await resolveGranularityId(ctx, input)
      const preferredTypeId = await getTypeIdByName(ctx.db, DEFAULT_PREFERRED_TYPE)
      if (preferredTypeId == null) return []

      const rows = await ctx.db.all(sql`
        SELECT DISTINCT mf.id
        FROM meta_for mf
        JOIN meta_top mt ON mt.meta_for_id = mf.id
        WHERE mf.type_id = ${preferredTypeId}
          AND mt.granularity_id = ${granularityId}
        ORDER BY mf.date DESC
      `)
      return (rows as any[]).map((r) => r.id as string)
    }),
})
