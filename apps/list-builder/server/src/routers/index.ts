import { publicProcedure, router } from '@tabletop-tools/server-core'

import { listRouter } from './list'
import { listV2Router } from './list-v2'
import { ratingRouter } from './rating'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  rating: ratingRouter,
  list: listRouter,
  listV2: listV2Router,
})

export type AppRouter = typeof appRouter
