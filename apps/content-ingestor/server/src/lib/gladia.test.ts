import { describe, it, expect, vi } from 'vitest'
import { submitTranscription, parseGladiaCallback } from './gladia'

describe('submitTranscription', () => {
  it('sends correct request to Gladia API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'job-123', result_url: 'https://api.gladia.io/v2/pre-recorded/job-123' }),
    })

    const result = await submitTranscription({
      youtubeUrl: 'https://www.youtube.com/watch?v=abc',
      callbackUrl: 'https://example.com/callback',
      apiKey: 'test-key',
      fetch: mockFetch,
    })

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.gladia.io/v2/pre-recorded')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      'x-gladia-key': 'test-key',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(init.body)
    expect(body).toEqual({
      audio_url: 'https://www.youtube.com/watch?v=abc',
      callback_url: 'https://example.com/callback',
      language_config: { languages: ['en'] },
    })
    expect(result).toEqual({ gladiaJobId: 'job-123' })
  })

  it('throws on non-OK response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad Request'),
    })

    await expect(
      submitTranscription({
        youtubeUrl: 'https://www.youtube.com/watch?v=abc',
        callbackUrl: 'https://example.com/callback',
        apiKey: 'test-key',
        fetch: mockFetch,
      }),
    ).rejects.toThrow('Gladia API error 400: Bad Request')
  })
})

describe('parseGladiaCallback', () => {
  it('extracts transcript from done payload', () => {
    const result = parseGladiaCallback({
      id: 'job-123',
      status: 'done',
      result: {
        transcription: {
          full_transcript: 'Hello world this is a transcript.',
        },
      },
    })

    expect(result).toEqual({
      id: 'job-123',
      status: 'done',
      transcript: 'Hello world this is a transcript.',
      error: null,
    })
  })

  it('returns error for non-done status', () => {
    const result = parseGladiaCallback({
      id: 'job-456',
      status: 'error',
      error: 'Processing failed',
    })

    expect(result).toEqual({
      id: 'job-456',
      status: 'error',
      transcript: null,
      error: 'Processing failed',
    })
  })

  it('returns error string for non-done status without error field', () => {
    const result = parseGladiaCallback({
      id: 'job-789',
      status: 'queued',
    })

    expect(result).toEqual({
      id: 'job-789',
      status: 'queued',
      transcript: null,
      error: 'Transcription not complete: queued',
    })
  })

  it('handles missing id gracefully', () => {
    expect(() => parseGladiaCallback({})).toThrow()
  })

  it('handles null/undefined input', () => {
    expect(() => parseGladiaCallback(null)).toThrow()
    expect(() => parseGladiaCallback(undefined)).toThrow()
  })
})
