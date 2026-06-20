/**
 * Build the physics app's slide-detection + transcript index.
 *
 * Walks $PHYSICS_SRC_DIR for subfolders containing one .mp4 + one Zoom
 * transcript file (.txt or .html with `transcript-list-item` markup).
 * For each meeting:
 *   1. Run ffmpeg scene detection to find timestamps where the slide
 *      visually changes (`select='gt(scene,SCENE_THRESHOLD)'`).
 *   2. Always include t=0 as the first slide.
 *   3. Parse the Zoom HTML transcript: each <li class="transcript-list-item">
 *      has an aria-label "Speaker, H hours M minutes S seconds, text…".
 *   4. For each slide [startSec, nextStartSec), aggregate transcript cues
 *      whose timestamps fall in that range into the slide's text.
 *   5. ffmpeg-extract one frame per slide at its startSec.
 *   6. Emit chunks.json + chunks/<meetingId>/<slideNum>.jpg.
 *
 * Usage:
 *   cd apps/physics/client
 *   pnpm chunks:build
 *
 * Override the source folder with $PHYSICS_SRC_DIR. Defaults to
 * C:/Users/micah/OneDrive/Documents/Physics.
 *
 * Tune scene sensitivity with $SCENE_THRESHOLD (default 0.3 — lower
 * captures more slides, higher captures fewer).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

const SRC_DIR = process.env.PHYSICS_SRC_DIR || 'C:/Users/micah/OneDrive/Documents/Physics'
const PUBLIC_DIR = resolve('public', 'data')
const FRAMES_DIR = join(PUBLIC_DIR, 'chunks')
const SCENE_THRESHOLD = Number(process.env.SCENE_THRESHOLD ?? 0.3)
const MIN_SLIDE_GAP_SEC = 6 // collapse slide changes closer than this together

function findTool(name, candidates) {
  for (const c of candidates) {
    try {
      execFileSync(c, ['-version'], { stdio: 'ignore' })
      return c
    } catch {
      // try next
    }
  }
  console.error(`${name} not found. Install it and re-run.`)
  process.exit(1)
}

const FFMPEG = findTool('ffmpeg', [
  'ffmpeg',
  'C:/Program Files/ffmpeg/bin/ffmpeg.exe',
  'C:/ProgramData/chocolatey/bin/ffmpeg.exe',
  'C:/Users/micah/Downloads/ffmpeg-7.1-full_build/ffmpeg-7.1-full_build/bin/ffmpeg.exe',
])
const FFPROBE = findTool('ffprobe', [
  'ffprobe',
  'C:/Program Files/ffmpeg/bin/ffprobe.exe',
  'C:/ProgramData/chocolatey/bin/ffprobe.exe',
  'C:/Users/micah/Downloads/ffmpeg-7.1-full_build/ffmpeg-7.1-full_build/bin/ffprobe.exe',
])

function slugify(name) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function durationSec(mp4Path) {
  const out = execFileSync(
    FFPROBE,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      mp4Path,
    ],
    { encoding: 'utf8' },
  )
  return parseFloat(out.trim())
}

/**
 * Run ffmpeg with the showinfo + select=gt(scene,T) filter chain. Parse
 * the stderr for `pts_time:N` lines emitted at each detected scene change.
 */
