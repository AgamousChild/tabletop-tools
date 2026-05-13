# Content Ingestor Worker — Design Spec

## Overview

A Cloudflare Worker that ingests competitive 40K content from YouTube channels and web articles into the brain's community node layer. Triggered from the admin dashboard — "Ingest Auspex", "Ingest WHC", "Ingest Happy Krumping" buttons.

Takes a YouTube video URL or web article URL → fetches transcript/content → sends to Claude API for structured extraction → writes community nodes to the brain.

---

## Why

11th Edition launches in June. We need to rapidly ingest rules reveals, faction focus articles, and competitive analysis from key content creators. Currently this requires running local CLI tools with yt-dlp, Playwright, and Ollama. This Worker makes it a button click in the admin dashboard.

---

## Sources

| Source | Type | Content |
|---|---|---|
| Warhammer Community (WHC) | Web articles | Faction focus reveals, rules previews, datasheet reveals |
| Auspex Tactics | YouTube | Rules analysis, unit reviews, edition comparisons |
| Happy Krumping | YouTube | Competitive 40K analysis, faction breakdowns |
| Any YouTube URL | YouTube | Ad-hoc video ingestion |
| Any web URL | Web article | Ad-hoc article ingestion |

---

## Architecture

```
Admin Dashboard
  → "Ingest" button (URL + source type)
  → POST to Content Ingestor Worker

Content Ingestor Worker
  1. If YouTube URL → Gladia API (transcript)
     If web URL → fetch() HTML → extract text
  2. Send transcript/text to Claude API → structured community nodes
  3. Write nodes to Turso (ingest_jobs table + community_nodes table)
  4. Next brain rebuild picks them up from community_nodes table
```

---

## Gladia Integration (YouTube transcription)

**API**: `https://api.gladia.io/v2/pre-recorded`
**Auth**: `x-gladia-key` header
**Limits**: 10 hours free/month, 120 min per YouTube video

### Flow

1. `POST /v2/pre-recorded` with `{ "audio_url": "https://youtube.com/watch?v=..." }`
   - Response: `{ "id": "job-id", "result_url": "https://api.gladia.io/v2/pre-recorded/job-id" }`

2. Poll `GET /v2/pre-recorded/{id}` until `status === "done"`
   - Response: `{ "status": "done", "result": { "transcription": { "full_transcript": "..." } } }`

3. Full transcript text → Claude API for extraction

### Worker Secret

`GLADIA_API_KEY` — stored as Cloudflare Worker secret. Already in local `.env`.

---

## Claude API Integration (content extraction)

Takes raw transcript or article text, returns structured brain community nodes.

**API**: `https://api.anthropic.com/v1/messages`
**Auth**: `x-api-key` header
**Model**: claude-sonnet-4-6 (fast, cheap, good enough for extraction)

### Extraction prompt

```
You are extracting structured Warhammer 40,000 knowledge from content.
Edition: {10th or 11th — detect from content}

For each distinct rule, ability, detachment, stratagem, enhancement, or tactical concept mentioned, create a node with:
- title: Clear, specific name
- category: One of: detachment, detachment-rule, stratagem, enhancement, army-rule, faction-ability, datasheet, tactic, ruling, worked-example
- content: Full rules text or detailed explanation in markdown
- summary: 1-2 sentence summary
- keywords: Array of relevant search terms
- factionId: Faction slug if faction-specific (e.g., "space-marines", "orks")
- edition: "10th" or "11th"

Return JSON array of nodes. Only include nodes with concrete, specific information — not vague commentary.
```

### Worker Secret

`ANTHROPIC_API_KEY` — the brain Worker already has this. The content ingestor Worker needs its own copy.

---

## Web Article Ingestion (WHC, Goonhammer, etc.)

1. `fetch(url)` the HTML
2. Strip tags, nav, footer, ads → extract article body text
3. Send to Claude API for extraction (same prompt as YouTube)

No Playwright needed — WHC articles are server-rendered HTML.

---

## Database

### New tables

```sql
-- Ingest job tracking
CREATE TABLE ingest_jobs (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  source_type TEXT NOT NULL,     -- 'youtube' | 'web'
  source_name TEXT,              -- 'auspex' | 'whc' | 'happy-krumping' | 'manual'
  title TEXT,                    -- video/article title
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | transcribing | extracting | completed | failed
  transcript TEXT,               -- raw transcript (YouTube) or article text (web)
  nodes_extracted INTEGER DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- Extracted community nodes (staging — committed to brain on next rebuild)
CREATE TABLE community_nodes (
  id TEXT PRIMARY KEY,           -- community:<slug>
  ingest_job_id TEXT NOT NULL REFERENCES ingest_jobs(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT NOT NULL,
  keywords TEXT NOT NULL,        -- JSON array
  faction_id TEXT,
  edition TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at INTEGER NOT NULL
);
```

### Brain rebuild integration

