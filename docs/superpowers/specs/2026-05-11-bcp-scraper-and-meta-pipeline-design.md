# BCP Scraper & Meta Pipeline — Design Spec

## Overview

Two Cloudflare Workers that automate the BCP tournament data pipeline:

1. **BCP Scraper Worker** — Discovers new GT events weekly, pulls pairings/lists/scores via BCP's REST API, writes raw data to Turso.
2. **Meta Pipeline Worker** — Transforms raw scraped data into the analytics cube. Triggered automatically by the scraper, or manually via admin.

Both are visible in the admin dashboard with status, history, and "Run Now" buttons.

---

## Tool 1: BCP Scraper Worker

### Schedule

Cron trigger: **Monday 4am UTC**, weekly.

### What it does on each run

1. **Authenticate** — Call AWS Cognito `InitiateAuth` with stored BCP credentials to get a fresh Bearer token.
2. **Discover events** — Call BCP event search API for 40K GT events (20+ players) that ended in the last 7 days. Filter: `gameSystemId=WGMSzfKFYA`, `numberOfPlayers=20`, `numberOfRounds=5`.
3. **Deduplicate** — Check each event ID against `bcp_events` table in Turso. Skip any already scraped.
4. **Scrape each new event:**
   - `GET /v2/events/{id}` — Event details (name, dates, location, GPS, rounds, player count, format). Public, no auth needed.
   - `GET /v1/events/{id}/pairings?round=N` — For each round: player names, factions, scores, results, list IDs. Requires auth.
   - Army list text — via list endpoint using list IDs from pairings. Requires auth.
5. **Write to Turso** — Insert event, pairings, player records, and list text into database tables.
6. **Log the run** — Write a job record with timestamp, events found, events scraped, errors.
7. **Trigger Meta Pipeline Worker** — via service binding or HTTP call.

### BCP API Endpoints (discovered today)

| Endpoint | Auth | Returns |
|---|---|---|
| `GET newprod-api.bestcoastpairings.com/v2/events/{id}` | No | Full event details, dates, location with GPS, player counts, round count, format |
| `GET newprod-api.bestcoastpairings.com/v1/events/{id}/pairings?round=N` | Yes | All pairings for a round — player names, factions, scores, W/L/D, list IDs |
| `GET newprod-api.bestcoastpairings.com/v1/events?gameSystemId=...&startDate=...&endDate=...` | Yes | Event search/discovery |

### BCP Authentication

BCP uses AWS Cognito (us-east-1). Auth flow:

1. Worker stores `BCP_EMAIL` and `BCP_PASSWORD` as encrypted secrets.
2. On each run, call Cognito `InitiateAuth` (USER_PASSWORD_AUTH flow) with client ID `5083iih0nitpn5enl02fkpr9bc`.
3. Receive access token (JWT, 1hr expiry). Use as `Authorization: Bearer {token}` with headers `client-id: web-app`, `env: bcp`.
4. Token only needs to last the duration of the run (~minutes).

### Worker Secrets

- `BCP_EMAIL` — BCP account email
- `BCP_PASSWORD` — BCP account password
- `TURSO_DB_URL` — Shared database
- `TURSO_AUTH_TOKEN` — Database auth

### Deduplication

Every scraped event ID is stored in `bcp_events` table. Before processing, check:
```sql
SELECT id FROM bcp_events WHERE bcp_event_id = ?
```
If exists, skip. BCP event IDs are stable and unique.

---

## Tool 2: Meta Pipeline Worker

### Trigger

- Automatically called by the Scraper Worker after it completes.
- Also has a "Run Now" button in admin.
- Also has its own cron trigger (Monday 5am UTC) as a fallback.

### What it does

Runs the existing meta pipeline logic, ported from local CLI scripts:

1. **3NF Import** (`import-3nf.ts` logic) — Read raw scraped data from Turso, populate `meta_events`, `meta_event_players`, `meta_pairings`.
2. **Detachment Extraction** (`extract-detachments.ts` logic) — Parse army list text to extract detachment assignments.
3. **Build Cube** (`build-cube.ts` logic) — Build `meta_for` frames, `fact_game_results`, `meta_top` pre-aggregated rollup.
4. **Update status** — Write completion timestamp to `meta_cube_status`.

---

## Database Tables

### New tables for scraper infrastructure

```sql
-- Raw scraped event data
CREATE TABLE bcp_events (
  id TEXT PRIMARY KEY,
  bcp_event_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  date TEXT,
  end_date TEXT,
  location TEXT,
  latitude REAL,
  longitude REAL,
  player_count INTEGER,
  round_count INTEGER,
  format TEXT,
  scraped_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Scrape job history
CREATE TABLE bcp_scrape_jobs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
  events_found INTEGER DEFAULT 0,
  events_scraped INTEGER DEFAULT 0,
  errors TEXT, -- JSON array of error messages
  triggered_by TEXT NOT NULL DEFAULT 'cron' -- cron, manual
);
```

Pairings, player records, and list text go into the existing `meta_events`, `meta_event_players`, `meta_pairings` tables (the 3NF schema already exists).

---

## Admin Dashboard

### New page: "BCP Scraper"

Shows:
- **Last run** — timestamp, status, events found/scraped
- **Run history** — table of past jobs with status, counts, errors
- **"Run Now" button** — triggers the scraper immediately
- **"Rebuild Cube" button** — triggers the meta pipeline independently

### New endpoints on admin router

```
stats.bcpScraperStatus() — latest job + summary stats
stats.bcpScraperHistory({ limit }) — past N jobs
stats.triggerBcpScrape() — mutation, kicks off scraper
stats.triggerMetaPipeline() — mutation, kicks off cube rebuild
```

---

## Worker Architecture

### BCP Scraper Worker (`apps/bcp-scraper/server/`)

```
apps/bcp-scraper/
  server/
    src/
      worker.ts        — Cloudflare Worker entry, cron handler
      bcp-api.ts       — BCP REST API client (auth + endpoints)
      cognito.ts       — AWS Cognito authentication
      scrape.ts        — Main scrape logic (discover, fetch, store)
      wrangler.toml    — Cron trigger, secrets, service bindings
```

### Meta Pipeline Worker

Could be a separate Worker or a route on the BCP Scraper Worker. Runs the 3NF import, detachment extraction, and cube build logic.

### Service Bindings

- Admin Worker calls Scraper Worker to trigger "Run Now"
- Scraper Worker calls Meta Pipeline after completion

---

## Porting from Existing Code

| Existing file (content-ingestor) | New location | Changes |
|---|---|---|
| `event-list.ts` (Playwright) | `bcp-api.ts` | Replace browser scraping with `fetch()` to BCP REST API |
| `scrape-pairings-standalone.ts` (Playwright) | `scrape.ts` | Replace browser scraping with `fetch()` to pairings API |
| `scrape-lists.ts` (Playwright) | `scrape.ts` | Replace browser scraping with `fetch()` to list API |
| `scrape-dates.ts` (Playwright) | Not needed | Event details API returns dates directly |
| `import-3nf.ts` | Meta pipeline Worker | Port from CLI script to Worker function |
| `extract-detachments.ts` | Meta pipeline Worker | Port from CLI script to Worker function |
| `build-cube.ts` | Meta pipeline Worker | Port from CLI script to Worker function |

---

## What Micah provides

- BCP email and password (stored as Cloudflare Worker secrets via `wrangler secret put`)
- That's it
