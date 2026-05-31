/**
 * Crosswalk validation router — admin endpoints for reviewing and deciding
 * pending re-key candidates produced by the data-import + 11th-ingest pipelines.
 *
 * Approve is transactional: UPDATE content_node_link (or INSERT if first-time),
 * INSERT content_node_link_history, UPDATE candidate. Wrapped in db.transaction;
 * a mid-transaction failure rolls back all three writes.
 *
 * @see docs/superpowers/plans/2026-05-30-step-10-validation-process.md (10d)
 */
import {
  contentEntity,
  contentNodeLink,
  contentNodeLinkCandidate,
  contentNodeLinkHistory,
  dimDataslate,
} from '@tabletop-tools/db'
import { TRPCError } from '@trpc/server'
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

import { adminProcedure, router } from '../trpc.js'

const statusEnum = z.enum(['pending', 'approved', 'rejected', 'llm_unsure', 'overridden'])

// ── Queries ──────────────────────────────────────────────────────────────────

const listPendingInput = z
  .object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
    source: z.string().optional(),
    search: z.string().optional(),
    status: statusEnum.optional().default('pending'),
  })
  .optional()

const byIdInput = z.object({ candidateId: z.string().min(1) })

// ── Mutations ────────────────────────────────────────────────────────────────

const approveInput = z.object({
  candidateId: z.string().min(1),
  note: z.string().optional(),
})

const rejectInput = z.object({
  candidateId: z.string().min(1),
  note: z.string().optional(),
})

const overrideInput = z.object({ candidateId: z.string().min(1) })