function detectScenes(mp4Path) {
  const result = execFileSync(
    FFMPEG,
    [
      '-i',
      mp4Path,
      '-vf',
      `select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
  )
  return result
}

/**
 * Run ffmpeg's scene-detection filter and return the timestamps where the
 * frame difference exceeds SCENE_THRESHOLD. ffmpeg's `showinfo` filter
 * writes one line per selected frame to STDERR — not stdout. We use
 * spawnSync so we can read stderr separately.
 */
function sceneTimestamps(mp4Path) {
  const result = spawnSync(
    FFMPEG,
    [
      '-hide_banner',
      '-nostats',
      '-i',
      mp4Path,
      '-vf',
      `select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  const stderr = result.stderr || ''
  const matches = [...stderr.matchAll(/pts_time:([\d.]+)/g)]
  return matches.map((m) => parseFloat(m[1])).filter((n) => isFinite(n))
}

function collapseSlides(times, minGap) {
  if (!times.length) return []
  const out = [times[0]]
  for (let i = 1; i < times.length; i++) {
    if (times[i] - out[out.length - 1] >= minGap) out.push(times[i])
  }
  return out
}

/**
 * Parse a Zoom HTML transcript file (`.txt` saved by Zoom is actually
 * HTML markup from their transcript viewer). Each cue is a
 *   <li class="transcript-list-item" aria-label="Speaker, H hours M minutes S seconds, …">
 *     ...
 *     <div ... class="text">FULL CUE TEXT</div>
 *   </li>
 *
 * The aria-label is truncated at ~200 chars with "…"; the inner
 * `<div class="text">` body has the full cue text. We extract the
 * timestamp from aria-label and the text from the body so chunks have
 * the complete transcript content.
 *
 * Returns [{ startSec, speaker, text }] sorted by startSec.
 */
function parseZoomTranscript(content) {
  const cues = []
  const liRe = /<li[^>]*aria-label="([^"]+)"[^>]*class="[^"]*transcript-list-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g
  let m
  while ((m = liRe.exec(content)) !== null) {
    const label = m[1]
    const body = m[2]
    // Aria-label format: "<Speaker>, <H> hours <M> minutes <S> seconds, <truncated text>"
    const tm = /^(.+?),\s*(\d+)\s*hours?\s*(\d+)\s*minutes?\s*(\d+)\s*seconds?,/i.exec(label)
    if (!tm) continue
    const speaker = tm[1].trim()
    const startSec = +tm[2] * 3600 + +tm[3] * 60 + +tm[4]
    // Full text is in <div ... class="text">…</div> inside the body
    const textMatch = /<div[^>]*class="[^"]*\btext\b[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(body)
    const rawText = textMatch ? textMatch[1] : ''
    const text = rawText
      .replace(/<[^>]+>/g, ' ') // strip nested HTML tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .replace(/…$/, '')
      .trim()
    if (text) cues.push({ startSec, speaker, text })
  }
  cues.sort((a, b) => a.startSec - b.startSec)
  return cues
}

/**
 * Plain-text transcript with no timestamps. Approximate cues by spreading
 * sentences across the video's duration uniformly by word count.
 */
function approximateCuesFromPlainText(content, totalDurationSec) {
  const sentences = content
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.?!])\s+/)
    .filter((s) => s.length > 0)
  if (!sentences.length) return []
  const totalWords = sentences.reduce((n, s) => n + s.split(/\s+/).length, 0)
  let wordOffset = 0
  return sentences.map((s) => {
    const words = s.split(/\s+/).length
    const startSec = (wordOffset / totalWords) * totalDurationSec
    wordOffset += words
    return { startSec, speaker: '', text: s }
  })
}

function parseTranscriptFile(transcriptPath, mp4DurationSec) {
  const content = readFileSync(transcriptPath, 'utf8')
  // Zoom's exported "Audio Transcript" is HTML even when saved as .txt
  if (/transcript-list-item/.test(content)) {
    return parseZoomTranscript(content)
  }
  // VTT / SRT detection
  if (/\d+:\d{2}:\d{2}[.,]\d+\s+-->\s+/.test(content)) {
    return parseSubtitlesVttSrt(content)
  }
  // Plain text fallback — approximate timestamps
  return approximateCuesFromPlainText(content, mp4DurationSec)
}

function parseSubtitlesVttSrt(content) {
  const lines = content.split(/\r?\n/)
  const cues = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = /(\d+:\d{2}:\d{2}[.,]\d+)\s+-->\s+/.exec(line)
    if (!m) continue
    const startSec = parseHmsMs(m[1])
    if (startSec == null) continue
    const textLines = []
    i++
    while (i < lines.length && lines[i].trim() !== '') {
      if (!/^(\d+|NOTE\b|STYLE\b)$/.test(lines[i].trim())) textLines.push(lines[i].trim())
      i++
    }
    const text = textLines.join(' ').trim()
    if (text) cues.push({ startSec, speaker: '', text })
  }
  return cues
}

function parseHmsMs(s) {
  const m = /^(\d+):(\d{2}):(\d{2})[.,](\d+)$/.exec(s.trim())
  if (!m) return null
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +`0.${m[4]}`
}

function extractFrame(mp4Path, atSec, outPath) {
  execFileSync(
    FFMPEG,
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      atSec.toFixed(2),
      '-i',
      mp4Path,
      '-frames:v',
      '1',
      '-vf',
      'scale=960:-1',
      outPath,
    ],
    { stdio: 'inherit' },
  )
}

/**
 * Find the first .mp4 + first transcript file inside a meeting subfolder.
 * Accepted transcript extensions: .vtt, .srt, .txt, .html.
 */
function findMeetingPair(folder) {
  const files = readdirSync(folder)
  const mp4 = files.find((f) => f.toLowerCase().endsWith('.mp4'))
  const transcript = files.find((f) => /\.(vtt|srt|txt|html)$/i.test(f) && !/\.mp4$/i.test(f))
  return {
    mp4: mp4 ? join(folder, mp4) : null,
    transcript: transcript ? join(folder, transcript) : null,
  }
}

