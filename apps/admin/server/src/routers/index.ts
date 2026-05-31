import { publicProcedure, router } from '../trpc.js'
import { crosswalkRouter } from './crosswalk.js'
import { statsRouter } from './stats.js'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  stats: statsRouter,
  crosswalk: crosswalkRouter,
})

export type AppRouter = typeof appRouter