const bulkInput = z.object({
  candidateIds: z.array(z.string().min(1)).min(1).max(200),
  confirm: z.literal(true), // explicit confirmation flag for bulk ops
  note: z.string().optional(),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function newUuid(): string {
  // crypto.randomUUID is available in both Workers and Node 19+
  return crypto.randomUUID()
}

// ── Router ───────────────────────────────────────────────────────────────────

export const crosswalkRouter = router({
  listPending: adminProcedure.input(listPendingInput).query(async ({ ctx, input }) => {
    const { page = 1, pageSize = 20, source, search, status = 'pending' } = input ?? {}
    const conditions = [eq(contentNodeLinkCandidate.status, status)]
    if (source) conditions.push(eq(contentNodeLinkCandidate.source, source))
    if (search) {
      conditions.push(sql`(${contentNodeLinkCandidate.brainNodeId} LIKE ${'%' + search + '%'}
        OR ${contentNodeLinkCandidate.proposedCanonicalId} LIKE ${'%' + search + '%'})`)
    }
    const where = conditions.length > 1 ? and(...conditions) : conditions[0]

    const [{ total }] = await ctx.db
      .select({ total: sql<number>`count(*)` })
      .from(contentNodeLinkCandidate)
      .where(where)

    const items = await ctx.db
      .select()
      .from(contentNodeLinkCandidate)
      .where(where)
      .orderBy(desc(contentNodeLinkCandidate.proposedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return { items, total, page, pageSize }
  }),

  candidate: router({
    byId: adminProcedure.input(byIdInput).query(async ({ ctx, input }) => {
      const candidate = (
        await ctx.db
          .select()
          .from(contentNodeLinkCandidate)
          .where(eq(contentNodeLinkCandidate.candidateId, input.candidateId))
          .limit(1)
      )[0]
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'candidate not found' })

      // Current link (if any)
      const currentLink = (
        await ctx.db
          .select()
          .from(contentNodeLink)
          .where(eq(contentNodeLink.brainNodeId, candidate.brainNodeId))
          .limit(1)
      )[0]

      // Both entities + their dataslates (left-join so missing entities don't break the query)
      const proposedEntity = (
        await ctx.db
          .select({
            id: contentEntity.id,
            type: contentEntity.type,
            name: contentEntity.name,
            factionId: contentEntity.factionId,
            dataslateName: dimDataslate.name,
          })
          .from(contentEntity)
          .leftJoin(dimDataslate, eq(contentEntity.dataslateId, dimDataslate.id))
          .where(eq(contentEntity.id, candidate.proposedCanonicalId))
          .limit(1)
      )[0]

      const currentEntity = candidate.priorCanonicalId
        ? (
            await ctx.db
              .select({
                id: contentEntity.id,
                type: contentEntity.type,
                name: contentEntity.name,
                factionId: contentEntity.factionId,
                dataslateName: dimDataslate.name,
              })
              .from(contentEntity)
              .leftJoin(dimDataslate, eq(contentEntity.dataslateId, dimDataslate.id))
              .where(eq(contentEntity.id, candidate.priorCanonicalId))
              .limit(1)
          )[0]
        : null

      return { candidate, currentLink, currentEntity, proposedEntity }
    }),

    /**
     * Transactional approve. Mid-failure rolls back all three writes.
     */
    approve: adminProcedure.input(approveInput).mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx) => {
        const candidate = (
          await tx
            .select()
            .from(contentNodeLinkCandidate)
            .where(eq(contentNodeLinkCandidate.candidateId, input.candidateId))
            .limit(1)
        )[0]
        if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'candidate not found' })
        if (candidate.status !== 'pending' && candidate.status !== 'llm_unsure') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `cannot approve candidate in status '${candidate.status}'`,
          })
        }

        const currentLink = (
          await tx
            .select()
            .from(contentNodeLink)
            .where(eq(contentNodeLink.brainNodeId, candidate.brainNodeId))
            .limit(1)
        )[0]
        const priorCanonicalId = currentLink?.canonicalId ?? null

        const now = new Date()
        const historyId = newUuid()

        // UPDATE in place (or INSERT if no current row for the brain_node yet)
        if (currentLink) {
          await tx
            .update(contentNodeLink)
            .set({
              canonicalId: candidate.proposedCanonicalId,
              matchMethod: candidate.matchMethod,
              confidence: candidate.confidence,
              validationMethod: 'admin',
              validatedBy: ctx.user.email,
              validatedAt: now,
            })
            .where(eq(contentNodeLink.brainNodeId, candidate.brainNodeId))
        } else {
          await tx.insert(contentNodeLink).values({
            brainNodeId: candidate.brainNodeId,
            canonicalId: candidate.proposedCanonicalId,
            matchMethod: candidate.matchMethod,
            confidence: candidate.confidence,
            validationMethod: 'admin',
            validatedBy: ctx.user.email,
            validatedAt: now,
          })
        }

        // INSERT history row (audit log)
        await tx.insert(contentNodeLinkHistory).values({
          historyId,
          brainNodeId: candidate.brainNodeId,
          priorCanonicalId,
          newCanonicalId: candidate.proposedCanonicalId,
          changedAt: now,
          changedBy: ctx.user.email,
          changeMethod: 'admin',
          changeReason: input.note ?? null,
          candidateId: candidate.candidateId,
        })

        // UPDATE candidate to 'approved'
        await tx
          .update(contentNodeLinkCandidate)
          .set({
            status: 'approved',
            decisionMethod: 'admin',
            decidedBy: ctx.user.email,
            decidedAt: now,
            decisionReason: input.note ?? null,
            resultingHistoryId: historyId,
          })
          .where(eq(contentNodeLinkCandidate.candidateId, input.candidateId))

        return { ok: true as const, historyId }
      })
    }),

    reject: adminProcedure.input(rejectInput).mutation(async ({ ctx, input }) => {
      const candidate = (
        await ctx.db
          .select()
          .from(contentNodeLinkCandidate)
          .where(eq(contentNodeLinkCandidate.candidateId, input.candidateId))
          .limit(1)
      )[0]
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'candidate not found' })
      if (
        candidate.status === 'approved' ||
        candidate.status === 'overridden' ||
        candidate.status === 'rejected'
      ) {
        // Idempotent — already in a terminal state. Surface but don't error on repeated reject.
        return { ok: true as const, alreadyDecided: candidate.status }
      }

      await ctx.db
        .update(contentNodeLinkCandidate)
        .set({
          status: 'rejected',
          decisionMethod: 'admin',
          decidedBy: ctx.user.email,
          decidedAt: new Date(),
          decisionReason: input.note ?? null,
        })
        .where(eq(contentNodeLinkCandidate.candidateId, input.candidateId))

      return { ok: true as const, alreadyDecided: null }
    }),

    /**
     * Admin re-opens a previously-rejected pair by flipping it to 'overridden'
     * and inserting a fresh 'pending' candidate row for the same (brain_node,
     * proposed) pair (the partial unique only applies to status='pending').
     */
    override: adminProcedure.input(overrideInput).mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx) => {
        const candidate = (
          await tx
            .select()
            .from(contentNodeLinkCandidate)
            .where(eq(contentNodeLinkCandidate.candidateId, input.candidateId))
            .limit(1)
        )[0]
        if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'candidate not found' })
        if (candidate.status !== 'rejected') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `can only override a rejected candidate (current: '${candidate.status}')`,
          })
        }

        await tx
          .update(contentNodeLinkCandidate)
          .set({ status: 'overridden' })
          .where(eq(contentNodeLinkCandidate.candidateId, input.candidateId))

        const newCandidateId = newUuid()
        await tx.insert(contentNodeLinkCandidate).values({
          candidateId: newCandidateId,
          brainNodeId: candidate.brainNodeId,
          proposedCanonicalId: candidate.proposedCanonicalId,
          matchMethod: candidate.matchMethod,
          confidence: candidate.confidence,
          priorCanonicalId: candidate.priorCanonicalId,
          source: `override:${ctx.user.email}`,
          runId: new Date().toISOString(),
          proposedAt: new Date(),
        })

        return { ok: true as const, newCandidateId }
      })
    }),

    approveBulk: adminProcedure.input(bulkInput).mutation(async ({ ctx, input }) => {
      let approved = 0
      const errors: Array<{ candidateId: string; error: string }> = []
      for (const candidateId of input.candidateIds) {
        try {
          await ctx.db.transaction(async (tx) => {
            const candidate = (
              await tx
                .select()
                .from(contentNodeLinkCandidate)
                .where(eq(contentNodeLinkCandidate.candidateId, candidateId))
                .limit(1)
            )[0]
            if (!candidate) throw new Error('not found')
            if (candidate.status !== 'pending' && candidate.status !== 'llm_unsure') {
              throw new Error(`status '${candidate.status}'`)
            }
            const currentLink = (
              await tx
                .select()
                .from(contentNodeLink)
                .where(eq(contentNodeLink.brainNodeId, candidate.brainNodeId))
                .limit(1)
            )[0]
            const now = new Date()
            const historyId = newUuid()
            if (currentLink) {
              await tx
                .update(contentNodeLink)
                .set({
                  canonicalId: candidate.proposedCanonicalId,
                  matchMethod: candidate.matchMethod,
                  confidence: candidate.confidence,
                  validationMethod: 'admin',
                  validatedBy: ctx.user.email,
                  validatedAt: now,
                })
                .where(eq(contentNodeLink.brainNodeId, candidate.brainNodeId))
            } else {
              await tx.insert(contentNodeLink).values({
                brainNodeId: candidate.brainNodeId,
                canonicalId: candidate.proposedCanonicalId,
                matchMethod: candidate.matchMethod,
                confidence: candidate.confidence,
                validationMethod: 'admin',
                validatedBy: ctx.user.email,
                validatedAt: now,
              })
            }
            await tx.insert(contentNodeLinkHistory).values({
              historyId,
              brainNodeId: candidate.brainNodeId,
              priorCanonicalId: currentLink?.canonicalId ?? null,
              newCanonicalId: candidate.proposedCanonicalId,
              changedAt: now,
              changedBy: ctx.user.email,
              changeMethod: 'admin',
              changeReason: input.note ?? null,
              candidateId: candidate.candidateId,
            })
            await tx
              .update(contentNodeLinkCandidate)
              .set({
                status: 'approved',
                decisionMethod: 'admin',
                decidedBy: ctx.user.email,
                decidedAt: now,
                decisionReason: input.note ?? null,
                resultingHistoryId: historyId,
              })
              .where(eq(contentNodeLinkCandidate.candidateId, candidateId))
          })
          approved++
        } catch (err) {
          errors.push({ candidateId, error: err instanceof Error ? err.message : String(err) })
        }
      }
      return { approved, errors }
    }),

    rejectBulk: adminProcedure.input(bulkInput).mutation(async ({ ctx, input }) => {
      let rejected = 0
      const errors: Array<{ candidateId: string; error: string }> = []
      const now = new Date()
      for (const candidateId of input.candidateIds) {
        try {
          await ctx.db
            .update(contentNodeLinkCandidate)
            .set({
              status: 'rejected',
              decisionMethod: 'admin',
              decidedBy: ctx.user.email,
              decidedAt: now,
              decisionReason: input.note ?? null,
            })
            .where(
              and(
                eq(contentNodeLinkCandidate.candidateId, candidateId),
                inArray(contentNodeLinkCandidate.status, ['pending', 'llm_unsure']),
              ),
            )
          rejected++
        } catch (err) {
          errors.push({ candidateId, error: err instanceof Error ? err.message : String(err) })
        }
      }
      return { rejected, errors }
    }),
  }),

  stats: adminProcedure.query(async ({ ctx }) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [pending] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(contentNodeLinkCandidate)
      .where(eq(contentNodeLinkCandidate.status, 'pending'))

    const [llmUnsure] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(contentNodeLinkCandidate)
      .where(eq(contentNodeLinkCandidate.status, 'llm_unsure'))

    const [approvedRecent] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(contentNodeLinkCandidate)
      .where(
        and(
          eq(contentNodeLinkCandidate.status, 'approved'),
          gt(contentNodeLinkCandidate.decidedAt, sevenDaysAgo),
        ),
      )

    const [rejectedRecent] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(contentNodeLinkCandidate)
      .where(
        and(
          eq(contentNodeLinkCandidate.status, 'rejected'),
          gt(contentNodeLinkCandidate.decidedAt, sevenDaysAgo),
        ),
      )

    const bySourceRows = await ctx.db
      .select({
        source: contentNodeLinkCandidate.source,
        pending: sql<number>`sum(case when status='pending' then 1 else 0 end)`,
        approved: sql<number>`sum(case when status='approved' then 1 else 0 end)`,
        rejected: sql<number>`sum(case when status='rejected' then 1 else 0 end)`,
        llmUnsure: sql<number>`sum(case when status='llm_unsure' then 1 else 0 end)`,
      })
      .from(contentNodeLinkCandidate)
      .groupBy(contentNodeLinkCandidate.source)

    const recentLlmDecisions = await ctx.db
      .select()
      .from(contentNodeLinkCandidate)
      .where(eq(contentNodeLinkCandidate.decisionMethod, 'llm'))
      .orderBy(desc(contentNodeLinkCandidate.decidedAt))
      .limit(20)

    return {
      pending: pending.count,
      llmUnsure: llmUnsure.count,
      approvedRecent: approvedRecent.count,
      rejectedRecent: rejectedRecent.count,
      bySource: bySourceRows,
      recentLlmDecisions,
    }
  }),
})
