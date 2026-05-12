# Content Ingestor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool that crawls YouTube channels and websites, extracts competitive 40K tactical knowledge using local LLM (Ollama), and produces draft brain community nodes for human review and approval.

**Architecture:** CLI app in `apps/content-ingestor/` using Commander.js for CLI commands, yt-dlp for YouTube, Cheerio for web scraping, and Ollama for local LLM extraction. Draft nodes stored as markdown files in `.local/ingest/`. Interactive review via readline. Approved nodes committed to brain graph via the existing community node infrastructure.

**Tech Stack:** TypeScript, Commander.js, Cheerio, node-fetch, Ollama REST API (localhost:11434), yt-dlp (external binary at C:\R\tools\yt-dlp.exe), Vitest

---

## File Structure

```
apps/content-ingestor/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    cli.ts                          — CLI entry point (Commander setup)
    cli.test.ts

    types.ts                        — All types (DraftNode, Source, CrawlManifest, etc.)

    crawlers/
      youtube.ts                    — YouTube channel crawler (yt-dlp)
      youtube.test.ts
      web.ts                        — Generic web article crawler (Cheerio)
      web.test.ts
      reddit.ts                     — Reddit JSON API crawler
      reddit.test.ts

    transcript/
      fetch.ts                      — Fetch YouTube transcript via yt-dlp
      fetch.test.ts
      clean.ts                      — Clean transcript via Ollama
      clean.test.ts

    screenshots/
      capture.ts                    — Capture video frames via yt-dlp/ffmpeg
      capture.test.ts

    llm/
      ollama.ts                     — Ollama client (relevance filter, extraction, cleanup)
      ollama.test.ts
      prompts.ts                    — System prompts for each LLM step
      prompts.test.ts

    extract/
      extract.ts                    — Orchestrate: content → LLM → draft nodes
      extract.test.ts
      dedup.ts                      — Deduplication against existing brain nodes
      dedup.test.ts

    drafts/
      store.ts                      — Read/write draft markdown files
      store.test.ts
      manifest.ts                   — Crawl state tracking (manifest.json)
      manifest.test.ts

    review/
      interactive.ts                — Interactive CLI review (readline)
      interactive.test.ts

    commit/
      commit.ts                     — Push approved nodes to brain graph
      commit.test.ts

    index.ts                        — Barrel export
```

---

### Task 1: Package scaffolding + types

**Files:**
- Create: `apps/content-ingestor/package.json`
- Create: `apps/content-ingestor/tsconfig.json`
- Create: `apps/content-ingestor/vitest.config.ts`
- Create: `apps/content-ingestor/src/types.ts`
- Create: `apps/content-ingestor/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "content-ingestor",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "bin": {
    "ingest": "./src/cli.ts"
  },
  "scripts": {
    "ingest": "tsx src/cli.ts",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "cheerio": "^1.0.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "tsx": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { globals: true }
})
```

- [ ] **Step 4: Create types.ts**

```typescript
// ── Source types ───────────────────────────────────────────────────────────

export type SourceType = 'youtube' | 'article' | 'reddit' | 'wiki' | 'pdf'

export interface ContentSource {
  url: string
  type: SourceType
  channel?: string        // YouTube channel name
  site?: string           // website name
  title?: string          // video/article title
  fetchedAt: string       // ISO date
}

// ── Transcript ────────────────────────────────────────────────────────────

export interface TranscriptSegment {
  text: string
  start: number           // seconds
  end: number             // seconds
}

export interface Transcript {
  original: TranscriptSegment[]   // raw auto-captions with timestamps
  cleaned?: string                // LLM-cleaned full text
}

// ── Screenshot ────────────────────────────────────────────────────────────

export interface Screenshot {
  file: string            // relative path to image
  timestamp: string       // "4:32" format
  timestampSec: number    // seconds
  caption: string
}

// ── Draft node ────────────────────────────────────────────────────────────

export type DraftStatus = 'draft' | 'approved' | 'rejected'

export interface DraftNode {
  status: DraftStatus
  title: string
  category: 'tactic' | 'ruling' | 'worked-example'
  keywords: string[]
  sourceUrl: string
  sourceType: SourceType
  sourceChannel?: string
  timestamp?: string
  confidence: number
  screenshots: Screenshot[]
  summary: string
  content: string
  sourceContext: string   // quoted source material
  similarTo?: string     // existing brain node ID if similar
}

// ── Crawl manifest ────────────────────────────────────────────────────────

export interface CrawlEntry {
  url: string
  title: string
  processedAt?: string
  relevant?: boolean
  nodeCount?: number
}

export interface CrawlManifest {
  source: string          // channel/site URL
  sourceType: SourceType
  lastCrawlAt: string
  entries: CrawlEntry[]
}

// ── LLM ───────────────────────────────────────────────────────────────────

export type LLMProvider = 'ollama' | 'claude' | 'gemini'

export interface LLMConfig {
  provider: LLMProvider
  model: string
  endpoint: string        // e.g. http://localhost:11434
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'ollama',
  model: 'llama3.1:8b',
  endpoint: 'http://localhost:11434',
}

// ── Config ────────────────────────────────────────────────────────────────

export interface IngestConfig {
  llm: LLMConfig
  ytdlpPath: string       // path to yt-dlp binary
  dataDir: string         // .local/ingest/
  brainNodesDir: string   // path to brain graph nodes
}

export const DEFAULT_CONFIG: IngestConfig = {
  llm: DEFAULT_LLM_CONFIG,
  ytdlpPath: 'C:/R/tools/yt-dlp.exe',
  dataDir: '.local/ingest',
  brainNodesDir: '../brain/server/.local/brain/nodes',
}
```

