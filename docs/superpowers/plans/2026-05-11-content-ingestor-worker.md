# Content Ingestor Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin dashboard buttons that ingest YouTube videos and web articles into brain community nodes — fully automated, no CLI, no manual rebuild.

**Architecture:** New Cloudflare Worker (`apps/content-ingestor/server/`). YouTube flow: submit URL → Gladia transcribes via callback → Claude extracts nodes → write to R2 + re-index vectors. Web flow: fetch HTML → Claude extracts → same. Admin UI gets ingest buttons and job status.

**Tech Stack:** Cloudflare Workers, Hono, Gladia API (transcription), Claude API (extraction), R2 (brain nodes), Vectorize (search index), Turso (job tracking).

**Spec:** `docs/superpowers/specs/2026-05-11-content-ingestor-worker-design.md`

---

## File Structure

### New: `apps/content-ingestor/server/`

```
apps/content-ingestor/server/
  src/
    worker.ts              — Hono Worker: endpoints for ingest + Gladia callback
    lib/
      gladia.ts            — Gladia API client: submit YouTube URL, handle callback
      gladia.test.ts
      extract.ts           — Claude API: transcript/article text → community nodes JSON
      extract.test.ts
      html.ts              — HTML → article body text extraction
      html.test.ts
      nodes.ts             — Write nodes to R2 + trigger vector re-index
      nodes.test.ts
      ingest.ts            — Orchestrator: YouTube and web ingest flows
      ingest.test.ts
  wrangler.toml
  package.json
  tsconfig.json
```

### Modified

```
packages/db/src/schema.ts                    — Add ingest_jobs table
apps/admin/server/src/routers/stats.ts       — Add ingest endpoints
apps/admin/server/src/worker.ts              — Add CONTENT_INGESTOR service binding
apps/admin/client/src/pages/ScraperPage.tsx  — Add ingest section (or new IngestPage)
```

---

## Task 1: Scaffold + DB Schema

**Files:**
- Create: `apps/content-ingestor/server/package.json`, `tsconfig.json`, `wrangler.toml`
- Modify: `packages/db/src/schema.ts` — add `ingestJobs` table
- Generate migration, apply to production

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@tabletop-tools/content-ingestor-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@libsql/client": "^0.14.0",
    "@tabletop-tools/db": "workspace:*",
    "@tabletop-tools/server-core": "workspace:*",
    "hono": "^4.7.4"
  },
  "devDependencies": {
    "vitest": "^3.1.1",
    "wrangler": "^3.114.1"
  }
}
```

- [ ] **Step 2: Create wrangler.toml**

```toml
name = "tabletop-tools-content-ingestor-worker"
main = "src/worker.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
```

- [ ] **Step 3: Add ingestJobs table to schema.ts**

```typescript
export const ingestJobs = sqliteTable('ingest_jobs', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  sourceType: text('source_type').notNull(),        // 'youtube' | 'web'
  sourceName: text('source_name'),                   // 'auspex' | 'whc' | 'happy-krumping' | 'manual'
  title: text('title'),
  status: text('status').notNull().default('pending'), // pending | transcribing | extracting | completed | failed
  gladiaJobId: text('gladia_job_id'),
  transcript: text('transcript'),
  nodesExtracted: integer('nodes_extracted').default(0),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})
```

- [ ] **Step 4: Generate migration, apply to production, run DB tests**
- [ ] **Step 5: pnpm install, commit**

---

## Task 2: Gladia API Client

**Files:**
- Create: `apps/content-ingestor/server/src/lib/gladia.ts`
- Create: `apps/content-ingestor/server/src/lib/gladia.test.ts`

Two functions:

```typescript
// Submit a YouTube URL for transcription. Returns Gladia job ID.
export async function submitTranscription(opts: {
  youtubeUrl: string
  callbackUrl: string
  apiKey: string
  fetch?: typeof fetch
}): Promise<{ gladiaJobId: string }>

