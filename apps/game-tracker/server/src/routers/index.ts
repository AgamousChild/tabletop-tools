import { router, publicProcedure } from '../trpc'
import { matchRouter } from './match'
import { turnRouter } from './turn'
import { secondaryRouter } from './secondary'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  match: matchRouter,
  turn: turnRouter,
  secondary: secondaryRouter,
})

export type AppRouter = typeof appRouter
