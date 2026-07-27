/**
 * run.ts — Feed harvested questions through the deployed /ask endpoint.
 *
 * Usage:
 *   npx tsx scripts/eval-ask/run.ts \
 *     [--in=path.jsonl] [--out=path.jsonl] \
 *     [--concurrency=8] [--edition=11th] [--limit=N]
 *
 * Idempotent — reads the existing output file, skips questions already
 * answered, and appends the rest. `--limit` caps the number of NEW runs
 * this invocation (existing rows count against neither budget).
 *
 * Uses ?nocache=1 so each run is a real request through the whole /ask
 * pipeline, not an R2 cache hit. The point is to measure current
 * behaviour, not cached behaviour.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

import type { AskResponse, AskRun, HarvestedQuestion } from './types'

const DEFAULT_BRAIN_URL = 'https://tabletop-tools.net/brain/api'

interface RunArgs {
  inPath: string
  outPath: string
  concurrency: number
  edition: string
  brainUrl: string
  limit: number | null
}

function parseArgs(): RunArgs {
  const args = new Map<string, string>()
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) args.set(m[1]!, m[2]!)
  }
  return {
    inPath: args.get('in') ?? 'scripts/eval-ask/.data/questions.jsonl',
    outPath: args.get('out') ?? 'scripts/eval-ask/.data/answers.jsonl',
    concurrency: Number(args.get('concurrency') ?? '8'),
    edition: args.get('edition') ?? '11th',
    brainUrl: args.get('brain-url') ?? DEFAULT_BRAIN_URL,
    limit: args.get('limit') ? Number(args.get('limit')) : null,
  }
}

function loadJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf-8').trim()
  if (!text) return []
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

async function askOne(args: RunArgs, q: HarvestedQuestion): Promise<AskRun> {
  const started = Date.now()
  try {
    const url = `${args.brainUrl}/ask?edition=${args.edition}&nocache=1`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q.question }),
    })
    const durationMs = Date.now() - started
    if (!resp.ok) {
      return {
        questionId: q.id,
        question: q.question,
        subreddit: q.subreddit,
        durationMs,
        ok: false,
        error: `HTTP ${resp.status}`,
      }
    }
    const body = (await resp.json()) as AskResponse
    return {
      questionId: q.id,
      question: q.question,
      subreddit: q.subreddit,
      durationMs,
      ok: true,
      response: body,
    }
  } catch (e) {
    return {
      questionId: q.id,
      question: q.question,
      subreddit: q.subreddit,
      durationMs: Date.now() - started,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * Simple concurrency pool — kick off N in parallel, replace as they finish.
 * Not using p-limit or Bluebird to keep deps zero.
 */
async function runPool<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, idx: number) => Promise<R>,
  onDone: (result: R, idx: number) => void,
): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: concurrency }, async () => {
    for (let idx = cursor++; idx < items.length; idx = cursor++) {
      const r = await task(items[idx]!, idx)
      onDone(r, idx)
    }
  })
  await Promise.all(workers)
}

async function main(): Promise<void> {
  const args = parseArgs()
  mkdirSync(dirname(args.outPath), { recursive: true })

  const questions = loadJsonl<HarvestedQuestion>(args.inPath)
  const existing = loadJsonl<AskRun>(args.outPath)
  const doneIds = new Set(existing.map((r) => r.questionId))

  let pending = questions.filter((q) => !doneIds.has(q.id))
  if (args.limit !== null) pending = pending.slice(0, args.limit)

  console.log(`Total harvested: ${questions.length}`)
  console.log(`Already run:     ${doneIds.size}`)
  console.log(`Running now:     ${pending.length}  (concurrency=${args.concurrency})`)
  if (pending.length === 0) {
    console.log('Nothing to do.')
    return
  }

  if (!existsSync(args.outPath)) writeFileSync(args.outPath, '')

  let completed = 0
  let ok = 0
  let failed = 0
  const started = Date.now()
  const progressEvery = Math.max(10, Math.floor(pending.length / 20))

  await runPool(
    pending,
    args.concurrency,
    (q) => askOne(args, q),
    (r) => {
      appendFileSync(args.outPath, JSON.stringify(r) + '\n')
      completed++
      if (r.ok) ok++
      else failed++
      if (completed % progressEvery === 0 || completed === pending.length) {
        const elapsed = (Date.now() - started) / 1000
        const rate = completed / elapsed
        const remaining = (pending.length - completed) / rate
        console.log(
          `  ${completed}/${pending.length} (ok=${ok} fail=${failed}) — ${elapsed.toFixed(0)}s elapsed, ~${remaining.toFixed(0)}s left`,
        )
      }
    },
  )

  console.log(`\nDone: ok=${ok}, failed=${failed} → ${args.outPath}`)
  console.log('Next: npx tsx scripts/eval-ask/grade.ts')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
