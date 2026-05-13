import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import type { DraftNode, ContentSource, IngestConfig } from '../types'

// ── Module mocks (before any imports that use them) ───────────────────────

vi.mock('../llm/ollama', () => ({
  checkRelevance: vi.fn(),
  extractConcepts: vi.fn(),
  identifyTimestamps: vi.fn(),
}))

vi.mock('../transcript/fetch', () => ({
  fetchTranscript: vi.fn(),
}))

vi.mock('../transcript/clean', () => ({
  cleanTranscriptText: vi.fn(),
}))

vi.mock('../screenshots/capture', () => ({
  captureMultipleFrames: vi.fn(),
}))

import { processContent, processYouTubeVideo } from './extract'
import { checkRelevance, extractConcepts, identifyTimestamps } from '../llm/ollama'
import { fetchTranscript } from '../transcript/fetch'
import { cleanTranscriptText } from '../transcript/clean'
import { captureMultipleFrames } from '../screenshots/capture'

// ── Fixtures ──────────────────────────────────────────────────────────────

const CONFIG: IngestConfig = {
  llm: { provider: 'ollama', model: 'llama3.1:8b', endpoint: 'http://localhost:11434' },
  ytdlpPath: '/usr/local/bin/yt-dlp',
  dataDir: '/tmp/ingest',
  brainNodesDir: '/tmp/brain/nodes',
}

const SOURCE: ContentSource = {
  url: 'https://example.com/article',
  type: 'article',
  title: 'Tactics Article',
  fetchedAt: '2026-04-24T00:00:00.000Z',
}

function makeDraft(overrides: Partial<DraftNode> = {}): DraftNode {
  return {
    status: 'draft',
    title: 'Fishing for Crits',
    category: 'tactic',
    keywords: ['fishing', 'reroll', 'sustained hits'],
    sourceUrl: 'https://example.com',
    sourceType: 'article',
    confidence: 0.85,
    screenshots: [],
    summary: 'Reroll to fish for 6s.',
    content: 'Detailed explanation.',
    sourceContext: 'Source context here.',
    ...overrides,
  }
}

const EXISTING_NODES = [
  {
    id: 'community:fishing-for-crits',
    title: 'Fishing for Crits',
    keywords: ['fishing', 'reroll', 'sustained hits'],
  },
]

// ── processContent ────────────────────────────────────────────────────────

describe('processContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns empty array when content is not relevant', async () => {
    vi.mocked(checkRelevance).mockResolvedValue(false)

    const result = await processContent(SOURCE, 'irrelevant content', CONFIG, [])

    expect(checkRelevance).toHaveBeenCalledOnce()
    expect(extractConcepts).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('returns draft nodes when content is relevant', async () => {
    const draft = makeDraft()
    vi.mocked(checkRelevance).mockResolvedValue(true)
    vi.mocked(extractConcepts).mockResolvedValue([draft])

    const result = await processContent(SOURCE, 'competitive 40K tactics content', CONFIG, [])

    expect(checkRelevance).toHaveBeenCalledWith('competitive 40K tactics content', CONFIG.llm)
    expect(extractConcepts).toHaveBeenCalledWith('competitive 40K tactics content', SOURCE, CONFIG.llm)
    expect(result).toHaveLength(1)
    expect(result[0]!.title).toBe('Fishing for Crits')
  })

  it('sets similarTo on a draft when dedup finds a match', async () => {
    // Draft title exactly matches existing node
    const draft = makeDraft({ title: 'Fishing for Crits', keywords: ['fishing', 'reroll'] })
    vi.mocked(checkRelevance).mockResolvedValue(true)
    vi.mocked(extractConcepts).mockResolvedValue([draft])

    const result = await processContent(SOURCE, 'some content', CONFIG, EXISTING_NODES)

    expect(result[0]!.similarTo).toBe('community:fishing-for-crits')
  })

  it('leaves similarTo undefined for a unique draft', async () => {
    const draft = makeDraft({ title: 'Completely Novel Topic', keywords: ['unique', 'new'] })
    vi.mocked(checkRelevance).mockResolvedValue(true)
    vi.mocked(extractConcepts).mockResolvedValue([draft])

    const result = await processContent(SOURCE, 'some content', CONFIG, EXISTING_NODES)

    expect(result[0]!.similarTo).toBeUndefined()
  })

  it('handles extractConcepts returning an empty array', async () => {
    vi.mocked(checkRelevance).mockResolvedValue(true)
    vi.mocked(extractConcepts).mockResolvedValue([])

    const result = await processContent(SOURCE, 'relevant but no concepts', CONFIG, [])

    expect(result).toEqual([])
  })

  it('processes multiple drafts and deduplicates each independently', async () => {
    const draft1 = makeDraft({ title: 'Fishing for Crits', keywords: ['fishing', 'reroll'] })
    const draft2 = makeDraft({ title: 'Novel Concept', keywords: ['unique', 'new'] })
    vi.mocked(checkRelevance).mockResolvedValue(true)
    vi.mocked(extractConcepts).mockResolvedValue([draft1, draft2])

    const result = await processContent(SOURCE, 'some content', CONFIG, EXISTING_NODES)

    expect(result).toHaveLength(2)
    expect(result[0]!.similarTo).toBe('community:fishing-for-crits')
    expect(result[1]!.similarTo).toBeUndefined()
  })
})

