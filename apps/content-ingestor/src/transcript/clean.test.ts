import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanTranscriptText } from './clean'
import type { Transcript, LLMConfig } from '../types'

vi.mock('../llm/ollama', () => ({
  cleanTranscript: vi.fn(),
}))

import { cleanTranscript } from '../llm/ollama'

const mockCleanTranscript = cleanTranscript as unknown as ReturnType<typeof vi.fn>

const config: LLMConfig = {
  provider: 'ollama',
  model: 'llama3.1:8b',
  endpoint: 'http://localhost:11434',
}

const transcript: Transcript = {
  original: [
    { text: 'Hello', start: 0, end: 1 },
    { text: 'world', start: 1, end: 2 },
    { text: 'of 40K', start: 2, end: 3 },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cleanTranscriptText', () => {
  it('joins all segments into a single space-separated string and calls cleanTranscript', async () => {
    mockCleanTranscript.mockResolvedValue('Hello world of 40K (cleaned)')

    await cleanTranscriptText(transcript, config)

    expect(mockCleanTranscript).toHaveBeenCalledWith('Hello world of 40K', config)
  })

  it('returns transcript with cleaned field set to the LLM result', async () => {
    mockCleanTranscript.mockResolvedValue('Cleaned text here')

    const result = await cleanTranscriptText(transcript, config)
    expect(result.cleaned).toBe('Cleaned text here')
  })

  it('preserves original segments in the returned transcript', async () => {
    mockCleanTranscript.mockResolvedValue('cleaned')

    const result = await cleanTranscriptText(transcript, config)
    expect(result.original).toEqual(transcript.original)
  })

  it('handles transcript with a single segment', async () => {
    mockCleanTranscript.mockResolvedValue('Single')

    const single: Transcript = { original: [{ text: 'Single', start: 0, end: 1 }] }
    const result = await cleanTranscriptText(single, config)

    expect(mockCleanTranscript).toHaveBeenCalledWith('Single', config)
    expect(result.cleaned).toBe('Single')
  })

  it('handles empty transcript gracefully', async () => {
    mockCleanTranscript.mockResolvedValue('')

    const empty: Transcript = { original: [] }
    const result = await cleanTranscriptText(empty, config)

    expect(mockCleanTranscript).toHaveBeenCalledWith('', config)
    expect(result.cleaned).toBe('')
  })
})
