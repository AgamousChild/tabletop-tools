import { router, publicProcedure } from '../trpc'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
})

export type AppRouter = typeof appRouter
