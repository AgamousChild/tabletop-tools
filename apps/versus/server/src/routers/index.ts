import { publicProcedure, router } from '@tabletop-tools/server-core'
import { simulateRouter } from './simulate'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  simulate: simulateRouter,
})

export type AppRouter = typeof appRouter