// Parse the callback payload from Gladia into a transcript string.
export function parseGladiaCallback(body: unknown): {
  id: string
  status: string
  transcript: string | null
  error: string | null
}
```

Submit flow:
```
POST https://api.gladia.io/v2/pre-recorded
Headers: x-gladia-key: {apiKey}, Content-Type: application/json
Body: {
  "audio_url": "{youtubeUrl}",
  "callback_url": "{callbackUrl}",
  "language_config": { "languages": ["en"] }
}
Response: { "id": "...", "result_url": "..." }
```

- [ ] **Step 1: Write tests** — mock fetch for submit, parse real callback shape
- [ ] **Step 2: Implement**
- [ ] **Step 3: Run tests, commit**

---

## Task 3: HTML Text Extractor

**Files:**
- Create: `apps/content-ingestor/server/src/lib/html.ts`
- Create: `apps/content-ingestor/server/src/lib/html.test.ts`

```typescript
// Fetch a URL and extract the article body text, stripping nav/header/footer/scripts/styles.
export async function fetchArticleText(url: string, fetchFn?: typeof fetch): Promise<string>
```

Strategy: fetch HTML, strip `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>` tags, then extract text content. No DOM parser needed in Workers — regex-based stripping is fine for this.

- [ ] **Step 1: Write tests** with sample HTML
- [ ] **Step 2: Implement**
- [ ] **Step 3: Run tests, commit**

---

## Task 4: Claude Extraction

**Files:**
- Create: `apps/content-ingestor/server/src/lib/extract.ts`
- Create: `apps/content-ingestor/server/src/lib/extract.test.ts`

```typescript
interface ExtractedNode {
  title: string
  category: string
  content: string
  summary: string
  keywords: string[]
  factionId?: string
  edition?: string
}

// Send transcript/article text to Claude API, get structured community nodes back.
export async function extractNodes(opts: {
  text: string
  sourceUrl: string
  sourceTitle?: string
  apiKey: string
  fetch?: typeof fetch
}): Promise<ExtractedNode[]>
```

Uses Claude API `POST https://api.anthropic.com/v1/messages` with the extraction prompt from the spec. Parses JSON from Claude's response.

- [ ] **Step 1: Write tests** — mock Claude API response
- [ ] **Step 2: Implement** — build prompt, call API, parse response
- [ ] **Step 3: Run tests, commit**

---

## Task 5: Node Writer (R2 + Vectorize)

**Files:**
- Create: `apps/content-ingestor/server/src/lib/nodes.ts`
- Create: `apps/content-ingestor/server/src/lib/nodes.test.ts`

```typescript
// Convert extracted nodes to brain Node format, append to community.json in R2,
// and trigger vector re-indexing.
export async function writeNodesToBrain(opts: {
  nodes: ExtractedNode[]
  sourceUrl: string
  sourceName: string
  bucket: R2Bucket
  vectorize: VectorizeIndex
  ai: Ai
}): Promise<{ written: number }>
```

Flow:
1. Read existing `nodes/community.json` from R2
2. Convert `ExtractedNode[]` to brain `Node[]` format (layer: 'community', generate IDs, add sources, etc.)
3. Deduplicate by title slug against existing nodes
4. Append new nodes to community.json
5. Write updated community.json back to R2
6. For each new node: embed with Workers AI (bge-base-en-v1.5), upsert to Vectorize
7. Update manifest.json in R2

- [ ] **Step 1: Write tests** — mock R2/Vectorize/AI
- [ ] **Step 2: Implement**
- [ ] **Step 3: Run tests, commit**

---

## Task 6: Ingest Orchestrator

**Files:**
- Create: `apps/content-ingestor/server/src/lib/ingest.ts`
- Create: `apps/content-ingestor/server/src/lib/ingest.test.ts`

Two flows:

