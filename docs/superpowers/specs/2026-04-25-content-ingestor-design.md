# Content Ingestor — Design Spec

**Goal:** CLI tool that crawls YouTube channels and websites, extracts competitive 40K tactical knowledge using local LLM (Ollama), and produces draft brain community nodes for human review and approval.

**Location:** `apps/content-ingestor/` — CLI-only, TypeScript, no server, no UI

---

## Sources

### YouTube Channels (10)
1. Happy Krumping Wargaming — https://www.youtube.com/@Happykrumpingwargaming007
2. Auspex Tactics — https://www.youtube.com/@auspextactics
3. PNW 40K — https://www.youtube.com/@PNW40K
4. The Red Path — https://www.youtube.com/@TheRedPath
5. Tactical Tortoise — https://www.youtube.com/@TacticalTortoise
6. Mordian Glory — https://www.youtube.com/@MordianGlory
7. Play On Tabletop — https://www.youtube.com/@PlayOnTabletop
8. Tabletop Tactics — https://www.youtube.com/@tabletoptactics
9. Tabletop Titans — https://www.youtube.com/@TabletopTitans
10. Warphammer Math — https://www.youtube.com/@warphammer-math
11. Exalted 40K — https://www.youtube.com/@Exalted40k

### Websites (6)
1. Reddit r/WarhammerCompetitive — https://www.reddit.com/r/WarhammerCompetitive
2. Goonhammer 10th Edition Hub — https://www.goonhammer.com/warhammer-40k-10th-edition/
2b. Goonhammer Start Competing — https://www.goonhammer.com/start-competing-your-guide-to-getting-better-at-warhammer-40000/
3. 1d6chan Tactics Wiki — https://1d6chan.miraheze.org/wiki/Warhammer_40,000/10th_Edition_Tactics
4. DakkaDakka Articles — https://www.dakkadakka.com/wiki/en/Articles
5. Bell of Lost Souls — https://www.belloflostsouls.net/2016/03/the-art-of-40k-basic-tactics.html
6. Adaptive Wargaming — https://adaptivewargaming.com/?blog=y

---

## Pipeline

```
1. Discover     — crawl channel/site, build list of all content URLs
2. Filter       — Ollama: "is this relevant to competitive 40K tactics?" (yes/no)
3. Fetch        — pull full content (transcript, HTML, PDF text)
4. Clean        — Ollama: fix 40K terms in transcripts ("corn buzzers" → "Khorne Berzerkers")
                  Keep original captions as second track (for timestamps)
5. Extract      — Ollama: identify tactical concepts, structure into draft nodes
6. Screenshots  — yt-dlp: auto-capture frames at key timestamps (YouTube only)
7. Draft        — write node files + screenshots to .local/ingest/<source>/
8. Review       — interactive CLI: approve/edit/reject each draft
9. Commit       — push approved nodes to brain graph + upload screenshots to R2
```

---

## CLI Commands

```bash
# Ingest sources
ingest channel <youtube-channel-url>    # crawl all videos from a channel
ingest site <website-url>               # crawl all articles from a site
ingest url <single-url>                 # process a single URL (video, article, PDF)

# Review
ingest review                           # interactive: walk through drafts, approve/edit/reject
ingest list                             # show all pending drafts with status

# Commit
ingest commit                           # push approved nodes to brain graph + R2
```

---

## Draft Node Format

Each extracted concept becomes a markdown file:

```markdown
---
status: draft | approved | rejected
title: "Deploy Hidden Against Shooting Armies"
category: tactic
keywords: [deployment, hidden, shooting, terrain]
source_url: https://www.youtube.com/watch?v=abc123
source_type: youtube | article | reddit | wiki | pdf
source_channel: "Auspex Tactics"
timestamp: "4:32"
confidence: 0.85
screenshots:
  - file: screenshots/frame-4m32s.png
    timestamp: "4:32"
    caption: "Rhinos hidden behind L-shaped ruin"
  - file: screenshots/frame-6m15s.png
    timestamp: "6:15"
    caption: "Turn 1 push — Rhinos advance"
---

## Summary
Default deployment against shooting armies: hide everything behind LOS-blocking terrain.

## Content
If the enemy has any shooting at all, deploy everything behind LOS-blocking terrain...

## Source Context
> Original text/transcript excerpt this was extracted from...
```

### File Structure

```
.local/ingest/
  auspex-tactics/
    node-001-deploy-hidden.md
    node-002-transport-hiding.md
    screenshots/
      frame-4m32s.png
      frame-6m15s.png
  goonhammer-start-competing/
    node-001-screening.md
    node-002-objective-priority.md
  manifest.json                    # tracks crawl state, processed URLs, etc.
```

