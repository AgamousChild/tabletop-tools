import { router, publicProcedure } from '@tabletop-tools/server-core'
import { ratingRouter } from './rating'
import { listRouter } from './list'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  rating: ratingRouter,
  list: listRouter,
})

export type AppRouter = typeof appRouter
