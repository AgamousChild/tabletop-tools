import { missionGameState, scoringMission } from '@tabletop-tools/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { publicProcedure, router } from '../trpc'

export const missionRouter = router({
  listPrimaries: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(scoringMission).where(eq(scoringMission.kind, 'primary')),
  ),

  listSecondaries: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(scoringMission).where(eq(scoringMission.kind, 'secondary')),
  ),

  getGameStates: publicProcedure
    .input(z.object({ missionId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(missionGameState)
        .where(eq(missionGameState.scoringMissionId, input.missionId)),
    ),
})
