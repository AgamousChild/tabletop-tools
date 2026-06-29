/**
 * Stage the local 11e card source files into the brain's input directory.
 *
 * Copies (and PDF-extracts) the local-only source files Micah keeps outside
 * the repo into `.local/brain-input/cards/`. Idempotent — skips a file when
 * the destination already exists and has matching content (sha256). Use the
 * `--force` flag to overwrite regardless.
 *
 * Source files (all local-only, NEVER committed):
 *   - C:/R/twists.pdf
 *   - C:/Users/micah/OneDrive/Documents/2026_06_29/IMG_0001.txt  (deployment zone names)
 *   - C:/Users/micah/OneDrive/Documents/2026_06_29/IMG_0006.pdf  (secondary mission bodies)
 *
 * Outputs (all gitignored under apps/brain/server/.local/):
 *   - .local/brain-input/cards/twists.txt
 *   - .local/brain-input/cards/deployment-zone-names.txt
 *   - .local/brain-input/cards/secondary-mission-bodies.txt
 *
 * The build (build-graph.ts) silent-skips when these files are absent, so
 * other contributors can run a brain build without Micah's local sources.
 *
 * Per Rule 4, the work is exposed as `stageCardSources()` so it can be called
 * from any context; this file is just a thin CLI wrapper.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export interface CardSourceSpec {
  /** Absolute path of the source file on Micah's local disk. */
  srcAbs: string
  /** Destination path relative to the brain server root. */
  destRel: string
  /** Treatment: copy bytes as-is, or pdftotext to plain text. */
  mode: 'copy' | 'pdftotext'
}

export const DEFAULT_CARD_SOURCES: CardSourceSpec[] = [
  {
    srcAbs: 'C:/R/twists.pdf',
    destRel: '.local/brain-input/cards/twists.txt',
    mode: 'pdftotext',
  },
  {
    srcAbs: 'C:/Users/micah/OneDrive/Documents/2026_06_29/IMG_0001.txt',
    destRel: '.local/brain-input/cards/deployment-zone-names.txt',
    mode: 'copy',
  },
  {
    srcAbs: 'C:/Users/micah/OneDrive/Documents/2026_06_29/IMG_0006.pdf',
    destRel: '.local/brain-input/cards/secondary-mission-bodies.txt',
    mode: 'pdftotext',
  },
]

export interface StageResult {
  copied: number
  skipped: number
  missing: number
  failed: number
}

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
}

async function pdfToText(src: string): Promise<string> {
  // Use `pdftotext` from the system PATH. `-raw` keeps the text in reading
  // order which is what the parsers expect.
  const result = spawnSync('pdftotext', ['-raw', src, '-'], { encoding: 'utf-8' })
  if (result.status !== 0) {
    const stderr = result.stderr || ''
    throw new Error(`pdftotext failed for ${src}: ${stderr}`)
  }
  return result.stdout
}

async function loadDest(dest: string): Promise<string | null> {
  if (!existsSync(dest)) return null
  return await readFile(dest, 'utf-8')
}

/**
 * Stage the listed sources. Idempotent: skips files when destination content
 * already matches the source content hash. Pass `{ force: true }` to overwrite
 * unconditionally.
 */
export async function stageCardSources(
  specs: CardSourceSpec[] = DEFAULT_CARD_SOURCES,
  opts: { force?: boolean; log?: (msg: string) => void } = {},
): Promise<StageResult> {
  const log = opts.log ?? ((msg) => console.log(msg))
  let copied = 0
  let skipped = 0
  let missing = 0
  let failed = 0

  for (const spec of specs) {
    const destAbs = resolve(spec.destRel)
    if (!existsSync(spec.srcAbs)) {
      log(`  MISSING: ${spec.srcAbs} (skipped — staging script will retry on next run)`)
      missing++
      continue
    }

    try {
      let content: string
      if (spec.mode === 'pdftotext') {
        content = await pdfToText(spec.srcAbs)
      } else {
        const buf = await readFile(spec.srcAbs)
        content = buf.toString('utf-8')
      }

      if (!opts.force) {
        const existing = await loadDest(destAbs)
        if (existing !== null && sha256(existing) === sha256(content)) {
          log(`  SKIP   (hash match): ${spec.destRel}`)
          skipped++
          continue
        }
      }

      await mkdir(dirname(destAbs), { recursive: true })
      if (spec.mode === 'copy') {
        await copyFile(spec.srcAbs, destAbs)
      } else {
        await writeFile(destAbs, content, 'utf-8')
      }
      log(`  STAGE  ${spec.srcAbs} → ${spec.destRel}`)
      copied++
    } catch (err) {
      log(`  FAIL   ${spec.srcAbs}: ${err instanceof Error ? err.message : err}`)
      failed++
    }
  }

  return { copied, skipped, missing, failed }
}

async function main() {
  const force = process.argv.includes('--force')
  console.log(`Staging card sources into .local/brain-input/cards/${force ? ' (--force)' : ''}\n`)
  const result = await stageCardSources(DEFAULT_CARD_SOURCES, { force })
  console.log(
    `\nDone. ${result.copied} staged, ${result.skipped} unchanged, ${result.missing} missing source files, ${result.failed} failed`,
  )
  if (result.failed > 0) process.exit(1)
}

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
