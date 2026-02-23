import { router, publicProcedure } from '../trpc'
import { matchRouter } from './match'
import { turnRouter } from './turn'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  match: matchRouter,
  turn: turnRouter,
})

export type AppRouter = typeof appRouter
