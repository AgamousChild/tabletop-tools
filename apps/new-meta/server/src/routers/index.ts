import { router, publicProcedure } from '../trpc.js'
import { metaRouter } from './meta.js'
import { playerRouter } from './player.js'
import { sourceRouter } from './source.js'
import { adminRouter } from './admin.js'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  meta: metaRouter,
  player: playerRouter,
  source: sourceRouter,
  admin: adminRouter,
})

export type AppRouter = typeof appRouter
