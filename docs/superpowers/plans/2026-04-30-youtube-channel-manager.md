# YouTube Channel Manager (#48)

## Goal

Admin UI tool where Micah pastes a YouTube channel URL, it enters a processing queue, and a background service continuously fetches transcripts → extracts knowledge → auto-reviews → commits to brain. Runs 24/7.

## Architecture

```
Admin UI (paste URL)
  → Turso: channel_queue table
  → Local cron/service polls queue
  → For each channel:
      1. yt-dlp: list videos, fetch transcripts
      2. Ollama: extract knowledge nodes
      3. Gemma 2: auto-review
      4. Commit approved → brain community.json
      5. Rebuild brain graph + upload to R2
```

### Why local, not Worker

- yt-dlp runs locally (not available on CF Workers)
- Ollama runs locally (GPU)
- Playwright runs locally (for any web scraping)
- The Worker can't do any of this

### Option A: Turso-backed queue + local daemon

Admin UI writes to a `channel_queue` table in Turso. A local Node process polls every 5 minutes, picks up new channels, processes them.

**Pros:** Simple, queue survives restarts, admin UI shows status from DB
**Cons:** Need to keep a local process running (pm2, systemd, or Windows Task Scheduler)

### Option B: Claude Code routine

Set up a Claude Code routine that runs on a schedule, checks for new channels in a file/DB, processes them.

**Pros:** Uses existing Claude Code infra
**Cons:** Routine API still flaky, can't run truly 24/7

### Option C: Local HTTP server

Tiny Express server on localhost:9999 with endpoints:
- POST /run/rebuild-cube
- POST /run/rebuild-brain
- POST /run/scrape-events

Admin UI calls localhost:9999 when on the local network.

**Pros:** UI-triggered, runs locally
**Cons:** Only works from local network, security considerations

### Recommendation: Option A

## Schema

```sql
CREATE TABLE channel_queue (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  name TEXT,                    -- display name (populated after first scan)
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/scanning/processing/reviewing/done/error/failed
  videos_total INTEGER,
  videos_processed INTEGER DEFAULT 0,
  nodes_extracted INTEGER DEFAULT 0,
  nodes_approved INTEGER DEFAULT 0,
  nodes_rejected INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  added_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  error TEXT
);
```

## Admin UI

**Channel Manager page:**
- Text input: paste YouTube channel URL, click "Add"
- Table showing all channels: Name, URL, Status (badge), Videos, Nodes Extracted, Approved, Rejected, Added date
- Status badges: Pending (gray), Scanning (blue), Processing (amber), Reviewing (purple), Done (green), Error (red), Failed (black — max retries exceeded)
- Per-video progress tracking within each channel row (expandable: shows each video with its own status, nodes extracted, approved/rejected counts)

## Auto-Review Acceptance Criteria

Nodes are **approved** when: no hallucinated rules, correct faction attribution, actionable tactical content.

Nodes are **rejected** when: hallucinated mechanics, wrong edition content, non-tactical content (news, lore-only, unboxing).

## Local Daemon

`apps/content-ingestor/src/daemon.ts`

```
while (true) {
  1. Query channel_queue for status='pending' or (status='error' AND retry_count < 3)
  2. If retry_count >= 3, mark status='failed' and skip
  3. Pick oldest eligible channel
  4. Set status='scanning', run yt-dlp to list videos + fetch transcripts
  5. Set status='processing', run Ollama extraction on each transcript
  6. Set status='reviewing', run Gemma 2 auto-review
  7. Commit approved nodes to brain
  8. Rebuild brain + upload to R2
  9. Set status='done' with counts
  10. Sleep 5 minutes, repeat
}
```

Max retry count: 3 per channel before marking permanently failed (status='failed').

Run with: `pm2 start npx -- tsx src/daemon.ts` or Windows Task Scheduler.

## Estimated effort

- Schema + admin UI page: 1 hour
- Local daemon: 2 hours (mostly wiring existing CLI commands)
- Testing: 1 hour

## Needs

- Micah to keep local machine running (or set up as a service)
- Ollama running locally with Llama 3.1 8B + Gemma 2 9B