- [ ] **Step 5: Create barrel export index.ts**

```typescript
export * from './types'
```

- [ ] **Step 6: Install dependencies**

Run: `cd apps/content-ingestor && pnpm install`

- [ ] **Step 7: Verify test runner**

Run: `cd apps/content-ingestor && npx vitest run --passWithNoTests`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/content-ingestor/
git commit -m "feat(content-ingestor): scaffold CLI app with types"
```

---

### Task 2: Ollama LLM client + prompts

**Files:**
- Create: `apps/content-ingestor/src/llm/ollama.ts`
- Create: `apps/content-ingestor/src/llm/ollama.test.ts`
- Create: `apps/content-ingestor/src/llm/prompts.ts`
- Create: `apps/content-ingestor/src/llm/prompts.test.ts`

- [ ] **Step 1: Write prompts.ts**

System prompts for each LLM step:
- `RELEVANCE_PROMPT` — "Is this content about competitive Warhammer 40K tactics? Answer YES or NO."
- `CLEANUP_PROMPT` — "Fix 40K terminology and grammar in this transcript. Keep meaning identical."
- `EXTRACTION_PROMPT` — "Extract tactical concepts from this content. Return JSON array of {title, summary, content, keywords, confidence}."
- `TIMESTAMP_PROMPT` — "Identify timestamps where visual examples are shown. Return JSON array of {timestamp, description}."
- Include few-shot examples from existing community nodes.
- Include a 40K terminology glossary (faction names, unit types, rule terms).

- [ ] **Step 2: Write prompts.test.ts**

Test: prompts contain required sections (40K terms, output format instructions, examples).

- [ ] **Step 3: Write ollama.ts**

```typescript
export async function ollamaChat(
  prompt: string,
  systemPrompt: string,
  config: LLMConfig,
): Promise<string>
// POST to config.endpoint/api/chat with { model, messages: [{role: system, content}, {role: user, content}] }
// Return the assistant's response text

export async function checkRelevance(content: string, config: LLMConfig): Promise<boolean>
// Uses RELEVANCE_PROMPT, returns true if response contains "YES"

export async function cleanTranscript(transcript: string, config: LLMConfig): Promise<string>
// Uses CLEANUP_PROMPT, returns cleaned text

export async function extractConcepts(content: string, source: ContentSource, config: LLMConfig): Promise<DraftNode[]>
// Uses EXTRACTION_PROMPT, parses JSON response into DraftNode array

