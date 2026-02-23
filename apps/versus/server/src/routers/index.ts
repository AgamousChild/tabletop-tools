import { publicProcedure, router } from '../trpc'
import { simulateRouter } from './simulate'
import { unitRouter } from './unit'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  unit: unitRouter,
  simulate: simulateRouter,
})

export type AppRouter = typeof appRouter
