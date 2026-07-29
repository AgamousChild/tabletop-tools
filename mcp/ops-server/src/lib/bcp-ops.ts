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
 * but no list_text yet. Uses BCP's public REST API — no auth required.
 *
 * Scope with since/until (ISO date strings, e.g. "2026-06-01") or eventId.
 * Idempotent: skips rows where list_text is already populated.
 *
 * Requires: TURSO_DB_URL, TURSO_AUTH_TOKEN (from repo-root .env)
 * Does NOT require BCP credentials.
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

// ── Full pipeline ───────────────────────────────────────────────────────────

export interface BcpPipelineFullResult {
  events: BcpScrapeEventsResult
  lists?: BcpScrapeListsResult
  totalDurationMs: number
}

/**
 * Convenience: scrape events → scrape lists, in sequence.
 * Short-circuits to lists-only if events exit non-zero (partial data may exist
 * from earlier runs, so lists are still worth attempting).
 *
 * since/until scopes the list-fetch pass to a date window.
 */
export async function bcpPipelineFull(
  opts: {
    since?: string
    until?: string
    skipLists?: boolean
  } = {},
): Promise<BcpPipelineFullResult> {
  const started = Date.now()

  const events = await bcpScrapeEvents()

  let lists: BcpScrapeListsResult | undefined
  if (!opts.skipLists) {
    lists = await bcpScrapeLists({ since: opts.since, until: opts.until })
  }

  return { events, lists, totalDurationMs: Date.now() - started }
}
