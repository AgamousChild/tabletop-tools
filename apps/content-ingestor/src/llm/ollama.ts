import type { LLMConfig, ContentSource, DraftNode } from '../types'
import {
  RELEVANCE_PROMPT,
  CLEANUP_PROMPT,
  EXTRACTION_PROMPT,
  TIMESTAMP_PROMPT,
  GLOSSARY,
} from './prompts'

// ── Core chat function ────────────────────────────────────────────────────

/**
 * Send a chat message to an Ollama instance and return the response text.
 * Throws on non-200 HTTP status or network error.
 */
export async function ollamaChat(
  prompt: string,
  systemPrompt: string,
  config: LLMConfig,
): Promise<string> {
  const url = `${config.endpoint}/api/chat`
  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    stream: false,
    options: {
      num_ctx: 8192,
      num_predict: 4096,
    },
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as { message: { content: string } }
  return data.message.content
}

// ── JSON parsing helper ───────────────────────────────────────────────────

/**
 * Strip markdown code fences and parse JSON from an LLM response.
 * Returns null if the response cannot be parsed as JSON.
 */
function parseJsonFromResponse<T>(raw: string): T | null {
  if (!raw.trim()) return null

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  try {
    return JSON.parse(stripped) as T
  } catch {
    return null
  }
}

// ── High-level LLM operations ─────────────────────────────────────────────

/**
 * Determine if content is relevant to competitive 40K.
 * Sends the first 2000 characters to keep the prompt concise.
 */
export async function checkRelevance(content: string, config: LLMConfig): Promise<boolean> {
  const excerpt = content.slice(0, 2000)
  const response = await ollamaChat(excerpt, RELEVANCE_PROMPT, config)
  return /YES/i.test(response)
}

/**
 * Clean 40K terminology errors from an auto-generated transcript.
 */
export async function cleanTranscript(transcript: string, config: LLMConfig): Promise<string> {
  const systemPrompt = `${CLEANUP_PROMPT}\n\n${GLOSSARY}`
  // Chunk long transcripts to avoid truncation
  const maxChunkSize = 3000
  if (transcript.length <= maxChunkSize) {
    return ollamaChat(transcript, systemPrompt, config)
  }
  // Split on sentence boundaries
  const chunks = chunkText(transcript, maxChunkSize)
  const cleaned: string[] = []
  for (const chunk of chunks) {
    const result = await ollamaChat(chunk, systemPrompt, config)
    cleaned.push(result)
  }
  return cleaned.join(' ')
}

/** Split text into chunks at sentence boundaries */
function chunkText(text: string, maxSize: number): string[] {
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > maxSize) {
    // Find the last sentence boundary before maxSize
    let splitAt = maxSize
    const searchArea = remaining.slice(0, maxSize)
    const lastPeriod = searchArea.lastIndexOf('. ')
    const lastNewline = searchArea.lastIndexOf('\n')
    splitAt = Math.max(lastPeriod + 1, lastNewline + 1)
    if (splitAt <= 0) splitAt = maxSize // no boundary found, hard split
    chunks.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).trim()
  }
  if (remaining.length > 0) chunks.push(remaining)
  return chunks
}

// ── Extracted concept shape from LLM ─────────────────────────────────────

interface ExtractedConcept {
  title: string
  summary: string
  content: string
  keywords: string[]
  confidence: number
  category: 'tactic' | 'ruling' | 'worked-example'
}

/**
 * Extract tactical concepts from content and map them to DraftNodes.
 * Returns an empty array if the LLM response cannot be parsed.
 */
export async function extractConcepts(
  content: string,
  source: ContentSource,
  config: LLMConfig,
): Promise<DraftNode[]> {
  // Chunk long content to avoid overwhelming the LLM context window
  // Each chunk gets extracted independently, results merged
  const maxContentSize = 3000
  const allDrafts: DraftNode[] = []

  const chunks = content.length <= maxContentSize
    ? [content]
    : chunkText(content, maxContentSize)

  for (const chunk of chunks) {
    const response = await ollamaChat(chunk, EXTRACTION_PROMPT, config)
    const parsed = parseJsonFromResponse<ExtractedConcept[]>(response)

    if (!parsed || !Array.isArray(parsed)) continue

    for (const concept of parsed) {
      allDrafts.push({
        status: 'draft',
        title: concept.title,
        category: concept.category ?? 'tactic',
        keywords: concept.keywords ?? [],
        sourceUrl: source.url,
        sourceType: source.type,
        sourceChannel: source.channel,
        confidence: concept.confidence ?? 0.5,
        screenshots: [],
        summary: concept.summary ?? '',
        content: concept.content ?? '',
        sourceContext: chunk,
      })
    }
  }

  return allDrafts
}

// ── Timestamp identification ──────────────────────────────────────────────

/**
 * Identify timestamps in a transcript where visual content is shown on screen.
 * Returns an empty array if the LLM response cannot be parsed.
 */
export async function identifyTimestamps(
  transcript: string,
  config: LLMConfig,
): Promise<Array<{ timestamp: string; description: string }>> {
  const response = await ollamaChat(transcript, TIMESTAMP_PROMPT, config)
  const parsed = parseJsonFromResponse<Array<{ timestamp: string; description: string }>>(response)

  if (!parsed || !Array.isArray(parsed)) return []
  return parsed
}
