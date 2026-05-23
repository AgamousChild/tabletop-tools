# apps/content-ingestor/src/types.ts + index.ts

> Shared type definitions for the local CLI ingest pipeline.

## Prompt

Type definitions for the local (non-Worker) ingest pipeline. `index.ts` re-exports everything.

**Source types**: `SourceType` union (`youtube|article|reddit|wiki|pdf`), `ContentSource` (url, type, channel?, site?, title?, fetchedAt).

**Transcript**: `TranscriptSegment` (text, start, end seconds), `Transcript` (original segments, cleaned? string).

**Screenshot**: file path, timestamp string, timestampSec number, caption.

**Draft node**: `DraftNode` (status draft/approved/rejected, title, category, keywords, source metadata, confidence 0-1, screenshots, summary, content, sourceContext, similarTo?).

**Crawl manifest**: `CrawlEntry` (url, title, processedAt?, relevant?, nodeCount?), `CrawlManifest` (source, sourceType, lastCrawlAt, entries[]).

**LLM config**: `LLMProvider` (ollama/claude/gemini), `LLMConfig` (provider, model, endpoint), `DEFAULT_LLM_CONFIG` (ollama, llama3.1:8b, localhost:11434).

**Ingest config**: `IngestConfig` (llm, ytdlpPath, dataDir, brainNodesDir), `DEFAULT_CONFIG` with paths for Windows development environment.