```typescript
// Start YouTube ingestion — submits to Gladia, creates job record.
export async function startYoutubeIngest(opts: {
  url: string
  sourceName?: string
  callbackUrl: string
  gladiaKey: string
  db: Db
  fetch?: typeof fetch
}): Promise<{ jobId: string }>

// Complete YouTube ingestion — called when Gladia callback arrives.
export async function completeYoutubeIngest(opts: {
  gladiaJobId: string
  transcript: string
  db: Db
  anthropicKey: string
  bucket: R2Bucket
  vectorize: VectorizeIndex
  ai: Ai
  fetch?: typeof fetch
}): Promise<void>

// Web article ingestion — synchronous, does everything in one call.
export async function ingestWebArticle(opts: {
  url: string
  sourceName?: string
  db: Db
  anthropicKey: string
  bucket: R2Bucket
  vectorize: VectorizeIndex
  ai: Ai
  fetch?: typeof fetch
}): Promise<{ jobId: string }>
```

- [ ] **Step 1: Write tests**
- [ ] **Step 2: Implement**
- [ ] **Step 3: Run tests, commit**

---

## Task 7: Worker Entry Point

**Files:**
- Create: `apps/content-ingestor/server/src/worker.ts`

```typescript
interface Env {
  TURSO_DB_URL: string
  TURSO_AUTH_TOKEN: string
  GLADIA_API_KEY: string
  ANTHROPIC_API_KEY: string
  SYNC_SECRET?: string
  BRAIN_BUCKET: R2Bucket
  BRAIN_INDEX: VectorizeIndex
  AI: Ai
}
```

Endpoints:
- `GET /health`
- `POST /ingest/youtube` — body: `{ url, sourceName? }` → starts Gladia transcription
- `POST /ingest/web` — body: `{ url, sourceName? }` → fetches article, extracts, writes nodes
- `POST /ingest/callback` — Gladia callback → completes YouTube ingestion
- `GET /jobs` — recent ingest jobs
- `GET /jobs/:id` — single job details

All endpoints except `/ingest/callback` require `Authorization: Bearer {SYNC_SECRET}`.
The callback endpoint verifies the Gladia job ID exists in `ingest_jobs`.

- [ ] **Step 1: Implement worker.ts**
- [ ] **Step 2: Commit**

---

## Task 8: Admin Dashboard — Ingest UI

**Files:**
- Modify: `apps/admin/server/src/routers/stats.ts` — add ingest endpoints
- Modify: `apps/admin/server/src/worker.ts` — add CONTENT_INGESTOR service binding
- Modify: `apps/admin/server/wrangler.toml` — add service binding
- Create or modify: admin client ingest page

Admin endpoints:
```typescript
ingestJobs: adminProcedure.input(z.object({ limit: z.number().optional().default(20) }))
  .query(/* read from ingest_jobs table */)

triggerYoutubeIngest: adminProcedure
  .input(z.object({ url: z.string(), sourceName: z.string().optional() }))
  .mutation(/* call content-ingestor Worker */)

triggerWebIngest: adminProcedure
  .input(z.object({ url: z.string(), sourceName: z.string().optional() }))
  .mutation(/* call content-ingestor Worker */)
```

UI:
- URL input field + "YouTube" / "Web" toggle + submit
- Preset buttons: "Latest Auspex", "Latest WHC", "Latest Happy Krumping"
- Job history table with status badges
- Nodes extracted count per job

- [ ] **Step 1: Add service binding + admin endpoints**
- [ ] **Step 2: Add admin UI**
- [ ] **Step 3: Run tests, commit**

---

## Task 9: Deploy & Test

- [ ] **Step 1: pnpm install, run all tests**
- [ ] **Step 2: Deploy content-ingestor Worker**
- [ ] **Step 3: Set secrets** (GLADIA_API_KEY, ANTHROPIC_API_KEY, TURSO_*, SYNC_SECRET)
- [ ] **Step 4: Configure R2 bucket binding + Vectorize index binding** (same as brain Worker)
- [ ] **Step 5: Deploy admin Worker with service binding**
- [ ] **Step 6: Test with a real Auspex video** — verify transcript → nodes → R2 → searchable in brain
- [ ] **Step 7: Deploy gateway with updated admin client**
- [ ] **Step 8: Commit**
