import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listChannelVideos } from './youtube'

// Mock child_process at the module level
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))
vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}))

import { execFile } from 'node:child_process'

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listChannelVideos', () => {
  it('parses multi-line yt-dlp output into video objects', async () => {
    mockExecFile.mockResolvedValue({
      stdout: 'https://youtube.com/watch?v=abc|||Video One\nhttps://youtube.com/watch?v=def|||Video Two\n',
      stderr: '',
    })

    const result = await listChannelVideos('https://youtube.com/@channel', '/path/yt-dlp')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ url: 'https://youtube.com/watch?v=abc', title: 'Video One' })
    expect(result[1]).toEqual({ url: 'https://youtube.com/watch?v=def', title: 'Video Two' })
  })

  it('handles empty output', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

    const result = await listChannelVideos('https://youtube.com/@channel', '/path/yt-dlp')
    expect(result).toEqual([])
  })

  it('filters out blank lines', async () => {
    mockExecFile.mockResolvedValue({
      stdout: 'https://youtube.com/watch?v=abc|||Title A\n\n\nhttps://youtube.com/watch?v=xyz|||Title B\n',
      stderr: '',
    })

    const result = await listChannelVideos('https://youtube.com/@channel', '/path/yt-dlp')
    expect(result).toHaveLength(2)
  })

  it('splits on the ||| delimiter and trims whitespace', async () => {
    mockExecFile.mockResolvedValue({
      stdout: '  https://youtube.com/watch?v=trim|||  Trimmed Title  \n',
      stderr: '',
    })

    const result = await listChannelVideos('https://youtube.com/@channel', '/path/yt-dlp')
    expect(result[0].url).toBe('https://youtube.com/watch?v=trim')
    expect(result[0].title).toBe('Trimmed Title')
  })

  it('passes the correct yt-dlp flags and channel URL', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

    await listChannelVideos('https://youtube.com/@testchannel', '/usr/bin/yt-dlp')

    expect(mockExecFile).toHaveBeenCalledWith(
      '/usr/bin/yt-dlp',
      ['--flat-playlist', '--print', '%(url)s|||%(title)s', 'https://youtube.com/@testchannel'],
      expect.any(Object),
    )
  })

  it('skips lines that do not contain the ||| delimiter', async () => {
    mockExecFile.mockResolvedValue({
      stdout: 'https://youtube.com/watch?v=abc|||Valid Title\ninvalid-line-no-delimiter\n',
      stderr: '',
    })

    const result = await listChannelVideos('https://youtube.com/@channel', '/path/yt-dlp')
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Valid Title')
  })
})
