import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Screenshot } from '../types'

const execFileAsync = promisify(execFile)

/**
 * Parse a timestamp string in "MM:SS" or "HH:MM:SS" format to total seconds.
 */
export function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map(Number)
  if (parts.length === 2) {
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
  }
  // HH:MM:SS
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
}

/**
 * Download a 2-second clip at the given timestamp and extract a frame.
 * Falls back to downloading the video thumbnail if the clip strategy fails.
 * Returns the output path.
 */
export async function captureFrame(
  videoUrl: string,
  timestampSec: number,
  outputPath: string,
  ytdlpPath: string,
): Promise<string> {
  try {
    await execFileAsync(
      ytdlpPath,
      [
        '-o', outputPath,
        '--download-sections', `*${timestampSec}-${timestampSec + 2}`,
        '--force-keyframes-at-cuts',
        videoUrl,
      ],
      { maxBuffer: 100 * 1024 * 1024 },
    )
  } catch {
    // Fallback: download thumbnail
    await execFileAsync(
      ytdlpPath,
      [
        '--write-thumbnail',
        '--skip-download',
        '-o', outputPath,
        videoUrl,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    )
  }

  return outputPath
}

/**
 * Capture frames for multiple timestamps from a video.
 * Skips any timestamp that fails (logs a warning, does not throw).
 * Returns an array of Screenshot objects.
 */
export async function captureMultipleFrames(
  videoUrl: string,
  timestamps: Array<{ timestamp: string; description: string }>,
  outputDir: string,
  ytdlpPath: string,
): Promise<Screenshot[]> {
  mkdirSync(outputDir, { recursive: true })

  const screenshots: Screenshot[] = []

  for (const { timestamp, description } of timestamps) {
    const timestampSec = parseTimestamp(timestamp)
    const fileName = `frame-${timestampSec}s.png`
    const outputPath = join(outputDir, fileName)

    try {
      await captureFrame(videoUrl, timestampSec, outputPath, ytdlpPath)
      screenshots.push({
        file: outputPath,
        timestamp,
        timestampSec,
        caption: description,
      })
    } catch (err) {
      console.warn(`Failed to capture frame at ${timestamp} (${timestampSec}s): ${String(err)}`)
    }
  }

  return screenshots
}
