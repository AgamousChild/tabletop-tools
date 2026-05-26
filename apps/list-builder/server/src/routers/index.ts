import { publicProcedure, router } from '@tabletop-tools/server-core'

import { listRouter } from './list'
import { ratingRouter } from './rating'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  rating: ratingRouter,
  list: listRouter,
})

export type AppRouter = typeof appRouter
