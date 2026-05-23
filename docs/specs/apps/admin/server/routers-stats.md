# apps/admin/server/src/routers/stats.ts

> Admin dashboard data — platform stats, user/session management, pipeline status, scraper/ingestor triggers.

## Prompt

Write a large tRPC router `statsRouter` for the admin dashboard. Most endpoints use `adminProcedure` (admin-only). One endpoint (`bsdataVersion`) is public.

### Platform overview endpoints

**`overview`:** Aggregate counts across every domain table: users (total + 7-day recent), sessions (active + total), and per-app counts (noCheat: diceSets/sessions/rolls, versus: simulations, listBuilder: lists/units, gameTracker: matches/turns, tournament: tournaments/players, newMeta: imports/glickoPlayers, elo: players). Uses a helper `count(db, table)` function that runs `SELECT count(*)`.

**`appActivity`:** Per-app total + 7-day-recent counts for the 6 main apps. Compare `createdAt > sevenDaysAgo`.

**`recentUsers`:** Last N users ordered by createdAt desc. Select id, name, email, createdAt.

**`activeSessions`:** Active (non-expired) sessions joined with user names/emails. Inner join authSessions with authUsers.

**`topFactions`:** Group tournamentPlayers by faction, count, order desc.

**`matchResults`:** Count matches by result (WIN/LOSS/DRAW/null for in-progress).

**`recentEvents`:** Latest meta_events ordered by date desc (from BCP scraper).

### User management endpoints

**`revokeSession`:** Set session expiresAt to now (immediate expiry).

**`revokeAllSessions`:** Expire all sessions for a user.

**`deleteUser`:** Delete user row. Cascade deletes handle all related data.

### Pipeline status endpoints

**`pipeline`:** Comprehensive pipeline health — meta 3NF counts (events, players, pairings, with lists, with detachment), cube counts (fact rows, frames, meta_top), cube status, dimension counts, date range.

**`bcpScraperStatus`:** Latest bcp_scrape_jobs row + total events count.

**`bcpScraperHistory`:** Last N scrape jobs.

**`listParserStatus`:** Count parsed/partial/failed/pending army lists in meta_event_players.

**`ingestJobs`:** Latest content ingestor jobs from ingest_jobs table.

### Trigger endpoints (via service bindings)

**`triggerBcpScrape`:** Call `ctx.bcpScraper.fetch(new Request('https://bcp-scraper/scrape', { method: 'POST' }))`. Return triggered/error.

**`triggerYoutubeIngest`:** Accept `{ url, sourceName? }`. Call content ingestor's `/ingest/youtube` via service binding.

**`triggerWebIngest`:** Same for `/ingest/web`.

**`triggerMetaPipeline`:** Placeholder — returns "not configured yet".

### Public endpoint

**`bsdataVersion`:** Fetch latest commit from `BSData/wh40k-10e` GitHub repo. Returns `{ sha (7 chars), date, message (first line), error }`. No admin check needed.

## Dependencies

- `zod` — `z`
- `drizzle-orm` — `sql`, `gt`, `desc`, `eq`
- `@trpc/server` — `TRPCError`
- `../trpc.js` — `router`, `adminProcedure`, `publicProcedure`
- `@tabletop-tools/db` — all 18+ tables imported for counting
