export interface ExtractedNode {
  title: string
  category: string
  content: string
  summary: string
  keywords: string[]
  factionId?: string
  edition?: string
}

const PROMPT_TEMPLATE = `You are extracting structured Warhammer 40,000 knowledge from content.

Source: {sourceTitle} ({sourceUrl})

For each distinct rule, ability, detachment, stratagem, enhancement, or tactical concept mentioned, create a node with:
- title: Clear, specific name
- category: One of: detachment, detachment-rule, stratagem, enhancement, army-rule, faction-ability, datasheet, tactic, ruling, worked-example
- content: Full rules text or detailed explanation in markdown
- summary: 1-2 sentence summary
- keywords: Array of relevant search terms
- factionId: Faction slug if faction-specific (e.g., "space-marines", "orks", "world-eaters")
- edition: Determine from context. 11th edition indicators: mentions of "new edition", "detachment points", "multi-detachment", "cleave" ability, content dated 2026 or later, "faction focus" reveals, references to changes from 10th. 10th edition indicators: current competitive meta discussion, existing codex rules, tournament results. If unclear, default to "10th".

Return a JSON array of nodes. Only include nodes with concrete, specific information — not vague commentary.

Content to extract from:

{text}`

function buildPrompt(text: string, sourceUrl: string, sourceTitle?: string): string {
  return PROMPT_TEMPLATE.replace('{sourceTitle}', sourceTitle ?? sourceUrl)
    .replace('{sourceUrl}', sourceUrl)
    .replace('{text}', text)
}

function parseJsonArray(text: string): unknown[] {
  // Try stripping markdown fences first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const jsonStr = fenceMatch ? fenceMatch[1] : text

  // Find the JSON array in the text
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
  if (!arrayMatch) {
    throw new Error('No JSON array found in response')
  }

  return JSON.parse(arrayMatch[0])
}

function isValidNode(node: unknown): node is ExtractedNode {
  if (typeof node !== 'object' || node === null) return false
  const n = node as Record<string, unknown>
  return (
    typeof n.title === 'string' &&
    typeof n.category === 'string' &&
    typeof n.content === 'string' &&
    typeof n.summary === 'string' &&
    Array.isArray(n.keywords)
  )
}

export async function extractNodes(opts: {
  text: string
  sourceUrl: string
  sourceTitle?: string
  apiKey: string
  fetch?: typeof fetch
}): Promise<ExtractedNode[]> {
  const fetchFn = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  // Use streaming to keep connection alive — Workers kill idle connections
  const response = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      stream: true,
      messages: [
        {
          role: 'user',
          content: buildPrompt(opts.text, opts.sourceUrl, opts.sourceTitle),
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`API error ${response.status}`)
  }

  // Read entire SSE response as text and parse events
  const rawText = await response.text()
  let text = ''
  for (const line of rawText.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const data = line.slice(6).trim()
    if (!data || data === '[DONE]') continue
    try {
      const event = JSON.parse(data)
      if (event.type === 'content_block_delta' && event.delta?.text) {
        text += event.delta.text
      }
    } catch { /* skip malformed lines */ }
  }

  console.log('Streamed text length:', text.length, 'chars')
  if (!text.trim()) {
    console.log('Empty stream result — buffer remainder:', buffer.length)
    throw new Error('Claude returned empty response from stream')
  }
  const parsed = parseJsonArray(text)
  console.log('Parsed nodes:', parsed.length)
  return parsed.filter(isValidNode)
}
