import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseTimestamp, captureFrame, captureMultipleFrames } from './capture'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))
vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}))
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}))
vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>()
  return actual
})

import { execFile } from 'node:child_process'
import * as fs from 'node:fs'

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>
const mockExistsSync = fs.existsSync as unknown as ReturnType<typeof vi.fn>
const mockMkdirSync = fs.mkdirSync as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockMkdirSync.mockReturnValue(undefined)
  mockExistsSync.mockReturnValue(true)
})

describe('parseTimestamp', () => {
  it('parses MM:SS format', () => {
    expect(parseTimestamp('4:32')).toBe(272)
  })

  it('parses HH:MM:SS format', () => {
    expect(parseTimestamp('1:04:32')).toBe(3872)
  })

  it('parses 0:45 as 45 seconds', () => {
    expect(parseTimestamp('0:45')).toBe(45)
  })

  it('parses 0:00 as 0 seconds', () => {
    expect(parseTimestamp('0:00')).toBe(0)
  })

  it('parses 1:00:00 as 3600 seconds', () => {
    expect(parseTimestamp('1:00:00')).toBe(3600)
  })

  it('parses 59:59 correctly', () => {
    expect(parseTimestamp('59:59')).toBe(3599)
  })
})

describe('captureFrame', () => {
  it('constructs the correct yt-dlp command with download sections', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

    await captureFrame('https://youtube.com/watch?v=abc', 272, '/tmp/frame.png', '/path/yt-dlp')

    expect(mockExecFile).toHaveBeenCalledWith(
      '/path/yt-dlp',
      expect.arrayContaining([
        '--download-sections',
        '*272-274',
        'https://youtube.com/watch?v=abc',
      ]),
      expect.any(Object),
    )
  })

  it('returns the output path on success', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

    const result = await captureFrame('https://youtube.com/watch?v=abc', 100, '/tmp/frame.png', '/path/yt-dlp')
    expect(result).toBe('/tmp/frame.png')
  })

  it('falls back to thumbnail if main download fails', async () => {
    mockExecFile
      .mockRejectedValueOnce(new Error('download failed'))
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    const result = await captureFrame('https://youtube.com/watch?v=abc', 100, '/tmp/frame.png', '/path/yt-dlp')

    expect(mockExecFile).toHaveBeenCalledTimes(2)
    // Second call should be the thumbnail fallback
    const secondCall = mockExecFile.mock.calls[1] as [string, string[]]
    expect(secondCall[1]).toContain('--write-thumbnail')
    expect(result).toBe('/tmp/frame.png')
  })
})

describe('captureMultipleFrames', () => {
  it('returns a Screenshot array for each timestamp', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

    const timestamps = [
      { timestamp: '4:32', description: 'Deployment phase' },
      { timestamp: '1:04:32', description: 'Final turn' },
    ]

    const result = await captureMultipleFrames(
      'https://youtube.com/watch?v=abc',
      timestamps,
      '/tmp/screenshots',
      '/path/yt-dlp',
    )

    expect(result).toHaveLength(2)
    expect(result[0].timestamp).toBe('4:32')
    expect(result[0].timestampSec).toBe(272)
    expect(result[0].caption).toBe('Deployment phase')
    expect(result[1].timestamp).toBe('1:04:32')
    expect(result[1].timestampSec).toBe(3872)
    expect(result[1].caption).toBe('Final turn')
  })

  it('skips timestamps where captureFrame fails (no throw)', async () => {
    mockExecFile
      .mockRejectedValueOnce(new Error('frame fail primary'))
      .mockRejectedValueOnce(new Error('frame fail fallback'))
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    const timestamps = [
      { timestamp: '0:30', description: 'Will fail' },
      { timestamp: '1:00', description: 'Will succeed' },
    ]

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await captureMultipleFrames(
      'https://youtube.com/watch?v=abc',
      timestamps,
      '/tmp/screenshots',
      '/path/yt-dlp',
    )

    expect(result).toHaveLength(1)
    expect(result[0].caption).toBe('Will succeed')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('includes the file path in each Screenshot', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

    const timestamps = [{ timestamp: '2:00', description: 'Test frame' }]

    const result = await captureMultipleFrames(
      'https://youtube.com/watch?v=abc',
      timestamps,
      '/tmp/screenshots',
      '/path/yt-dlp',
    )

    expect(result[0].file).toBeTruthy()
    expect(typeof result[0].file).toBe('string')
  })

  it('creates the output directory', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

    await captureMultipleFrames(
      'https://youtube.com/watch?v=abc',
      [{ timestamp: '0:10', description: 'x' }],
      '/tmp/frames',
      '/path/yt-dlp',
    )

    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/frames', { recursive: true })
  })

  it('returns empty array for empty timestamps input', async () => {
    const result = await captureMultipleFrames(
      'https://youtube.com/watch?v=abc',
      [],
      '/tmp/frames',
      '/path/yt-dlp',
    )

    expect(result).toEqual([])
  })
})