function meetingFolders(rootDir) {
  // Subfolder layout: each subdirectory of $PHYSICS_SRC_DIR is one meeting.
  // If the root itself contains .mp4 files, treat root as a single meeting.
  const entries = readdirSync(rootDir).map((n) => ({
    name: n,
    full: join(rootDir, n),
  }))
  const subdirs = entries.filter((e) => {
    try {
      return statSync(e.full).isDirectory()
    } catch {
      return false
    }
  })
  if (subdirs.length === 0) {
    return [{ name: basename(rootDir), full: rootDir }]
  }
  return subdirs
}

async function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(`Source dir not found: ${SRC_DIR}`)
    process.exit(1)
  }
  const folders = meetingFolders(SRC_DIR)
  console.log(`Scanning ${folders.length} candidate meeting folder(s) under ${SRC_DIR}`)

  if (existsSync(PUBLIC_DIR)) rmSync(PUBLIC_DIR, { recursive: true, force: true })
  mkdirSync(PUBLIC_DIR, { recursive: true })
  mkdirSync(FRAMES_DIR, { recursive: true })

  const meetings = []
  for (const folder of folders) {
    const meetingId = slugify(folder.name)
    const meetingName = folder.name
    console.log(`\n[${meetingId}] folder: ${folder.full}`)
    const { mp4, transcript } = findMeetingPair(folder.full)
    if (!mp4) {
      console.warn(`  no .mp4 found — skipping`)
      continue
    }
    if (!transcript) {
      console.warn(`  no transcript found — skipping`)
      continue
    }
    console.log(`  mp4: ${basename(mp4)}`)
    console.log(`  transcript: ${basename(transcript)}`)

    const dur = durationSec(mp4)
    console.log(`  duration: ${dur.toFixed(0)}s`)

    console.log(`  detecting scene changes (threshold=${SCENE_THRESHOLD})…`)
    let rawSceneTimes = sceneTimestamps(mp4)
    console.log(`    raw: ${rawSceneTimes.length} scene boundaries`)
    rawSceneTimes = [0, ...rawSceneTimes]
    const slideTimes = collapseSlides(rawSceneTimes, MIN_SLIDE_GAP_SEC)
    console.log(`    collapsed (>=${MIN_SLIDE_GAP_SEC}s apart): ${slideTimes.length} slides`)

    const cues = parseTranscriptFile(transcript, dur)
    console.log(`  parsed ${cues.length} transcript cues`)

    const outFramesDir = join(FRAMES_DIR, meetingId)
    mkdirSync(outFramesDir, { recursive: true })

    const slides = []
    for (let i = 0; i < slideTimes.length; i++) {
      const startSec = slideTimes[i]
      const endSec = i + 1 < slideTimes.length ? slideTimes[i + 1] : dur
      const slideNum = i + 1
      // Aggregate transcript text whose startSec is in [startSec, endSec)
      const slideText = cues
        .filter((c) => c.startSec >= startSec && c.startSec < endSec)
        .map((c) => c.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      // Frame at the slide END (1s before the next scene change) so the
      // snapshot captures the slide's final state — all build-on bullets,
      // annotations, worked answers — not the initial bare layout.
      const grabAt = Math.max(startSec + 0.5, Math.min(dur - 1, endSec - 1))
      const frameName = `${String(slideNum).padStart(4, '0')}.jpg`
      const framePath = join(outFramesDir, frameName)
      try {
        extractFrame(mp4, grabAt, framePath)
      } catch (err) {
        console.warn(`  slide ${slideNum} frame failed: ${err.message?.slice(0, 80)}`)
        continue
      }
      slides.push({
        meetingId,
        slideNum,
        startSec: Math.floor(startSec),
        endSec: Math.ceil(endSec),
        text: slideText,
        imageUrl: `data/chunks/${meetingId}/${frameName}`,
      })
    }
    meetings.push({
      id: meetingId,
      name: meetingName,
      durationSec: Math.floor(dur),
      slides,
    })
    console.log(`  ${slides.length} slides written`)
  }

  const manifest = { builtAt: new Date().toISOString(), meetings }
  writeFileSync(join(PUBLIC_DIR, 'chunks.json'), JSON.stringify(manifest, null, 2))
  console.log(
    `\nWrote ${PUBLIC_DIR}/chunks.json (${meetings.length} meetings, ${meetings.reduce((n, m) => n + m.slides.length, 0)} slides)`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

// Suppress "unused" — keeping detectScenes around for possible future
// fixed-interval extraction mode.
void detectScenes