---

## LLM Chain

### Provider: Ollama (local, free)
- Model: Llama 3.1 8B (default)
- Endpoint: `http://localhost:11434`
- Configurable: support Claude API and Gemini as alternatives

### Chain steps:
1. **Relevance filter** — "Is this content about competitive Warhammer 40K tactics, deployment, army building, or game strategy? Answer yes or no."
2. **Transcript cleanup** — "Fix 40K terminology, proper nouns, unit names, and grammar in this transcript. Keep the meaning identical."
3. **Concept extraction** — "Extract tactical concepts from this content. For each concept, provide: title, summary (1-2 sentences), full content (2-3 paragraphs), keywords, and confidence score. Use these examples as reference: [existing community nodes as few-shot examples]"
4. **Screenshot timestamps** — "Identify timestamps where the speaker shows a visual example (board position, deployment layout, movement diagram). Return timestamp + description."
5. **Optional refinement** — Claude/Gemini polish on approved nodes before final commit

### System prompt includes:
- Examples of existing community nodes (the 20 we have) as few-shot reference
- 40K terminology glossary (faction names, unit types, rule terms)
- Instructions to focus on actionable tactical advice, not fluff/lore/opinion

---

## Source-Specific Crawling

### YouTube
- Use yt-dlp to list all videos from a channel: `yt-dlp --flat-playlist --print url <channel-url>`
- Pull transcript: `yt-dlp --write-auto-sub --sub-lang en --skip-download <video-url>`
- Capture frame: `yt-dlp --ss <timestamp> --frames 1 <video-url>` or ffmpeg on downloaded video
- Two transcript tracks: original captions (with timestamps) + LLM-cleaned version

### Reddit
- Use Reddit JSON API: `<url>.json` for post listing
- Process post body + top-level comments (sorted by score)
- Skip low-score posts/comments
- Handle pagination for large subreddits

### Web Articles (Goonhammer, BoLS, Adaptive Wargaming)
- Fetch HTML, extract article content (strip nav, ads, sidebars)
- Use Cheerio for HTML parsing
- Follow article index pages to discover all articles
- Respect robots.txt and rate limiting

### Wiki (1d6chan, DakkaDakka)
- Parse wiki page structure (sections, subsections)
- Follow internal links to faction-specific pages
- Handle wiki markup → clean text

---

## Deduplication

Before creating a draft node, check against:
1. Existing brain community nodes — don't duplicate what's already there
2. Other draft nodes in the same ingest session — don't extract the same concept twice from different sources
3. Use title similarity + keyword overlap as the dedup check
4. If similar content exists, note it in the draft: `similar_to: "community:deploy-hidden"`

---

## Dependencies

### NPM packages
- `commander` — CLI framework
- `cheerio` — HTML parsing
- `ollama` — Ollama client library (or raw fetch to localhost:11434)
- `marked` — markdown generation

### External tools (Micah installs)
- **Ollama** — local LLM runtime + Llama 3.1 8B model
- **yt-dlp** — YouTube transcript + video download
- **ffmpeg** — frame extraction from video (yt-dlp dependency)

### Setup commands
```bash
# Install Ollama (https://ollama.ai)
# Then pull the model:
ollama pull llama3.1:8b

# Install yt-dlp
pip install yt-dlp

# ffmpeg (usually comes with yt-dlp or install separately)
```

---

## Manifest / State Tracking

`manifest.json` in `.local/ingest/` tracks:
- Which channels/sites have been crawled
- Which URLs have been processed
- Last crawl date per source
- Total nodes extracted, approved, rejected per source

This allows incremental crawling — `ingest channel <url>` only processes new videos since the last crawl.

---

## Output: Brain Integration

When `ingest commit` runs:
1. Read all `status: approved` draft files
2. Convert to brain Node objects (same schema as combat-knowledge.ts)
3. Upload screenshots to R2 (`tabletop-tools-brain/community/`)
4. Add nodes to the community layer in the brain graph
5. Rebuild graph or hot-add to existing graph
6. Update manifest with committed node IDs

---

## Future (not CLI phase)

- Web UI for review (browse drafts visually, see screenshots inline)
- Scheduled crawling (cron: check channels weekly for new content)
- Multi-language support (translate non-English content)
- Audio transcription via Whisper for videos without captions
- Claude/Gemini as primary extractor for higher quality (when budget allows)
