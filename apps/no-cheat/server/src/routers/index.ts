import { publicProcedure, router } from '../trpc'
import { diceSetRouter } from './diceSet'
import { sessionRouter } from './session'
import { trainingRouter } from './training'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  diceSet: diceSetRouter,
  session: sessionRouter,
  training: trainingRouter,
})

export type AppRouter = typeof appRouter
