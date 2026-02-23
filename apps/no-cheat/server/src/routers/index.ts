import { publicProcedure, router } from '../trpc'
import { diceSetRouter } from './diceSet'
import { sessionRouter } from './session'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  diceSet: diceSetRouter,
  session: sessionRouter,
})

export type AppRouter = typeof appRouter
