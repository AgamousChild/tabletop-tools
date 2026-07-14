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
  /**
   * Shared Bearer token used when admin invokes the bcp-scraper /
   * content-ingestor service bindings. Must match the SYNC_SECRET set
   * on each of those workers, or their fail-closed checkAuth rejects.
   * Optional so router-level tests (which construct a bare context)
   * still compile; the router helper below skips the header when unset.
   */
  syncSecret?: string
}

/**
 * Build headers for a service-binding fetch, adding the Bearer token
 * whenever syncSecret is available. Prefer this over hand-rolling the
 * header at every call site so a future rotation is one edit. Every
 * admin-router call to bcp-scraper or content-ingestor threads through
 * this helper; the target workers fail closed when SYNC_SECRET is unset.
 */
export function serviceHeaders(syncSecret: string | undefined, extra?: HeadersInit): Headers {
  const headers = new Headers(extra ?? {})
  if (syncSecret) headers.set('Authorization', `Bearer ${syncSecret}`)
  return headers
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
