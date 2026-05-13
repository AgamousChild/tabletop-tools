const defaultFetch = ((...args: Parameters<typeof fetch>) =>
  fetch(...args)) as typeof fetch

export async function submitTranscription(opts: {
  youtubeUrl: string
  callbackUrl: string
  apiKey: string
  fetch?: typeof fetch
}): Promise<{ gladiaJobId: string }> {
  const fetchFn = opts.fetch ?? defaultFetch

  const response = await fetchFn('https://api.gladia.io/v2/pre-recorded', {
    method: 'POST',
    headers: {
      'x-gladia-key': opts.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: opts.youtubeUrl,
      callback_url: opts.callbackUrl,
      language_config: { languages: ['en'] },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Gladia API error ${response.status}: ${text}`)
  }

  const data = (await response.json()) as { id: string; result_url: string }
  return { gladiaJobId: data.id }
}

export function parseGladiaCallback(body: unknown): {
  id: string
  status: string
  transcript: string | null
  error: string | null
} {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid callback payload')
  }

  const payload = body as Record<string, unknown>

  if (typeof payload.id !== 'string') {
    throw new Error('Missing id in callback payload')
  }

  const id = payload.id
  const status = String(payload.status ?? 'unknown')

  if (status === 'done') {
    const result = payload.result as
      | { transcription?: { full_transcript?: string } }
      | undefined
    const transcript =
      result?.transcription?.full_transcript ?? null

    return { id, status, transcript, error: null }
  }

  const error =
    typeof payload.error === 'string'
      ? payload.error
      : `Transcription not complete: ${status}`

  return { id, status, transcript: null, error }
}