export async function identifyTimestamps(transcript: string, config: LLMConfig): Promise<Array<{ timestamp: string; description: string }>>
// Uses TIMESTAMP_PROMPT, parses JSON response
```

- [ ] **Step 4: Write ollama.test.ts**

Test with mocked fetch (don't call real Ollama in tests):
- `ollamaChat` sends correct request format
- `checkRelevance` returns true for "YES" response, false for "NO"
- `extractConcepts` parses valid JSON into DraftNode array
- `extractConcepts` handles malformed JSON gracefully (returns empty array)
- `identifyTimestamps` parses timestamp JSON

- [ ] **Step 5: Run tests, verify pass**

Run: `cd apps/content-ingestor && npx vitest run src/llm/`

- [ ] **Step 6: Commit**

```bash
git add apps/content-ingestor/src/llm/
git commit -m "feat(content-ingestor): Ollama LLM client + extraction prompts"
```

---

### Task 3: YouTube crawler + transcript fetcher

**Files:**
- Create: `apps/content-ingestor/src/crawlers/youtube.ts`
- Create: `apps/content-ingestor/src/crawlers/youtube.test.ts`
- Create: `apps/content-ingestor/src/transcript/fetch.ts`
- Create: `apps/content-ingestor/src/transcript/fetch.test.ts`
- Create: `apps/content-ingestor/src/transcript/clean.ts`
- Create: `apps/content-ingestor/src/transcript/clean.test.ts`

- [ ] **Step 1: Write youtube.ts**

```typescript
export async function listChannelVideos(
  channelUrl: string,
  ytdlpPath: string,
): Promise<Array<{ url: string; title: string }>>
// Runs: yt-dlp --flat-playlist --print "%(url)s|||%(title)s" <channelUrl>
// Parses output into array of {url, title}
// Uses child_process.execFile
```

- [ ] **Step 2: Write youtube.test.ts**

Mock execFile to return sample yt-dlp output. Test parsing of URLs and titles.

- [ ] **Step 3: Write fetch.ts**

```typescript
export async function fetchTranscript(
  videoUrl: string,
  ytdlpPath: string,
  outputDir: string,
): Promise<Transcript>
// Runs: yt-dlp --write-auto-sub --sub-lang en --sub-format json3 --skip-download -o <outputDir>/%(id)s <videoUrl>
// Parses the .json3 subtitle file into TranscriptSegment[]
// Returns { original: segments, cleaned: undefined }
```

- [ ] **Step 4: Write fetch.test.ts**

Mock execFile, provide sample json3 subtitle data. Test segment parsing.

- [ ] **Step 5: Write clean.ts**

```typescript
export async function cleanTranscriptText(
  transcript: Transcript,
  config: LLMConfig,
): Promise<Transcript>
// Joins original segments into raw text
// Sends to Ollama for cleanup via cleanTranscript()
// Returns transcript with cleaned field populated
```

- [ ] **Step 6: Write clean.test.ts**

Mock Ollama response. Test that cleaned text is set on returned transcript.

- [ ] **Step 7: Run tests, verify pass**

Run: `cd apps/content-ingestor && npx vitest run src/crawlers/youtube.test.ts src/transcript/`

- [ ] **Step 8: Commit**

```bash
git add apps/content-ingestor/src/crawlers/youtube.* apps/content-ingestor/src/transcript/
git commit -m "feat(content-ingestor): YouTube crawler + transcript fetch/clean"
```

---

### Task 4: Screenshot capture

**Files:**
- Create: `apps/content-ingestor/src/screenshots/capture.ts`
- Create: `apps/content-ingestor/src/screenshots/capture.test.ts`

- [ ] **Step 1: Write capture.ts**

```typescript
export async function captureFrame(
  videoUrl: string,
  timestampSec: number,
  outputPath: string,
  ytdlpPath: string,
): Promise<string>
// Downloads a single frame at the given timestamp
// Runs: yt-dlp --download-sections "*<timestamp>-<timestamp+1>" --force-keyframes-at-cuts -o <outputPath> <videoUrl>
// Then uses ffmpeg to extract a single frame: ffmpeg -ss <timestamp> -i <video> -frames:v 1 <outputPath>.png
// Returns the path to the saved screenshot
// If ffmpeg not available, fall back to yt-dlp thumbnail

export async function captureMultipleFrames(
  videoUrl: string,
  timestamps: Array<{ timestamp: string; description: string }>,
  outputDir: string,
  ytdlpPath: string,
): Promise<Screenshot[]>
// Calls captureFrame for each timestamp
// Returns Screenshot array with file paths and captions
```

- [ ] **Step 2: Write capture.test.ts**

Mock execFile. Test that correct yt-dlp/ffmpeg commands are constructed. Test timestamp parsing ("4:32" → 272 seconds).

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add apps/content-ingestor/src/screenshots/
git commit -m "feat(content-ingestor): video screenshot capture via yt-dlp"
```

