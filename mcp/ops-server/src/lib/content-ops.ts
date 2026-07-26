/**
 * Content-ingestor pipeline operations — discover, queue, process, commit.
 *
 * The end-to-end path from "new video posted" to "brain has the knowledge":
 *   1. contentDiscover()      — GH Actions cron does this daily 06:00 UTC.
 *                               Only run manually if catching up. Adds rows to
 *                               pipeline_item with status='discovered'.
 *   2. contentQueueNewest(n)  — promotes N discovered → queued.
 *   3. contentProcess(n)      — for each queued item, fetches transcript +
 *                               runs LLM extraction (Ollama), writes drafts
 *                               under apps/content-ingestor/.local/drafts/.
 *                               Sets status='done'.
 *   4. contentCommit()        — reads all drafts, dedupes, writes
 *                               apps/brain/server/src/data/community.json.
 *   5. brain rebuild + deploy — see brain-ops.ts.
 *
 * `contentPipelineStatus()` shows current queue counts — always start with
 * that when investigating "why aren't community nodes updating".
 */
import { join } from 'node:path'

import { type Client, createClient } from '@libsql/client'

import { ensureRepoEnv, REPO_ROOT, runCmd, type RunResult } from './util.js'

export const CONTENT_INGESTOR_DIR = join(REPO_ROOT, 'apps', 'content-ingestor')

let cachedClient: Client | null = null

function getTursoClient(): Client {
  if (cachedClient) return cachedClient
  ensureRepoEnv()
  const url = process.env.TURSO_DB_URL
  const token = process.env.TURSO_AUTH_TOKEN
  if (!url || !token) {
    throw new Error('TURSO_DB_URL and TURSO_AUTH_TOKEN required (from repo-root .env)')
  }
  cachedClient = createClient({ url, authToken: token })
  return cachedClient
}

// ── Pipeline status ─────────────────────────────────────────────────────────

export interface PipelineStatus {
  totalsByStatus: Array<{ status: string; count: number }>
  recentDrafts: number
  latestRuns: Array<{
    id: string
    pipeline: string
    startedAt: string
    status: string
    processed: number
    failed: number
  }>
}

/**
 * Snapshot of the content-ingestor queue. If you're wondering "what's stuck?"
 * or "why is community.json not growing?" — run this first.
 */
export async function contentPipelineStatus(): Promise<PipelineStatus> {
  const db = getTursoClient()
  const [statusRows, runRows, draftRows] = await Promise.all([
    db.execute('SELECT status, COUNT(*) as n FROM pipeline_item GROUP BY status'),
    db.execute(
      'SELECT id, pipeline, started_at, status, processed, failed FROM pipeline_run ORDER BY started_at DESC LIMIT 5',
    ),
    db.execute(
      "SELECT COUNT(*) as n FROM pipeline_item WHERE status = 'done' AND finished_at IS NOT NULL",
    ),
  ])

  return {
    totalsByStatus: statusRows.rows.map((r) => ({
      status: String(r.status ?? '?'),
      count: Number(r.n ?? 0),
    })),
    recentDrafts: Number(draftRows.rows[0]?.n ?? 0),
    latestRuns: runRows.rows.map((r) => ({
      id: String(r.id ?? ''),
      pipeline: String(r.pipeline ?? ''),
      startedAt: String(r.started_at ?? ''),
      status: String(r.status ?? ''),
      processed: Number(r.processed ?? 0),
      failed: Number(r.failed ?? 0),
    })),
  }
}

// ── Discover ────────────────────────────────────────────────────────────────

export async function contentDiscover(): Promise<RunResult> {
  return await runCmd('npx', ['tsx', 'src/discover.ts'], {
    cwd: CONTENT_INGESTOR_DIR,
    timeoutMs: 15 * 60 * 1000,
    tailLines: 40,
  })
}

// ── Queue promotion ─────────────────────────────────────────────────────────

export async function contentQueueNewest(n: number): Promise<RunResult> {
  return await runCmd('npx', ['tsx', 'src/queue-newest.ts', String(n)], {
    cwd: CONTENT_INGESTOR_DIR,
    timeoutMs: 5 * 60 * 1000,
    tailLines: 40,
  })
}

// ── Process ─────────────────────────────────────────────────────────────────

export async function contentProcess(n: number): Promise<RunResult> {
  return await runCmd('npx', ['tsx', 'src/process-queue.ts', String(n)], {
    cwd: CONTENT_INGESTOR_DIR,
    timeoutMs: 60 * 60 * 1000,
    tailLines: 80,
  })
}

// ── Commit ──────────────────────────────────────────────────────────────────

export async function contentCommit(): Promise<RunResult> {
  return await runCmd('npx', ['tsx', 'src/cli.ts', 'commit'], {
    cwd: CONTENT_INGESTOR_DIR,
    timeoutMs: 10 * 60 * 1000,
    tailLines: 40,
  })
}

// ── Full cycle ──────────────────────────────────────────────────────────────

export interface FullCycleResult {
  queue?: RunResult
  process?: RunResult
  commit?: RunResult
  totalDurationMs: number
}

export async function contentFullCycle(n: number): Promise<FullCycleResult> {
  const started = Date.now()
  const queue = await contentQueueNewest(n)
  const process_ = await contentProcess(n)
  const commit = await contentCommit()
  return {
    queue,
    process: process_,
    commit,
    totalDurationMs: Date.now() - started,
  }
}
