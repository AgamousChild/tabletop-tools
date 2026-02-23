import { router, publicProcedure } from '../trpc'
import { tournamentRouter } from './tournament'
import { playerRouter } from './player'
import { roundRouter } from './round'
import { resultRouter } from './result'
import { eloRouter } from './elo'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  tournament: tournamentRouter,
  player: playerRouter,
  round: roundRouter,
  result: resultRouter,
  elo: eloRouter,
})

export type AppRouter = typeof appRouter
