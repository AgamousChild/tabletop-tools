# Ingest Content Queue — Design Spec

## Overview

Replace the manual "paste a URL" ingest workflow with an automated daily pipeline. A cron trigger crawls all active sources, discovers new content URLs, and auto-processes them through the existing ingest pipeline (Gladia transcription for YouTube, HTML extraction for web, Claude Haiku for node extraction, R2 + Vectorize for storage). Sources are managed via the admin UI — add a channel or site URL and the system handles the rest.

---

## Problem

Today the ingest flow has three disconnected parts:

1. **`ingest_jobs` table** — only tracks URLs that were manually submitted via admin UI
2. **`CrawlManifest` JSON files** — local-only, tracks discovered URLs from CLI channel crawls, dies with the dev machine
3. **`SOURCE_NAMES` dropdown** — hardcoded in the admin UI, not data

There's no persistent record of what content exists, what's been ingested, or what's new. The admin has to manually find and paste URLs.

---

## Design

### New table: `ingest_sources`

Sources are data, not code. Add/remove via admin UI or direct INSERT.

```sql
CREATE TABLE ingest_sources (
  id          TEXT PRIMARY KEY,           -- slug: 'auspex-tactics'
  name        TEXT NOT NULL,              -- 'Auspex Tactics'
  url         TEXT NOT NULL UNIQUE,       -- channel/site URL
  type        TEXT NOT NULL,              -- 'youtube' | 'web'
  active      INTEGER NOT NULL DEFAULT 1, -- 1 = crawl daily, 0 = paused
  created_at  INTEGER NOT NULL            -- epoch ms
);
```

Seeded with 4 initial sources:

| id | name | url | type |
|---|---|---|---|
| auspex-tactics | Auspex Tactics | https://www.youtube.com/@AuspexTactics | youtube |
| happy-krumping | Happy Krumping | https://www.youtube.com/@HappyKrumping | youtube |
| warhammer-community | Warhammer Community | https://www.warhammer-community.com/en-gb/ | web |
| goonhammer | Goonhammer | https://www.goonhammer.com/ | web |

### New table: `ingest_content`

Replaces `ingest_jobs`. One row per discovered video/article.

```sql
CREATE TABLE ingest_content (
  id              TEXT PRIMARY KEY,
  url             TEXT NOT NULL UNIQUE,
  title           TEXT,
  source_id       TEXT NOT NULL REFERENCES ingest_sources(id),
  status          TEXT NOT NULL DEFAULT 'discovered',
    -- discovered: found by crawler, not yet processed
    -- transcribing: YouTube video sent to Gladia
    -- extracting: transcript/text sent to Claude
    -- completed: nodes written to brain
    -- failed: error during processing
    -- skipped: not relevant (too short, non-40K, etc.)
  gladia_job_id   TEXT,
  transcript      TEXT,
  nodes_extracted INTEGER DEFAULT 0,
  error           TEXT,
  discovered_at   INTEGER NOT NULL,     -- epoch ms
  processed_at    INTEGER               -- epoch ms, set when completed/failed/skipped
);

CREATE INDEX idx_ingest_content_source ON ingest_content(source_id);
CREATE INDEX idx_ingest_content_status ON ingest_content(status);
```

### Migration from `ingest_jobs`

1. Create both new tables
2. Seed `ingest_sources` with 4 initial rows
3. Migrate existing `ingest_jobs` rows to `ingest_content` — map `source_name` to `source_id`, map status values
4. Drop `ingest_jobs`

### Daily cron pipeline

The content-ingestor Worker's `scheduled` handler runs daily:

```
Phase 1 — Discovery (fast, ~10s)
  SELECT * FROM ingest_sources WHERE active = 1
  For each source:
    YouTube: fetch channel RSS feed for video list
    Web: fetch index/category page, extract article links
  For each URL not already in ingest_content:
    INSERT with status='discovered', title from feed

Phase 2 — Processing (slow, runs through discovered backlog)
  SELECT * FROM ingest_content WHERE status = 'discovered' ORDER BY discovered_at LIMIT N
  For each:
    YouTube: submit to Gladia → status='transcribing' (callback handles the rest)
    Web: fetch + extract + Claude → status='completed'
```

The limit N on Phase 2 prevents the Worker from timing out. Unprocessed content gets picked up on the next cron run.

### YouTube discovery without yt-dlp

Workers can't spawn subprocesses. YouTube RSS feed (`https://www.youtube.com/feeds/videos.xml?channel_id=XXXXX`) — free, no API key, returns last 15 videos with title + URL + published date. Good enough for daily checks. The channel ID is resolved once from the channel URL and stored.

### Web discovery

- **Warhammer Community**: fetch index page, extract article links matching 40K patterns
- **Goonhammer**: fetch 40K category page or sitemap, extract article links

Simple HTML fetch + regex/string match for article links.

### Gladia callback flow (unchanged)

YouTube videos still use the async Gladia callback:
1. Discovery sets status=`discovered`
2. Processing submits to Gladia, sets status=`transcribing`
3. Gladia calls back `/ingest/callback`, sets transcript + status=`transcribed`
4. Next cron run picks up `transcribed` rows for Claude extraction

### Admin UI — IngestPage changes

**Add Source form** (top of page):
- Name, URL, Type (youtube/web) inputs
- "Add Source" button → INSERT into `ingest_sources`
- Source list showing name, URL, type, active toggle, content count, last crawled

**Content table** (replaces current job table):
- Source filter tabs (All / per source)
- Columns: title, source name, status, nodes extracted, discovered date
- Title shown prominently — not just the URL
- Status badges (same colors as current)
- Keep manual URL input as a secondary action for ad-hoc ingestion

---

## What doesn't change

- Claude Haiku extraction (`extractNodes()`)
- R2 community.json writes (`writeNodesToBrain()`)
- Vectorize embedding
- Gladia transcription API
- Brain search/ask serving the ingested content

---

## Schema diff

```
+ ingest_sources (new table)
+ ingest_content (new table, replaces ingest_jobs)
- ingest_jobs (dropped after migration)
```

No other tables change.
