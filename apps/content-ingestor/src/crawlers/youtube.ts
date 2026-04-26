import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * List all videos in a YouTube channel or playlist using yt-dlp.
 * Returns an array of { url, title } objects.
 */
export async function listChannelVideos(
  channelUrl: string,
  ytdlpPath: string,
): Promise<Array<{ url: string; title: string }>> {
  const { stdout } = await execFileAsync(
    ytdlpPath,
    ['--flat-playlist', '--print', '%(url)s|||%(title)s', channelUrl],
    { maxBuffer: 50 * 1024 * 1024 },
  )

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('|||'))
    .map((line) => {
      const idx = line.indexOf('|||')
      return {
        url: line.slice(0, idx).trim(),
        title: line.slice(idx + 3).trim(),
      }
    })
}
