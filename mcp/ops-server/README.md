# ops-mcp-server

Process manual for the tabletop-tools brain + content-ingestor + BCP pipeline,
exposed as MCP tools so Claude Code (or any MCP client) can drive the
pipeline without re-deriving the sequence every session.

## Why this exists

Every operator session used to relearn the same pipeline:

- which bash script rebuilds the brain
- which endpoint reindexes vectors and how to chunk it (Rule 9)
- which script promotes discovered → queued → done in the ingestor
- which order to run them in and what "success" looks like
- which BCP script fetches events vs lists, and which needs auth

This server encodes the sequence. Each tool description tells the reader what
it does AND what to run next. `pipeline_status` and `detachments_report`
replace the "what state is the world in?" probing.

## Install + run

```bash
cd mcp/ops-server
npm install
npm run start   # stdio MCP server
```

## Wire into Claude Code

Add an entry to the repo's `.mcp.json` (sibling of `mcp/`) — matching the
existing `brain` and `tts` entries:

```json
"ops": {
  "command": "cmd",
  "args": ["/c", "npx", "tsx", "mcp/ops-server/src/index.ts"],
  "cwd": "C:/R/tabletop-tools"
}
```

Restart Claude Code. Tools appear as `mcp__ops__brain_*`, `mcp__ops__content_*`,
and `mcp__ops__bcp_*`.

Do NOT add to `~/.claude/settings.json` — Claude Code doesn't read MCP
config from there.

## Environment

Reads `.env` at the repo root. Must contain:

- `TURSO_DB_URL`, `TURSO_AUTH_TOKEN` — for content status + BCP tools
- `SYNC_SECRET` — for `brain_reindex` (calls prod /index-vectors)
- `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN` — for `brain_purge_cache`
- `BCP_EMAIL`, `BCP_PASSWORD` — for `bcp_scrape_events` AND `bcp_scrape_lists`
  (BCP list REST API returns 403 without auth, despite pairings API working unauthenticated)

## Tool map

**Brain**
- `brain_build` — rebuild .local/brain/ from all sources (emits cube/ too)
- `brain_detachments_report` — read-only diagnostic (run before deploy)
- `brain_cube_report` — read-only cube diagnostic (live vs local)
- `brain_upload_r2` — push local build to R2 (includes cube/)
- `brain_deploy_worker` — wrangler deploy
- `brain_reindex` — chunked Vectorize embed (fixes Rule 9 CPU-cap failures)
- `brain_reload_cube` — drop Worker isolate cube cache + purge response cache
- `brain_purge_cache` — CDN purge
- `brain_deploy_full` — build → upload → worker → reindex → purge

**Content ingestor**
- `content_pipeline_status` — pipeline_item counts by status (start here)
- `content_discover` — find new URLs (usually a cron; only run manually if catching up)
- `content_queue_newest(n)` — promote N discovered → queued
- `content_process(n)` — LLM extract via Ollama (~30s/item) → drafts
- `content_commit` — drafts → community.json
- `content_full_cycle(n)` — queue + process + commit combo

**BCP scraper**
- `bcp_scrape_events` — scrape BCP events + pairings (7-day rolling window, stores source_list_id)
- `bcp_scrape_lists` — fetch army list text via BCP REST API (no auth needed); params: since, until, eventId
- `bcp_pipeline_full` — events → lists combo; params: since, until, skipLists

## BCP pipeline notes

The old `apps/content-ingestor/src/bcp/` scripts are deprecated — all BCP
work now lives in `apps/bcp-scraper/`. The deprecated scripts carry a
top-of-file comment pointing here.

For date-range backfill beyond 7 days, `scrape-jun-jul.ts` is the template.
`bcp_scrape_events` (this tool) wraps the default rolling-window scrape.
For custom windows, run the script directly:
```bash
NODE_OPTIONS=--dns-result-order=ipv4first node --import tsx/esm \
  apps/bcp-scraper/server/scripts/scrape-jun-jul.ts
```

## Adding a tool

1. Implement in `src/lib/{brain,content,bcp}-ops.ts` — importable per Rule 4.
2. Register in `src/index.ts` with a description that explains what it does
   AND what to run next.
