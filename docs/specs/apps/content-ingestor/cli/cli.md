# apps/content-ingestor/src/cli.ts

> Commander CLI — multi-command tool for content ingestion, review, and BCP tournament scraping.

## Prompt

Commander-based CLI (`ingest`) with 12 commands:

**Content pipeline (2-pass)**:
- `fetch <url>` — fetch all video transcripts from a YouTube channel using yt-dlp (no LLM). Saves json3 files to disk, updates crawl manifest.
- `process <channelSlug>` — run LLM extraction on saved transcripts. For each json3 file: parse transcript text, extract concepts via LLM, validate drafts, save as markdown with frontmatter. Reports clean/issues counts.
- `channel <url>` — full single-pass: fetch + process all videos from a YouTube channel.
- `site <url>` — crawl website or subreddit articles, extract concepts. Auto-detects Reddit by URL.
- `url <url>` — process single URL (YouTube, article, or Reddit post).

**Review/commit**:
- `review` — interactive CLI review (a/r/s/q) of draft nodes.
- `auto-review <channelSlug>` — AI-powered review using Gemma 2 (different model from extractor for cross-validation).
- `commit` — commit approved drafts to brain community.json.
- `list` — list all pending drafts with status icons.

**Phonetic fix**:
- `fix [channelSlug]` — scan drafts for phonetically mismatched 40K terms and fix them. Supports --dry-run and --min-confidence.

**BCP tournament scraping**:
- `bcp-scan` — scan BCP for major 40K events (100+ players, 5+ rounds) using Playwright.
- `bcp-scrape [eventId]` — scrape standings from BCP events, optionally army lists for top 10. Uses Playwright.
- `bcp-import` — prepare scraped BCP data for new-meta import.

## Dependencies

- `commander` — CLI framework
- All crawlers, extractors, reviewers, BCP modules
- `playwright` — dynamic import for BCP commands

## Contracts

- Default config: yt-dlp at `C:/R/tools/yt-dlp.exe`, data at `.local/ingest`, brain at `../brain/server/.local/brain/nodes`
- LLM: Ollama llama3.1:8b by default
- Drafts stored as markdown with YAML frontmatter
