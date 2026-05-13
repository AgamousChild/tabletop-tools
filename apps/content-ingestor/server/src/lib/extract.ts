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
- factionId: Faction slug if faction-specific (e.g., "space-marines", "orks")
- edition: "10th" or "11th"

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

  const response = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
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

  const data = (await response.json()) as { content: Array<{ type: string; text: string }> }
  const text = data.content[0].text

  const parsed = parseJsonArray(text)
  return parsed.filter(isValidNode)
}
