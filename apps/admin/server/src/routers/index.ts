import { router, publicProcedure } from '../trpc.js'
import { statsRouter } from './stats.js'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  stats: statsRouter,
})

export type AppRouter = typeof appRouter
