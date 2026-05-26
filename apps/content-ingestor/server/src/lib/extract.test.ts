import { describe, expect, it, vi } from 'vitest'

import { type ExtractedNode, extractNodes } from './extract'

const VALID_NODES: ExtractedNode[] = [
  {
    title: 'Oath of Moment',
    category: 'army-rule',
    content: 'At the start of your Command phase, select one enemy unit...',
    summary: 'Space Marines can re-roll hits and wounds against a chosen target each turn.',
    keywords: ['oath of moment', 'space marines', 'command phase', 're-roll'],
    factionId: 'space-marines',
    edition: '10th',
  },
  {
    title: 'Gladius Task Force',
    category: 'detachment',
    content: 'The Gladius Task Force represents the standard battle formation...',
    summary: 'Standard Space Marines detachment with Combat Doctrines.',
    keywords: ['gladius', 'task force', 'combat doctrines'],
    factionId: 'space-marines',
    edition: '10th',
  },
]

// extract.ts requests a streaming (SSE) response and reads the full body via
// response.text(). The mock therefore returns a Response-like object whose
// .text() resolves to a raw SSE event stream string.
function mockFetch(body: string, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  })
}

// Build an Anthropic SSE event stream that emits the given text as a single
// content_block_delta — the shape extract.ts parses out of the stream.
function claudeResponse(text: string): string {
  return [
    'event: message_start',
    `data: ${JSON.stringify({ type: 'message_start' })}`,
    '',
    'event: content_block_delta',
    `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}`,
    '',
    'event: message_stop',
    `data: ${JSON.stringify({ type: 'message_stop' })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n')
}

describe('extractNodes', () => {
  const baseOpts = {
    text: 'Some 40K content about Space Marines...',
    sourceUrl: 'https://example.com/article',
    sourceTitle: 'Space Marines Guide',
    apiKey: 'test-key',
  }

  it('returns parsed nodes from Claude API response', async () => {
    const fetchFn = mockFetch(claudeResponse(JSON.stringify(VALID_NODES)))
    const result = await extractNodes({ ...baseOpts, fetch: fetchFn })

    expect(result).toEqual(VALID_NODES)
    expect(fetchFn).toHaveBeenCalledOnce()

    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('test-key')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    expect(init.headers['content-type']).toBe('application/json')

    const body = JSON.parse(init.body)
    expect(body.model).toBe('claude-haiku-4-5-20251001')
    expect(body.max_tokens).toBe(4096)
    expect(body.stream).toBe(true)
    expect(body.messages[0].content).toContain('Space Marines Guide')
    expect(body.messages[0].content).toContain('https://example.com/article')
    expect(body.messages[0].content).toContain('Some 40K content about Space Marines...')
  })

  it('handles markdown fences around JSON', async () => {
    const wrappedJson = '```json\n' + JSON.stringify(VALID_NODES) + '\n```'
    const fetchFn = mockFetch(claudeResponse(wrappedJson))
    const result = await extractNodes({ ...baseOpts, fetch: fetchFn })

    expect(result).toEqual(VALID_NODES)
  })

  it('handles bare fences around JSON', async () => {
    const wrappedJson = '```\n' + JSON.stringify(VALID_NODES) + '\n```'
    const fetchFn = mockFetch(claudeResponse(wrappedJson))
    const result = await extractNodes({ ...baseOpts, fetch: fetchFn })

    expect(result).toEqual(VALID_NODES)
  })

  it('filters out nodes missing required fields', async () => {
    const mixedNodes = [
      VALID_NODES[0],
      { title: 'Incomplete', category: 'tactic' }, // missing content, summary, keywords
      { content: 'No title', category: 'ruling', summary: 'X', keywords: [] }, // missing title
      VALID_NODES[1],
    ]
    const fetchFn = mockFetch(claudeResponse(JSON.stringify(mixedNodes)))
    const result = await extractNodes({ ...baseOpts, fetch: fetchFn })

    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('Oath of Moment')
    expect(result[1].title).toBe('Gladius Task Force')
  })

  it('throws on API error', async () => {
    const fetchFn = mockFetch(
      JSON.stringify({ error: { type: 'authentication_error', message: 'Invalid API key' } }),
      401,
    )

    await expect(extractNodes({ ...baseOpts, fetch: fetchFn })).rejects.toThrow(/API error 401/)
  })

  it('throws when response contains no valid JSON array', async () => {
    const fetchFn = mockFetch(claudeResponse('I cannot extract any nodes from this content.'))

    await expect(extractNodes({ ...baseOpts, fetch: fetchFn })).rejects.toThrow(
      /No JSON array found/,
    )
  })

  it('uses sourceUrl as fallback when sourceTitle is omitted', async () => {
    const fetchFn = mockFetch(claudeResponse(JSON.stringify(VALID_NODES)))
    await extractNodes({
      text: 'content',
      sourceUrl: 'https://example.com/article',
      apiKey: 'test-key',
      fetch: fetchFn,
    })

    const body = JSON.parse((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.messages[0].content).toContain('https://example.com/article')
  })
})
