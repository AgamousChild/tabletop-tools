import { router, publicProcedure } from '../trpc'
import { tournamentRouter } from './tournament'
import { playerRouter } from './player'
import { roundRouter } from './round'
import { resultRouter } from './result'
import { eloRouter } from './elo'
import { cardRouter } from './card'
import { awardRouter } from './award'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  tournament: tournamentRouter,
  player: playerRouter,
  round: roundRouter,
  result: resultRouter,
  elo: eloRouter,
  card: cardRouter,
  award: awardRouter,
})

export type AppRouter = typeof appRouter
