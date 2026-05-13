# BCP Full 10th Edition Scrape (#36, #47)

## Goal

Scrape ALL 10th edition competitive events from BCP: every GT worldwide + every US RTT with 20+ players. Currently have 155 events (100+ players, 5+ rounds). Need to expand coverage.

## Scope

- **Date range:** June 2023 (10th edition launch) — present
- **GTs worldwide:** 5+ rounds, 100+ players (current filter, just extend dates)
- **US RTTs:** 3+ rounds, 20+ players (new filter, US-only)

## Plan

### Step 1: Estimate event count

Run BCP event search with expanded filters to count total events. Don't scrape — just count.

### Step 2: Update scan-all-events.ts

- Add a `--min-players` and `--min-rounds` flag
- Add a `--country` flag for US-only RTT filter
- Run two scans: one for GTs (existing), one for US RTTs (new)
- Merge into events.json, dedup by source_id
- GT filter takes precedence over RTT for duplicate events (same event should be classified as GT)

### Step 3: Scrape dates for new events

Run scrape-dates.ts on any events without dates. Same Overview tab approach that works.

### Step 4: Scrape pairings for new events

Run scrape-pairings-standalone.ts. Existing events are cached/skipped.

Rate limit backoff: 2s between pages, 5s between events, exponential backoff on 429/timeout.

### Step 5: Scrape army lists for new events

Run scrape-lists.ts. Same approach — visit each list URL, extract text.

Rate limit backoff: 2s between pages, 5s between events, exponential backoff on 429/timeout.

### Step 6: Import to 3NF + rebuild cube

Run seed-dimensions, import-3nf, build-cube against Turso.

Before import: Turso storage check. If list text volume exceeds 100MB, store army lists in R2 instead of Turso.

## Time estimate

- Step 1-2: 30 min
- Step 3: 1-2 hours (automated, depends on event count)
- Step 4: 4-8 hours (automated, ~30s per event)
- Step 5: 2-5 days wall clock (automated, ~2.5s per list)
- Step 6: 30 min

Total: mostly automated, runs over multiple days.

## Risk

- BCP rate limiting on high volume — mitigated by rate limit backoff strategy
- US RTT filter may return thousands of small events
- Storage: army list text could be 500MB+ for thousands of events — use R2 if over 100MB
