// ── Source types ───────────────────────────────────────────────────────────

export type SourceType = 'youtube' | 'article' | 'reddit' | 'wiki' | 'pdf'

export interface ContentSource {
  url: string
  type: SourceType
  channel?: string
  site?: string
  title?: string
  fetchedAt: string
}

// ── Transcript ────────────────────────────────────────────────────────────

export interface TranscriptSegment {
  text: string
  start: number
  end: number
}

export interface Transcript {
  original: TranscriptSegment[]
  cleaned?: string
}

// ── Screenshot ────────────────────────────────────────────────────────────

export interface Screenshot {
  file: string
  timestamp: string
  timestampSec: number
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
  sourceContext: string
  similarTo?: string
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
  source: string
  sourceType: SourceType
  lastCrawlAt: string
  entries: CrawlEntry[]
}

// ── LLM ───────────────────────────────────────────────────────────────────

export type LLMProvider = 'ollama' | 'claude' | 'gemini'

export interface LLMConfig {
  provider: LLMProvider
  model: string
  endpoint: string
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'ollama',
  model: 'llama3.1:8b',
  endpoint: 'http://localhost:11434',
}

// ── Config ────────────────────────────────────────────────────────────────

export interface IngestConfig {
  llm: LLMConfig
  ytdlpPath: string
  dataDir: string
  brainNodesDir: string
}

export const DEFAULT_CONFIG: IngestConfig = {
  llm: DEFAULT_LLM_CONFIG,
  ytdlpPath: 'C:/R/tools/yt-dlp.exe',
  dataDir: '.local/ingest',
  brainNodesDir: '../brain/server/.local/brain/nodes',
}
