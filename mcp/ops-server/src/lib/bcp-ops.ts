/**
 * BCP scraper operations — events + pairings scrape, list-text scrape, pipeline.
 *
 * Every function here is directly callable (importable from anywhere) per
 * project Rule 4 (Everything is a callable function). The MCP tool layer in
 * ../index.ts is a thin wrapper.
 *
 * Pipeline sequence (events → lists → parse):
 *   1. bcpScrapeEvents()   — fetch events + pairings via BCP API → meta_events / meta_event_players
 *   2. bcpScrapeLists()    — fetch army list text via BCP API → meta_event_players.list_text
 *   3. bcpPipelineFull()   — convenience: scrape events → scrape lists
 *
 * Env vars required:
 *   TURSO_DB_URL, TURSO_AUTH_TOKEN — Turso connection (from repo-root .env)
 *   BCP_EMAIL, BCP_PASSWORD        — BCP Cognito credentials (required for both
 *                                    events scrape AND list-text fetch — the list
 *                                    REST API returns 403 without a valid Bearer token)
 */
import { join } from 'node:path'

import { REPO_ROOT, runCmd, type RunResult } from './util.js'

export const BCP_SCRAPER_DIR = join(REPO_ROOT, 'apps', 'bcp-scraper', 'server')

// ── Events + pairings scrape ────────────────────────────────────────────────

export interface BcpScrapeEventsResult extends RunResult {
  /** Parsed from stdout if present */
  eventsScraped?: number
  pairingsScraped?: number
}

/**
 * Run a BCP events + pairings scrape via scripts/run-scrape.ts.
 *
 * The underlying runScrape() targets a rolling 7-day window. For arbitrary
 * date-range backfill (e.g. Jun–Jul), use the scrape-jun-jul.ts pattern directly.
 * Requires BCP_EMAIL and BCP_PASSWORD in the environment.
 */
export async function bcpScrapeEvents(): Promise<BcpScrapeEventsResult> {
  const result = await runCmd('npx', ['tsx', 'scripts/run-scrape.ts'], {
    cwd: BCP_SCRAPER_DIR,
    timeoutMs: 30 * 60 * 1000,
    tailLines: 80,
    env: { NODE_OPTIONS: '--dns-result-order=ipv4first' },
  })

  const eventsMatch = result.stdout.match(/events_scraped[=:]\s*(\d+)/i)
  const pairingsMatch = result.stdout.match(/pairings_scraped[=:]\s*(\d+)/i)

  return {
    ...result,
    eventsScraped: eventsMatch ? parseInt(eventsMatch[1]!) : undefined,
    pairingsScraped: pairingsMatch ? parseInt(pairingsMatch[1]!) : undefined,
  }
}

// ── List-text scrape ────────────────────────────────────────────────────────

export interface BcpScrapeListsResult extends RunResult {
  /** Parsed from stdout: number of lists successfully fetched */
  fetched?: number
  /** Parsed from stdout: rows skipped (player submitted no list, or already fetched) */
  skipped?: number
  /** Parsed from stdout: fetch errors */
  errors?: number
}

/**
 * Fetch army list text for meta_event_players rows with source_list_id set
 * but no list_text yet.
 *
 * Scope with since/until (ISO date strings, e.g. "2026-06-01") or eventId.
 * Idempotent: skips rows where list_text is already populated.
 *
 * Requires: TURSO_DB_URL, TURSO_AUTH_TOKEN, BCP_EMAIL, BCP_PASSWORD.
 * The list endpoint (GET /v1/armylists/{id}) DOES require a Cognito Bearer
 * token — it answers 403 without one. Verified 2026-07-28.
 *
 * Prerequisite: migration 0014_bcp_source_list_id.sql must have run (adds
 * source_list_id column to meta_event_players). The script self-checks.
 */
export async function bcpScrapeLists(
  opts: {
    since?: string
    until?: string
    eventId?: string
  } = {},
): Promise<BcpScrapeListsResult> {
  const args: string[] = ['tsx', 'scripts/scrape-lists.ts']
  if (opts.since) args.push('--since', opts.since)
  if (opts.until) args.push('--until', opts.until)
  if (opts.eventId) args.push('--event-id', opts.eventId)

  const result = await runCmd('npx', args, {
    cwd: BCP_SCRAPER_DIR,
    timeoutMs: 30 * 60 * 1000,
    tailLines: 80,
    env: { NODE_OPTIONS: '--dns-result-order=ipv4first' },
  })

  // Parse summary from stdout: "Fetched: N, skipped (no list): N, failed: N"
  const fetchedMatch = result.stdout.match(/Fetched:\s*(\d+)/)
  const skippedMatch = result.stdout.match(/skipped[^:]*:\s*(\d+)/)
  const errorsMatch = result.stdout.match(/failed:\s*(\d+)/)

  return {
    ...result,
    fetched: fetchedMatch ? parseInt(fetchedMatch[1]!) : undefined,
    skipped: skippedMatch ? parseInt(skippedMatch[1]!) : undefined,
    errors: errorsMatch ? parseInt(errorsMatch[1]!) : undefined,
  }
}

// ── List parse (list_text → list_ttt) ───────────────────────────────────────

export interface BcpParseListsResult extends RunResult {
  parsed?: number
  partial?: number
  failed?: number
}

