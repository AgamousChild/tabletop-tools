import { publicProcedure, router } from '../trpc'
import { diceSetRouter } from './diceSet'
import { sessionRouter } from './session'
import { visionRouter } from './vision'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  diceSet: diceSetRouter,
  session: sessionRouter,
  vision: visionRouter,
})

export type AppRouter = typeof appRouter