---

### Task 5: Web + Reddit crawlers

**Files:**
- Create: `apps/content-ingestor/src/crawlers/web.ts`
- Create: `apps/content-ingestor/src/crawlers/web.test.ts`
- Create: `apps/content-ingestor/src/crawlers/reddit.ts`
- Create: `apps/content-ingestor/src/crawlers/reddit.test.ts`

- [ ] **Step 1: Write web.ts**

```typescript
export async function crawlSite(
  siteUrl: string,
): Promise<Array<{ url: string; title: string }>>
// Fetch the index page, extract all article links via Cheerio
// Follow pagination if present
// Return list of article URLs + titles

export async function fetchArticle(
  url: string,
): Promise<{ title: string; content: string }>
// Fetch the page HTML
// Use Cheerio to extract article body text (strip nav, ads, sidebar, footer)
// Return clean text content
```

- [ ] **Step 2: Write web.test.ts**

Provide sample HTML. Test link extraction, content extraction, ad stripping.

- [ ] **Step 3: Write reddit.ts**

```typescript
export async function crawlSubreddit(
  subredditUrl: string,
  limit?: number,
): Promise<Array<{ url: string; title: string; score: number }>>
// Fetch <subredditUrl>.json?limit=100
// Parse Reddit JSON response
// Filter by score (skip low-score posts)
// Return post URLs + titles + scores

export async function fetchRedditPost(
  postUrl: string,
): Promise<{ title: string; content: string; comments: string[] }>
// Fetch <postUrl>.json
// Extract post body (selftext) + top comments (sorted by score, limit 10)
// Return structured content
```

- [ ] **Step 4: Write reddit.test.ts**

Mock fetch with sample Reddit JSON. Test post parsing, comment extraction, score filtering.

- [ ] **Step 5: Run tests, verify pass**

Run: `cd apps/content-ingestor && npx vitest run src/crawlers/`

- [ ] **Step 6: Commit**

```bash
git add apps/content-ingestor/src/crawlers/web.* apps/content-ingestor/src/crawlers/reddit.*
git commit -m "feat(content-ingestor): web article + Reddit crawlers"
```

---

### Task 6: Draft store + manifest

**Files:**
- Create: `apps/content-ingestor/src/drafts/store.ts`
- Create: `apps/content-ingestor/src/drafts/store.test.ts`
- Create: `apps/content-ingestor/src/drafts/manifest.ts`
- Create: `apps/content-ingestor/src/drafts/manifest.test.ts`

- [ ] **Step 1: Write store.ts**

```typescript
export function draftToMarkdown(draft: DraftNode): string
// Convert DraftNode to markdown with YAML frontmatter

export function markdownToDraft(markdown: string): DraftNode
// Parse markdown with frontmatter back to DraftNode

export async function saveDraft(draft: DraftNode, dir: string, index: number): Promise<string>
// Write draft to dir/node-{index}-{slugified-title}.md
// Return file path

export async function loadDrafts(dir: string): Promise<Array<{ path: string; draft: DraftNode }>>
// Read all .md files in dir, parse each to DraftNode
// Return array of {path, draft}

export async function updateDraftStatus(path: string, status: DraftStatus): Promise<void>
// Read file, update status in frontmatter, write back
```

- [ ] **Step 2: Write store.test.ts**

Test round-trip: DraftNode → markdown → DraftNode. Test all fields preserved including screenshots array. Use temp directory for file tests.

- [ ] **Step 3: Write manifest.ts**

```typescript
export async function loadManifest(dir: string): Promise<CrawlManifest | null>
// Read manifest.json from dir, return parsed or null if not found

export async function saveManifest(manifest: CrawlManifest, dir: string): Promise<void>
// Write manifest.json to dir

export function getUnprocessedEntries(manifest: CrawlManifest): CrawlEntry[]
// Return entries where processedAt is undefined

export function markEntryProcessed(manifest: CrawlManifest, url: string, relevant: boolean, nodeCount: number): void
// Update the entry in place
```

- [ ] **Step 4: Write manifest.test.ts**

