import { router, publicProcedure } from '@tabletop-tools/server-core'
import { ratingRouter } from './rating'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  rating: ratingRouter,
})

export type AppRouter = typeof appRouter
