import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Transcript, TranscriptSegment } from '../types'

const execFileAsync = promisify(execFile)

interface Json3Seg {
  utf8?: string
}

interface Json3Event {
  tStartMs?: number
  dDurationMs?: number
  segs?: Json3Seg[]
}

interface Json3File {
  events: Json3Event[]
}

/**
 * Download auto-generated subtitles for a YouTube video and parse them
 * into TranscriptSegments. Returns { original: segments, cleaned: undefined }.
 *
 * Throws if no .json3 subtitle file is found after download.
 */
export async function fetchTranscript(
  videoUrl: string,
  ytdlpPath: string,
  outputDir: string,
): Promise<Transcript> {
  mkdirSync(outputDir, { recursive: true })

  await execFileAsync(
    ytdlpPath,
    [
      '--write-auto-sub',
      '--sub-lang', 'en',
      '--sub-format', 'json3',
      '--skip-download',
      '-o', join(outputDir, '%(id)s'),
      videoUrl,
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  )

  const files = readdirSync(outputDir)
  const json3File = files.find((f) => f.endsWith('.json3'))

  if (!json3File) {
    throw new Error(`No .json3 subtitle file found in ${outputDir} for ${videoUrl}`)
  }

  const raw = readFileSync(join(outputDir, json3File), 'utf-8')
  const data = JSON.parse(raw) as Json3File

  const segments: TranscriptSegment[] = data.events
    .filter((event) => event.segs && event.segs.length > 0)
    .map((event) => {
      const text = (event.segs ?? [])
        .map((seg) => seg.utf8 ?? '')
        .join('')
        .trim()

      const startMs = event.tStartMs ?? 0
      const durationMs = event.dDurationMs ?? 0

      return {
        text,
        start: startMs / 1000,
        end: (startMs + durationMs) / 1000,
      }
    })
    .filter((seg) => seg.text.length > 0)

  return { original: segments, cleaned: undefined }
}
