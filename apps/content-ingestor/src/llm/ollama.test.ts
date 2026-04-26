import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ollamaChat,
  checkRelevance,
  cleanTranscript,
  extractConcepts,
  identifyTimestamps,
} from './ollama'
import type { LLMConfig, ContentSource } from '../types'

const config: LLMConfig = {
  provider: 'ollama',
  model: 'llama3.1:8b',
  endpoint: 'http://localhost:11434',
}

const source: ContentSource = {
  url: 'https://youtube.com/watch?v=abc123',
  type: 'youtube',
  channel: 'competitive-40k',
  fetchedAt: '2026-01-01T00:00:00.000Z',
}

function makeOllamaResponse(content: string): Response {
  return new Response(
    JSON.stringify({ message: { content } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('ollamaChat', () => {
  it('sends correct POST body format to the ollama endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(makeOllamaResponse('hello'))
    vi.stubGlobal('fetch', fetchSpy)

    await ollamaChat('user message', 'system prompt', config)

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:11434/api/chat')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('llama3.1:8b')
    expect(body.stream).toBe(false)
    expect(body.messages).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'user message' },
    ])
  })

  it('returns response.message.content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOllamaResponse('the answer')))

    const result = await ollamaChat('prompt', 'system', config)
    expect(result).toBe('the answer')
  })

  it('throws on non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    ))

    await expect(ollamaChat('prompt', 'system', config)).rejects.toThrow()
  })

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    await expect(ollamaChat('prompt', 'system', config)).rejects.toThrow('ECONNREFUSED')
  })
})

describe('checkRelevance', () => {
  it('returns true when response contains YES', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOllamaResponse('YES')))

    const result = await checkRelevance('some content', config)
    expect(result).toBe(true)
  })

  it('returns true when YES appears with surrounding text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOllamaResponse('Based on this content: YES, it is relevant.')))

    const result = await checkRelevance('some content', config)
    expect(result).toBe(true)
  })

  it('returns false when response contains NO', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOllamaResponse('NO')))

    const result = await checkRelevance('some content', config)
    expect(result).toBe(false)
  })

  it('returns false for empty response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOllamaResponse('')))

    const result = await checkRelevance('some content', config)
    expect(result).toBe(false)
  })

  it('only sends the first 2000 chars of content', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(makeOllamaResponse('YES'))
    vi.stubGlobal('fetch', fetchSpy)

    const longContent = 'A'.repeat(5000)
    await checkRelevance(longContent, config)

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string)
    const userMessage = body.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMessage.content.length).toBeLessThanOrEqual(2000)
  })
})

describe('cleanTranscript', () => {
  it('sends the transcript to ollama and returns cleaned text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOllamaResponse('cleaned transcript text')))

    const result = await cleanTranscript('raw transcript', config)
    expect(result).toBe('cleaned transcript text')
  })

  it('includes GLOSSARY in the system prompt', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(makeOllamaResponse('done'))
    vi.stubGlobal('fetch', fetchSpy)

    await cleanTranscript('transcript', config)

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string)
    const systemMsg = body.messages.find((m: { role: string }) => m.role === 'system')
    // Glossary should be included — check for a known abbreviation
    expect(systemMsg.content).toMatch(/SM|WE|CSM|T'au/)
  })
})

describe('extractConcepts', () => {
  const validConcepts = [
    {
      title: 'Aggressive Pregame Movement',
      summary: 'Use Scouts moves to pressure midboard.',
      content: 'Paragraph one. Paragraph two. Paragraph three.',
      keywords: ['scouts', 'movement', 'midboard'],
      confidence: 0.85,
      category: 'tactic',
    },
  ]

  it('parses a valid JSON array and maps to DraftNodes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOllamaResponse(JSON.stringify(validConcepts)),
    ))

    const result = await extractConcepts('content text', source, config)
    expect(result).toHaveLength(1)
    const node = result[0]
    expect(node.title).toBe('Aggressive Pregame Movement')
    expect(node.status).toBe('draft')
    expect(node.sourceUrl).toBe(source.url)
    expect(node.sourceType).toBe(source.type)
    expect(node.sourceChannel).toBe(source.channel)
    expect(node.screenshots).toEqual([])
    expect(node.confidence).toBe(0.85)
    expect(node.category).toBe('tactic')
  })

  it('sets sourceContext to the full content (no truncation)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOllamaResponse(JSON.stringify(validConcepts)),
    ))

    const longContent = 'B'.repeat(1000)
    const result = await extractConcepts(longContent, source, config)
    expect(result[0].sourceContext).toBe(longContent)
  })

  it('handles JSON wrapped in markdown code blocks', async () => {
    const wrapped = `\`\`\`json\n${JSON.stringify(validConcepts)}\n\`\`\``
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOllamaResponse(wrapped)))

    const result = await extractConcepts('content', source, config)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Aggressive Pregame Movement')
  })

  it('handles JSON wrapped in plain markdown code blocks', async () => {
    const wrapped = `\`\`\`\n${JSON.stringify(validConcepts)}\n\`\`\``
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOllamaResponse(wrapped)))

    const result = await extractConcepts('content', source, config)
    expect(result).toHaveLength(1)
  })

  it('returns empty array on malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOllamaResponse('not valid json at all'),
    ))

    const result = await extractConcepts('content', source, config)
    expect(result).toEqual([])
  })

  it('returns empty array when response is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOllamaResponse('')))

    const result = await extractConcepts('content', source, config)
    expect(result).toEqual([])
  })
})

describe('identifyTimestamps', () => {
  const validTimestamps = [
    { timestamp: '3:42', description: 'Shows deployment on ITC board' },
    { timestamp: '7:15', description: 'Movement around central objective' },
  ]

  it('parses a valid JSON array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeOllamaResponse(JSON.stringify(validTimestamps)),
    ))

    const result = await identifyTimestamps('transcript text', config)
    expect(result).toHaveLength(2)
    expect(result[0].timestamp).toBe('3:42')
    expect(result[0].description).toBe('Shows deployment on ITC board')
  })

  it('handles JSON wrapped in markdown code blocks', async () => {
    const wrapped = `\`\`\`json\n${JSON.stringify(validTimestamps)}\n\`\`\``
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOllamaResponse(wrapped)))

    const result = await identifyTimestamps('transcript', config)
    expect(result).toHaveLength(2)
  })

  it('returns empty array on bad response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOllamaResponse('no timestamps here')))

    const result = await identifyTimestamps('transcript', config)
    expect(result).toEqual([])
  })

  it('returns empty array on empty response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOllamaResponse('')))

    const result = await identifyTimestamps('transcript', config)
    expect(result).toEqual([])
  })
})
