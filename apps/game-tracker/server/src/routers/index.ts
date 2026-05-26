import { publicProcedure, router } from '../trpc'
import { matchRouter } from './match'
import { secondaryRouter } from './secondary'
import { turnRouter } from './turn'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  match: matchRouter,
  turn: turnRouter,
  secondary: secondaryRouter,
})

export type AppRouter = typeof appRouter
