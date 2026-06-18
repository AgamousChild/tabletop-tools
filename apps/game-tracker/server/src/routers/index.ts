import { publicProcedure, router } from '../trpc'
import { matchRouter } from './match'
import { matchV2Router } from './matchV2'
import { missionRouter } from './mission'
import { secondaryRouter } from './secondary'
import { turnRouter } from './turn'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  match: matchRouter,
  matchV2: matchV2Router,
  mission: missionRouter,
  turn: turnRouter,
  secondary: secondaryRouter,
})

export type AppRouter = typeof appRouter
