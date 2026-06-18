import {
  type BaseContext,
  createCallerFactory,
  protectedProcedure,
  publicProcedure,
  router,
  type User,
} from '@tabletop-tools/server-core'
import { TRPCError } from '@trpc/server'
import { initTRPC } from '@trpc/server'

/**
 * Minimal Workers AI binding shape. Avoids pulling cloudflare worker types
 * into a package that's consumed by Node tests; `run` is all we exercise.
 */
export interface AiBinding {
  run(
    model: string,
    options: { messages: Array<{ role: string; content: string }>; max_tokens?: number },
  ): Promise<{ response: string }>
}

export type Context = BaseContext & {
  adminEmails: string[]
  bcpScraper?: { fetch(request: Request): Promise<Response> }
  contentIngestor?: { fetch(request: Request): Promise<Response> }
  ai?: AiBinding
}

const t = initTRPC.context<Context>().create()

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  if (!ctx.adminEmails.includes(ctx.user.email)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})

export { createCallerFactory, protectedProcedure, publicProcedure, router, type User }
