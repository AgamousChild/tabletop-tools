import { publicProcedure, router } from '@tabletop-tools/server-core'

import { simulateV2Router } from './simulateV2'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  simulateV2: simulateV2Router,
})

export type AppRouter = typeof appRouter
