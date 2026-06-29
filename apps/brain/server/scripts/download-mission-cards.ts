/**
 * Download the 11e Chapter Approved mission card PNGs from gdmissions.app
 * into the local brain-input cache. Idempotent: skips files already present.
 *
 * The cache path lives outside the repo (`.local/` is gitignored — GW IP).
 *
 * Run from the brain server dir:
 *   cd apps/brain/server
 *   npx tsx scripts/download-mission-cards.ts
 *
 * Or from the repo root:
 *   pnpm tsx apps/brain/server/scripts/download-mission-cards.ts
 *
 * Per Rule 4: the work lives in `downloadMissionCards()` so it can be called
 * from a server endpoint or other script; this file is just a thin CLI wrapper.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { listMissionCardImages, type MissionCardImage } from '../src/lib/parsers/mission-card-urls'

const USER_AGENT =
  'tabletop-tools-brain-builder/1.0 (+https://github.com/AgamousChild/tabletop-tools; mission-card OCR pipeline)'

export interface DownloadResult {
  /** Cards already on disk and skipped. */
  skipped: number
  /** Cards downloaded fresh in this run. */
  downloaded: number
  /** Cards that errored or 404'd (e.g. missing card-back image). */
  missing: number
  /** Per-card outcome for the script to log. */
  outcomes: Array<{
    url: string
    status: 'ok' | 'skipped' | 'missing'
    bytes?: number
    error?: string
  }>
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isFile() && s.size > 0
  } catch {
    return false
  }
}

async function downloadOne(
  image: MissionCardImage,
  outDir: string,
): Promise<DownloadResult['outcomes'][number]> {
  const target = join(outDir, image.relPath)
  if (await fileExists(target)) {
    return { url: image.url, status: 'skipped' }
  }
  await mkdir(dirname(target), { recursive: true })

  try {
    const res = await fetch(image.url, { headers: { 'user-agent': USER_AGENT } })
    if (res.status === 404) {
      return { url: image.url, status: 'missing', error: '404' }
    }
    if (!res.ok) {
      return { url: image.url, status: 'missing', error: `HTTP ${res.status}` }
    }
    const buf = new Uint8Array(await res.arrayBuffer())
    await writeFile(target, buf)
    return { url: image.url, status: 'ok', bytes: buf.byteLength }
  } catch (err) {
    return {
      url: image.url,
      status: 'missing',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Download every queued image into `outDir`, mirroring the URL structure.
 *
 * Pass a custom `outDir` from tests; defaults to the canonical cache path
 * relative to the brain-server working directory.
 */
export async function downloadMissionCards(
  outDir = '.local/brain-input/mission-cards/11th',
): Promise<DownloadResult> {
  const images = listMissionCardImages()
  const outcomes: DownloadResult['outcomes'] = []
  let skipped = 0
  let downloaded = 0
  let missing = 0

  for (const img of images) {
    const outcome = await downloadOne(img, outDir)
    outcomes.push(outcome)
    if (outcome.status === 'ok') downloaded++
    else if (outcome.status === 'skipped') skipped++
    else missing++
  }

  return { skipped, downloaded, missing, outcomes }
}

async function main() {
  const outDir = process.argv[2] ?? '.local/brain-input/mission-cards/11th'
  console.log(`Downloading 11e mission cards from gdmissions.app into ${outDir} ...`)
  const result = await downloadMissionCards(outDir)
  console.log(
    `\nDone. ${result.downloaded} downloaded, ${result.skipped} already present, ${result.missing} missing/404`,
  )
  if (result.missing > 0) {
    console.log('\nMissing URLs (typically absent card-backs, OK to ignore):')
    for (const o of result.outcomes) {
      if (o.status === 'missing') {
        console.log(`  ${o.url} — ${o.error}`)
      }
    }
  }
}

// CLI entry: only run main() when invoked directly.
// `import.meta.url` ends in this file's URL when run via tsx/node.
const invokedDirectly = (() => {
  if (!process.argv[1]) return false
  const urlPath = new URL(import.meta.url).pathname.replace(/^\//, '').toLowerCase()
  const argPath = process.argv[1].replace(/\\/g, '/').toLowerCase()
  return urlPath.endsWith(argPath) || argPath.endsWith(urlPath)
})()

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