The `build-graph.ts` pipeline already reads community nodes from `community.json`. Add a step that also reads from the `community_nodes` table (status = 'approved') and merges them in. Alternatively, an export step writes approved nodes from Turso to `community.json` before rebuild.

---

## Worker

### Location

`apps/content-ingestor/server/` — new Cloudflare Worker (the existing content-ingestor is a local CLI tool; this is its cloud counterpart).

### Endpoints

```
GET  /health              → { status: 'ok' }
POST /ingest/youtube      → { jobId } — body: { url, sourceName? }
POST /ingest/web          → { jobId } — body: { url, sourceName? }
GET  /jobs                → recent ingest jobs
GET  /jobs/:id            → single job with extracted nodes
POST /jobs/:id/approve    → approve all nodes from a job
```

### Env / Secrets

```
TURSO_DB_URL
TURSO_AUTH_TOKEN
GLADIA_API_KEY
ANTHROPIC_API_KEY
SYNC_SECRET           -- bearer token for endpoint auth
```

### Wrangler config

```toml
name = "tabletop-tools-content-ingestor"
main = "src/worker.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
```

No cron — purely on-demand from admin.

---

## Admin Dashboard

### New section on existing ScraperPage (or new IngestorPage)

**Quick ingest buttons:**
- "Ingest from YouTube" — text input for URL, submit
- "Ingest from Web" — text input for URL, submit
- Preset buttons: "Latest Auspex", "Latest WHC", "Latest Happy Krumping"

**Job status:**
- Recent jobs table: URL, source, status, nodes extracted, timestamp
- Click a job → see extracted nodes, approve/reject

**Node review:**
- List of pending nodes from recent jobs
- Each node shows: title, category, faction, summary, content preview
- Approve / reject buttons

### Admin endpoints

```
stats.ingestJobs({ limit })      → recent jobs
stats.ingestJob({ jobId })       → job + nodes
stats.triggerYoutubeIngest({ url, sourceName })  → mutation
stats.triggerWebIngest({ url, sourceName })      → mutation
stats.approveIngestNodes({ jobId })              → mutation
```

---

## Processing Flow (YouTube)

1. Admin clicks "Ingest from YouTube", enters URL
2. Admin Worker calls Content Ingestor Worker `POST /ingest/youtube`
3. Worker creates `ingest_jobs` row (status: 'pending')
4. Worker calls Gladia `POST /v2/pre-recorded` with YouTube URL
5. Worker updates job status to 'transcribing'
6. Worker polls Gladia `GET /v2/pre-recorded/{id}` until done
7. Worker saves transcript to `ingest_jobs.transcript`
8. Worker updates job status to 'extracting'
9. Worker calls Claude API with transcript + extraction prompt
10. Worker parses Claude response → inserts into `community_nodes`
11. Worker updates job (status: 'completed', nodes_extracted: N)
12. Admin sees job complete with extracted nodes
13. Admin reviews and approves nodes
14. Next brain rebuild includes approved nodes

---

## Processing Flow (Web Article)

1. Admin enters WHC article URL
2. Worker `fetch()`es the HTML
3. Strips to article body text (remove nav, header, footer, scripts, styles)
4. Same Claude extraction step as YouTube
5. Same node storage and review flow

---

## Polling Strategy (Gladia)

Gladia transcription is async. For a 30-minute video, it might take 1-2 minutes.

**Option A: Worker waits and polls** — Worker polls every 5 seconds until done. Cloudflare Workers have a 30-second limit, so this won't work for long videos.

**Option B: Two-phase** — 
1. `POST /ingest/youtube` submits to Gladia, saves the Gladia job ID, returns immediately
2. A separate `POST /ingest/poll` endpoint (or the admin UI polls the job status) checks Gladia and continues processing when ready
3. Or use Gladia's **callback URL** feature — Gladia POSTs the result to our Worker when done

**Recommended: Option B with callback**. Gladia supports `callback_url` in the transcription request. Set it to our Worker's endpoint. When Gladia finishes, it POSTs the transcript to us. No polling needed.

```
POST /ingest/youtube → submit to Gladia with callback_url → return jobId
POST /ingest/callback → Gladia posts transcript here → Worker does extraction → done
```

---

## Channel Discovery

For "Latest Auspex" / "Latest WHC" / "Latest Happy Krumping" buttons, we need to know the channel URLs:

| Source | YouTube Channel | WHC URL |
|---|---|---|
| Auspex Tactics | https://www.youtube.com/@AuspexTactics | — |
| Happy Krumping | https://www.youtube.com/@HappyKrumping | — |
| WHC | — | https://www.warhammer-community.com/en-gb/tag/warhammer-40000/ |

For YouTube channels, use the YouTube Data API (or RSS feed at `https://www.youtube.com/feeds/videos.xml?channel_id=...`) to list recent videos, then offer them for ingestion.

For WHC, fetch the article listing page and extract recent article URLs.

---

## What Micah provides

- Gladia API key ✅ (already saved to .env)
- Anthropic API key (already exists on brain Worker)
- That's it