Test load/save round-trip, unprocessed filtering, entry update.

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git add apps/content-ingestor/src/drafts/
git commit -m "feat(content-ingestor): draft store + crawl manifest"
```

---

### Task 7: Extraction pipeline + deduplication

**Files:**
- Create: `apps/content-ingestor/src/extract/extract.ts`
- Create: `apps/content-ingestor/src/extract/extract.test.ts`
- Create: `apps/content-ingestor/src/extract/dedup.ts`
- Create: `apps/content-ingestor/src/extract/dedup.test.ts`

- [ ] **Step 1: Write dedup.ts**

```typescript
export async function loadExistingNodes(brainNodesDir: string): Promise<Array<{ id: string; title: string; keywords: string[] }>>
// Read community.json from brain nodes dir
// Return id, title, keywords for each node

export function findSimilar(draft: DraftNode, existing: Array<{ id: string; title: string; keywords: string[] }>): string | undefined
// Check title similarity (case-insensitive substring match or >50% keyword overlap)
// Return existing node ID if similar, undefined if unique
```

- [ ] **Step 2: Write dedup.test.ts**

Test: exact title match found, keyword overlap found, unique node returns undefined.

- [ ] **Step 3: Write extract.ts**

```typescript
export async function processContent(
  source: ContentSource,
  content: string,
  config: IngestConfig,
  existingNodes: Array<{ id: string; title: string; keywords: string[] }>,
): Promise<DraftNode[]>
// 1. Check relevance via Ollama
// 2. If not relevant, return empty array
// 3. Extract concepts via Ollama → DraftNode[]
// 4. Run dedup on each draft
// 5. Return drafts with similarTo field set if applicable

export async function processYouTubeVideo(
  videoUrl: string,
  config: IngestConfig,
  existingNodes: Array<{ id: string; title: string; keywords: string[] }>,
  outputDir: string,
): Promise<DraftNode[]>
// 1. Fetch transcript
// 2. Clean transcript via Ollama
// 3. Check relevance
// 4. Extract concepts
// 5. Identify timestamps for screenshots
// 6. Capture screenshots
// 7. Dedup
// 8. Return drafts with screenshots attached
```

- [ ] **Step 4: Write extract.test.ts**

Mock Ollama and yt-dlp. Test full pipeline: relevant content produces drafts, irrelevant content returns empty, screenshots attached, dedup flags similar nodes.

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git add apps/content-ingestor/src/extract/
git commit -m "feat(content-ingestor): extraction pipeline + deduplication"
```

---

### Task 8: Interactive review CLI

**Files:**
- Create: `apps/content-ingestor/src/review/interactive.ts`
- Create: `apps/content-ingestor/src/review/interactive.test.ts`

- [ ] **Step 1: Write interactive.ts**

```typescript
export async function reviewDrafts(dir: string): Promise<{ approved: number; rejected: number; skipped: number }>
// 1. Load all drafts from dir
// 2. Filter to status === 'draft'
// 3. For each draft:
//    - Print title, summary, content preview, keywords, confidence, source
//    - If has screenshots, list them
//    - If has similarTo, show warning
//    - Prompt: [a]pprove / [r]eject / [e]dit / [s]kip / [q]uit
//    - 'a': update status to 'approved'
//    - 'r': update status to 'rejected'
//    - 'e': open file in $EDITOR (or just print path for manual editing), then re-show
//    - 's': skip (leave as draft)
//    - 'q': quit review
// 4. Return counts
// Uses readline/promises for interactive input
```

- [ ] **Step 2: Write interactive.test.ts**

Mock readline input. Test: approve updates status, reject updates status, skip leaves as draft, quit exits early.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add apps/content-ingestor/src/review/
git commit -m "feat(content-ingestor): interactive review CLI"
```

---

### Task 9: Brain commit

**Files:**
- Create: `apps/content-ingestor/src/commit/commit.ts`
- Create: `apps/content-ingestor/src/commit/commit.test.ts`

- [ ] **Step 1: Write commit.ts**

```typescript
export async function commitApprovedNodes(
  ingestDir: string,
  brainNodesDir: string,
): Promise<{ committed: number; screenshotsUploaded: number }>
// 1. Load all drafts from all subdirectories of ingestDir
// 2. Filter to status === 'approved'
// 3. Convert each DraftNode to a brain Node object matching combat-knowledge.ts format:
//    {
//      id: communityId(slugified-title),
//      layer: 'community',
//      category: draft.category,
//      title: draft.title,
//      content: draft.content,
//      summary: draft.summary,
//      sources: [{ type: 'manual', title: draft.sourceChannel || 'Community Content', retrievedAt: now }],
//      refs: [],
//      version: 1,
//      keywords: draft.keywords,
//    }
// 4. Load existing community.json from brainNodesDir
// 5. Append new nodes (skip if ID already exists)
// 6. Write updated community.json
// 7. Copy screenshot files to brainNodesDir/../community/ (for future R2 upload)
// 8. Return counts
```

- [ ] **Step 2: Write commit.test.ts**

Use temp directory. Test: approved drafts become brain nodes, rejected/draft nodes skipped, duplicate IDs not added, community.json updated correctly.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add apps/content-ingestor/src/commit/
git commit -m "feat(content-ingestor): commit approved nodes to brain graph"
```

