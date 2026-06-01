import { publicProcedure, router } from '../trpc'
import { awardRouter } from './award'
import { bcpRegistrationRouter } from './bcp-registration'
import { cardRouter } from './card'
import { metricRouter } from './metric'
import { passthroughRouter } from './passthrough'
import { playerRouter } from './player'
import { resultRouter } from './result'
import { roundRouter } from './round'
import { tournamentRouter } from './tournament'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  tournament: tournamentRouter,
  player: playerRouter,
  round: roundRouter,
  result: resultRouter,
  card: cardRouter,
  award: awardRouter,
  metric: metricRouter,
  passthrough: passthroughRouter,
  bcpRegistration: bcpRegistrationRouter,
})

export type AppRouter = typeof appRouter
