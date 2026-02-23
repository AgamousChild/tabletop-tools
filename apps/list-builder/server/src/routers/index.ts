import { router, publicProcedure } from '../trpc'
import { unitRouter } from './unit'
import { listRouter } from './list'
import { ratingRouter } from './rating'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  unit: unitRouter,
  list: listRouter,
  rating: ratingRouter,
})

export type AppRouter = typeof appRouter