---

### Task 10: CLI entry point (Commander)

**Files:**
- Create: `apps/content-ingestor/src/cli.ts`
- Create: `apps/content-ingestor/src/cli.test.ts`

- [ ] **Step 1: Write cli.ts**

```typescript
#!/usr/bin/env tsx
import { Command } from 'commander'
import { DEFAULT_CONFIG } from './types'
// ... imports for all commands

const program = new Command()
  .name('ingest')
  .description('Ingest competitive 40K content into brain community nodes')
  .version('0.0.1')

program
  .command('channel <url>')
  .description('Crawl all videos from a YouTube channel')
  .action(async (url: string) => {
    // 1. listChannelVideos(url)
    // 2. Load/create manifest
    // 3. For each unprocessed video: processYouTubeVideo()
    // 4. Save drafts + manifest
    // 5. Print summary
  })

program
  .command('site <url>')
  .description('Crawl all articles from a website')
  .action(async (url: string) => {
    // 1. crawlSite(url) or crawlSubreddit(url) based on URL
    // 2. Load/create manifest
    // 3. For each unprocessed article: fetchArticle() + processContent()
    // 4. Save drafts + manifest
    // 5. Print summary
  })

program
  .command('url <url>')
  .description('Process a single URL')
  .action(async (url: string) => {
    // Detect type, process single item
  })

program
  .command('review')
  .description('Interactively review draft nodes')
  .action(async () => {
    // reviewDrafts(config.dataDir)
  })

program
  .command('commit')
  .description('Commit approved nodes to brain graph')
  .action(async () => {
    // commitApprovedNodes(config.dataDir, config.brainNodesDir)
  })

program
  .command('list')
  .description('List all pending drafts')
  .action(async () => {
    // Load all drafts, print table: status, title, source, confidence
  })

program.parse()
```

- [ ] **Step 2: Write cli.test.ts**

Test: `--help` outputs expected commands, `--version` outputs version. Smoke test that Commander parses without errors.

- [ ] **Step 3: Verify end-to-end with a real URL**

Run: `cd apps/content-ingestor && npx tsx src/cli.ts url "https://www.youtube.com/watch?v=<a-short-video>"`

This is a manual verification step — confirm the full pipeline works with real Ollama + yt-dlp.

- [ ] **Step 4: Run full test suite**

Run: `cd apps/content-ingestor && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/content-ingestor/src/cli.*
git commit -m "feat(content-ingestor): CLI entry point — channel, site, url, review, commit, list"
```

---

### Task 11: Smoke test with real channel

**Files:** None (manual testing)

- [ ] **Step 1: Test YouTube channel crawl**

Run: `cd apps/content-ingestor && npx tsx src/cli.ts channel "https://www.youtube.com/@TheRedPath"`

Verify:
- Video list discovered
- Transcripts fetched and cleaned
- Relevant videos identified by Ollama
- Draft nodes generated
- Screenshots captured for videos with visual examples
- Drafts written to `.local/ingest/the-red-path/`

- [ ] **Step 2: Test interactive review**

Run: `cd apps/content-ingestor && npx tsx src/cli.ts review`

Verify:
- Drafts displayed with title, summary, keywords
- Approve/reject/skip works
- Status updated in markdown files

- [ ] **Step 3: Test commit**

Run: `cd apps/content-ingestor && npx tsx src/cli.ts commit`

Verify:
- Approved nodes added to community.json
- Screenshots copied
- Duplicate IDs handled

- [ ] **Step 4: Test list**

Run: `cd apps/content-ingestor && npx tsx src/cli.ts list`

Verify: Shows pending drafts with status

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(content-ingestor): smoke test fixes from real channel testing"
```