/**
 * Parse fetched list_text into the structured list_ttt blob.
 *
 * Chunked at 100 rows per underlying call (Worker CPU budget, Rule 9); the
 * CLI loops until the queue drains. Only touches rows with list_text and no
 * list_ttt, from events after the parser's hardcoded 2026-01-01 floor.
 *
 * retryFailed clears list_ttt on rows whose stored parse failed so they are
 * re-attempted — use after a parser change, not routinely.
 *
 * Requires: TURSO_DB_URL, TURSO_AUTH_TOKEN. No BCP credentials.
 */
export async function bcpParseLists(
  opts: { retryFailed?: boolean } = {},
): Promise<BcpParseListsResult> {
  const args: string[] = ['tsx', 'scripts/parse-lists.ts']
  if (opts.retryFailed) args.push('--retry-failed')

  const result = await runCmd('npx', args, {
    cwd: BCP_SCRAPER_DIR,
    timeoutMs: 60 * 60 * 1000,
    tailLines: 60,
    env: { NODE_OPTIONS: '--dns-result-order=ipv4first' },
  })

  // "parsed=N partial=N failed=N skipped=N"
  const m = result.stdout.match(/parsed=(\d+)\s+partial=(\d+)\s+failed=(\d+)/)
  return {
    ...result,
    parsed: m ? parseInt(m[1]!) : undefined,
    partial: m ? parseInt(m[2]!) : undefined,
    failed: m ? parseInt(m[3]!) : undefined,
  }
}

// ── Detachment backfill (list_ttt → detachment_id → cube) ───────────────────

export interface BcpBackfillDetachmentsResult extends RunResult {
  updated?: number
  eventsTouched?: number
  unresolved?: number
}

/**
 * Populate meta_event_players.detachment_id from the parsed list blob, then
 * rebuild the cube for the events touched.
 *
 * This is the bridge between the list pipeline and analytics: the cube reads
 * detachment_id, the parser only ever wrote list_ttt, so without this step
 * fact_game_results carries no detachment at all no matter how many lists
 * were scraped.
 *
 * The cube rebuild is not optional bookkeeping — skipping it leaves
 * fact_game_results serving the pre-backfill NULLs.
 *
 * Requires: TURSO_DB_URL, TURSO_AUTH_TOKEN. No BCP credentials.
 */
export async function bcpBackfillDetachments(
  opts: { since?: string; until?: string; dryRun?: boolean; skipCube?: boolean } = {},
): Promise<BcpBackfillDetachmentsResult> {
  const args: string[] = ['tsx', 'scripts/backfill-detachments.ts']
  if (opts.since) args.push('--since', opts.since)
  if (opts.until) args.push('--until', opts.until)
  if (opts.dryRun) args.push('--dry-run')
  if (opts.skipCube) args.push('--skip-cube')

  const result = await runCmd('npx', args, {
    cwd: BCP_SCRAPER_DIR,
    timeoutMs: 60 * 60 * 1000,
    tailLines: 60,
    env: { NODE_OPTIONS: '--dns-result-order=ipv4first' },
  })

  const updated = result.stdout.match(/updated=(\d+)/)
  const events = result.stdout.match(/events touched:\s*(\d+)/)
  const unresolved = result.stdout.match(/unresolved:\s*(\d+)\s+rows/)

  return {
    ...result,
    updated: updated ? parseInt(updated[1]!) : undefined,
    eventsTouched: events ? parseInt(events[1]!) : undefined,
    unresolved: unresolved ? parseInt(unresolved[1]!) : undefined,
  }
}

// ── Full pipeline ───────────────────────────────────────────────────────────

export interface BcpPipelineFullResult {
  events: BcpScrapeEventsResult
  lists?: BcpScrapeListsResult
  parse?: BcpParseListsResult
  detachments?: BcpBackfillDetachmentsResult
  totalDurationMs: number
}

/**
 * The whole pipeline, in the order the data depends on:
 *
 *   1. bcpScrapeEvents()       events + pairings  → meta_events, meta_event_players,
 *                              meta_pairings, and source_list_id
 *   2. bcpScrapeLists()        army list text     → list_text
 *   3. bcpParseLists()         structured parse   → list_ttt
 *   4. bcpBackfillDetachments() detachment + cube → detachment_id, fact_game_results
 *
 * Each step feeds the next, so running a prefix leaves the tail stale rather
 * than merely incomplete: stopping after 2 means the lists are unparsed;
 * stopping after 3 means the cube still reports no detachments at all.
 *
 * Every step is idempotent — safe to re-run after an interruption.
 * Steps 1 and 2 short-circuit rather than abort on non-zero exit, since
 * partial data from earlier runs is still worth processing.
 *
 * since/until scopes the list-fetch and detachment passes to a date window.
 */
export async function bcpPipelineFull(
  opts: {
    since?: string
    until?: string
    skipLists?: boolean
    skipParse?: boolean
    skipDetachments?: boolean
  } = {},
): Promise<BcpPipelineFullResult> {
  const started = Date.now()

  const events = await bcpScrapeEvents()

  let lists: BcpScrapeListsResult | undefined
  let parse: BcpParseListsResult | undefined
  let detachments: BcpBackfillDetachmentsResult | undefined

  if (!opts.skipLists) {
    lists = await bcpScrapeLists({ since: opts.since, until: opts.until })
  }
  if (!opts.skipParse) {
    parse = await bcpParseLists()
  }
  if (!opts.skipDetachments) {
    detachments = await bcpBackfillDetachments({ since: opts.since, until: opts.until })
  }

  return { events, lists, parse, detachments, totalDurationMs: Date.now() - started }
}
