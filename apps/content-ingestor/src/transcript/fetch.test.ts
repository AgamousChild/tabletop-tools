import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import { fetchTranscript } from './fetch'
import type { TranscriptSegment } from '../types'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))
vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}))
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}))

import { execFile } from 'node:child_process'
import * as fs from 'node:fs'

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>
const mockReaddirSync = fs.readdirSync as unknown as ReturnType<typeof vi.fn>
const mockReadFileSync = fs.readFileSync as unknown as ReturnType<typeof vi.fn>
const mockMkdirSync = fs.mkdirSync as unknown as ReturnType<typeof vi.fn>

const validJson3 = {
  events: [
    {
      tStartMs: 1000,
      dDurationMs: 2000,
      segs: [{ utf8: 'Hello ' }, { utf8: 'world' }],
    },
    {
      tStartMs: 5000,
      dDurationMs: 3000,
      segs: [{ utf8: 'Next segment' }],
    },
    {
      // Event with no segs — should be skipped
      tStartMs: 10000,
      dDurationMs: 1000,
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMkdirSync.mockReturnValue(undefined)
  mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })
})

describe('fetchTranscript', () => {
  it('constructs the correct yt-dlp command', async () => {
    mockReaddirSync.mockReturnValue(['abc123.en.json3'])
    mockReadFileSync.mockReturnValue(JSON.stringify(validJson3))

    await fetchTranscript('https://youtube.com/watch?v=abc123', '/path/yt-dlp', '/tmp/output')

    expect(mockExecFile).toHaveBeenCalledWith(
      '/path/yt-dlp',
      [
        '--write-auto-sub',
        '--sub-lang', 'en',
        '--sub-format', 'json3',
        '--skip-download',
        '-o', join('/tmp/output', '%(id)s'),
        'https://youtube.com/watch?v=abc123',
      ],
      expect.objectContaining({ maxBuffer: expect.any(Number) }),
    )
  })

  it('creates the output directory', async () => {
    mockReaddirSync.mockReturnValue(['abc123.en.json3'])
    mockReadFileSync.mockReturnValue(JSON.stringify(validJson3))

    await fetchTranscript('https://youtube.com/watch?v=abc123', '/path/yt-dlp', '/tmp/output')

    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/output', { recursive: true })
  })

  it('parses json3 events into TranscriptSegments with correct timing', async () => {
    mockReaddirSync.mockReturnValue(['abc123.en.json3'])
    mockReadFileSync.mockReturnValue(JSON.stringify(validJson3))

    const result = await fetchTranscript('https://youtube.com/watch?v=abc123', '/path/yt-dlp', '/tmp/out')

    expect(result.original).toHaveLength(2) // third event has no segs
    const first = result.original[0] as TranscriptSegment
    expect(first.text).toBe('Hello world')
    expect(first.start).toBeCloseTo(1.0)
    expect(first.end).toBeCloseTo(3.0)
    const second = result.original[1] as TranscriptSegment
    expect(second.text).toBe('Next segment')
    expect(second.start).toBeCloseTo(5.0)
    expect(second.end).toBeCloseTo(8.0)
  })

  it('returns transcript with cleaned undefined', async () => {
    mockReaddirSync.mockReturnValue(['abc123.en.json3'])
    mockReadFileSync.mockReturnValue(JSON.stringify(validJson3))

    const result = await fetchTranscript('https://youtube.com/watch?v=abc123', '/path/yt-dlp', '/tmp/out')
    expect(result.cleaned).toBeUndefined()
  })

  it('throws when no json3 file is found', async () => {
    mockReaddirSync.mockReturnValue(['abc123.vtt', 'abc123.webm'])

    await expect(
      fetchTranscript('https://youtube.com/watch?v=abc123', '/path/yt-dlp', '/tmp/out'),
    ).rejects.toThrow()
  })

  it('handles events with empty segs arrays by skipping them', async () => {
    const json3WithEmpty = {
      events: [
        { tStartMs: 0, dDurationMs: 1000, segs: [] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'Real text' }] },
      ],
    }
    mockReaddirSync.mockReturnValue(['v.en.json3'])
    mockReadFileSync.mockReturnValue(JSON.stringify(json3WithEmpty))

    const result = await fetchTranscript('https://youtube.com/watch?v=v', '/path/yt-dlp', '/tmp/out')
    expect(result.original).toHaveLength(1)
    expect(result.original[0].text).toBe('Real text')
  })
})
