import { publicProcedure, router } from '@tabletop-tools/server-core'

import { simulateRouter } from './simulate'
import { simulateV2Router } from './simulateV2'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  simulate: simulateRouter,
  simulateV2: simulateV2Router,
})

export type AppRouter = typeof appRouter