// ── processYouTubeVideo ───────────────────────────────────────────────────

describe('processYouTubeVideo', () => {
  const VIDEO_URL = 'https://www.youtube.com/watch?v=abc123'
  const TITLE = 'Competitive 40K Tactics Guide'
  const OUTPUT_DIR = '/tmp/ingest/video'

  const TRANSCRIPT = {
    original: [{ text: 'Fishing for crits is key in competitive play.', start: 0, end: 5 }],
    cleaned: 'Fishing for crits is key in competitive 40K play.',
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('calls fetchTranscript, cleanTranscriptText, and processContent in sequence', async () => {
    vi.mocked(fetchTranscript).mockResolvedValue(TRANSCRIPT)
    vi.mocked(cleanTranscriptText).mockResolvedValue(TRANSCRIPT)
    vi.mocked(checkRelevance).mockResolvedValue(false)
    vi.mocked(identifyTimestamps).mockResolvedValue([])
    vi.mocked(captureMultipleFrames).mockResolvedValue([])

    await processYouTubeVideo(VIDEO_URL, TITLE, CONFIG, [], OUTPUT_DIR)

    expect(fetchTranscript).toHaveBeenCalledWith(VIDEO_URL, CONFIG.ytdlpPath, OUTPUT_DIR)
    expect(cleanTranscriptText).toHaveBeenCalledWith(TRANSCRIPT, CONFIG.llm)
    expect(checkRelevance).toHaveBeenCalled()
  })

  it('returns empty array if content is not relevant', async () => {
    vi.mocked(fetchTranscript).mockResolvedValue(TRANSCRIPT)
    vi.mocked(cleanTranscriptText).mockResolvedValue(TRANSCRIPT)
    vi.mocked(checkRelevance).mockResolvedValue(false)
    vi.mocked(identifyTimestamps).mockResolvedValue([])
    vi.mocked(captureMultipleFrames).mockResolvedValue([])

    const result = await processYouTubeVideo(VIDEO_URL, TITLE, CONFIG, [], OUTPUT_DIR)

    expect(result).toEqual([])
  })

  it('attaches screenshots to the first draft when drafts are returned', async () => {
    const draft = makeDraft({ title: 'Tactic Alpha', sourceType: 'youtube' })
    const screenshots = [
      { file: '/tmp/frame-30s.png', timestamp: '0:30', timestampSec: 30, caption: 'Key moment' },
    ]

    vi.mocked(fetchTranscript).mockResolvedValue(TRANSCRIPT)
    vi.mocked(cleanTranscriptText).mockResolvedValue(TRANSCRIPT)
    vi.mocked(checkRelevance).mockResolvedValue(true)
    vi.mocked(extractConcepts).mockResolvedValue([draft])
    vi.mocked(identifyTimestamps).mockResolvedValue([{ timestamp: '0:30', description: 'Key moment' }])
    vi.mocked(captureMultipleFrames).mockResolvedValue(screenshots)

    const result = await processYouTubeVideo(VIDEO_URL, TITLE, CONFIG, [], OUTPUT_DIR)

    expect(result).toHaveLength(1)
    expect(result[0]!.screenshots).toEqual(screenshots)
  })

  it('calls captureMultipleFrames with the screenshots subdirectory', async () => {
    const draft = makeDraft({ sourceType: 'youtube' })
    vi.mocked(fetchTranscript).mockResolvedValue(TRANSCRIPT)
    vi.mocked(cleanTranscriptText).mockResolvedValue(TRANSCRIPT)
    vi.mocked(checkRelevance).mockResolvedValue(true)
    vi.mocked(extractConcepts).mockResolvedValue([draft])
    vi.mocked(identifyTimestamps).mockResolvedValue([{ timestamp: '1:00', description: 'Demo' }])
    vi.mocked(captureMultipleFrames).mockResolvedValue([])

    await processYouTubeVideo(VIDEO_URL, TITLE, CONFIG, [], OUTPUT_DIR)

    expect(captureMultipleFrames).toHaveBeenCalledWith(
      VIDEO_URL,
      [{ timestamp: '1:00', description: 'Demo' }],
      join(OUTPUT_DIR, 'screenshots'),
      CONFIG.ytdlpPath,
    )
  })

  it('builds ContentSource with youtube type, url, and title', async () => {
    vi.mocked(fetchTranscript).mockResolvedValue(TRANSCRIPT)
    vi.mocked(cleanTranscriptText).mockResolvedValue(TRANSCRIPT)
    vi.mocked(checkRelevance).mockResolvedValue(true)
    vi.mocked(extractConcepts).mockResolvedValue([])
    vi.mocked(identifyTimestamps).mockResolvedValue([])
    vi.mocked(captureMultipleFrames).mockResolvedValue([])

    await processYouTubeVideo(VIDEO_URL, TITLE, CONFIG, [], OUTPUT_DIR)

    const sourceArg = vi.mocked(extractConcepts).mock.calls[0]?.[1]
    expect(sourceArg?.url).toBe(VIDEO_URL)
    expect(sourceArg?.type).toBe('youtube')
    expect(sourceArg?.title).toBe(TITLE)
  })
})
